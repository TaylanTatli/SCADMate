use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::oneshot;

const INFERENCE_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_RENDER_IMAGES: usize = 7;
const MAX_RENDER_IMAGE_BYTES: usize = 4 * 1024 * 1024;
const MAX_REASONING_CHARS: usize = 12_000;

type CancellationSender = oneshot::Sender<()>;
static AI_CANCELLATIONS: OnceLock<Mutex<HashMap<String, CancellationSender>>> = OnceLock::new();

fn ai_cancellations() -> &'static Mutex<HashMap<String, CancellationSender>> {
    AI_CANCELLATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderedImage {
    name: String,
    data_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InferenceInput {
    system_prompt: String,
    user_prompt: String,
    #[serde(default)]
    images: Vec<RenderedImage>,
    model: Option<String>,
    executable: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InferenceOutput {
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompatibleInferenceInput {
    request_id: String,
    endpoint: String,
    api_key: String,
    model: String,
    system_prompt: String,
    user_prompt: String,
    #[serde(default)]
    images: Vec<RenderedImage>,
}

#[tauri::command]
fn cancel_ai_request(request_id: String) -> bool {
    ai_cancellations()
        .lock()
        .ok()
        .and_then(|mut cancellations| cancellations.remove(&request_id))
        .map(|sender| sender.send(()).is_ok())
        .unwrap_or(false)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CliStatus {
    installed: bool,
    connected: bool,
    detail: String,
}

#[derive(Debug, Deserialize)]
struct CompatibleResponse {
    choices: Option<Vec<CompatibleChoice>>,
    error: Option<CompatibleError>,
}

#[derive(Debug, Deserialize)]
struct CompatibleChoice {
    message: Option<CompatibleMessage>,
}

#[derive(Debug, Deserialize)]
struct CompatibleMessage {
    content: Option<String>,
    reasoning: Option<String>,
    reasoning_content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CompatibleError {
    message: Option<String>,
}

fn strip_markdown_fences(value: &str) -> String {
    let trimmed = value.trim();
    if !trimmed.starts_with("```") || !trimmed.ends_with("```") {
        return trimmed.to_string();
    }

    let without_opening = trimmed
        .split_once('\n')
        .map(|(_, rest)| rest)
        .unwrap_or(trimmed);
    without_opening
        .strip_suffix("```")
        .unwrap_or(without_opening)
        .trim()
        .to_string()
}

fn collect_reasoning_text(value: &serde_json::Value, output: &mut Vec<String>) {
    match value {
        serde_json::Value::String(text) if !text.trim().is_empty() => {
            output.push(text.trim().to_string());
        }
        serde_json::Value::Array(values) => {
            for value in values {
                collect_reasoning_text(value, output);
            }
        }
        serde_json::Value::Object(object) => {
            for key in ["summary", "text"] {
                if let Some(value) = object.get(key) {
                    collect_reasoning_text(value, output);
                }
            }
        }
        _ => {}
    }
}

fn codex_reasoning_summary(stdout: &[u8]) -> Option<String> {
    let mut summaries = Vec::new();
    for line in String::from_utf8_lossy(stdout).lines() {
        let Ok(event) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let Some(item) = event.get("item") else {
            continue;
        };
        if item.get("type").and_then(serde_json::Value::as_str) != Some("reasoning") {
            continue;
        }
        collect_reasoning_text(item, &mut summaries);
    }

    summaries.dedup();
    let combined = summaries.join("\n\n");
    if combined.is_empty() {
        None
    } else {
        Some(combined.chars().take(MAX_REASONING_CHARS).collect())
    }
}

fn configured_executable(configured: Option<&str>, fallback: &str) -> String {
    configured
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn process_detail(stdout: &[u8], stderr: &[u8]) -> String {
    format!(
        "{}{}",
        String::from_utf8_lossy(stdout),
        String::from_utf8_lossy(stderr)
    )
    .trim()
    .to_string()
}

fn command_error(tool: &str, error: std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::NotFound {
        format!(
            "{tool} was not found. Install it on your system or configure its executable path in Settings."
        )
    } else {
        format!("{tool} could not be started: {error}")
    }
}

fn validate_inference(system_prompt: &str, user_prompt: &str) -> Result<(), String> {
    if system_prompt.trim().is_empty() || user_prompt.trim().is_empty() {
        Err("AI prompt sections must not be empty.".to_string())
    } else {
        Ok(())
    }
}

fn safe_image_name(value: &str, index: usize) -> String {
    let sanitized = value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || *character == '-' || *character == '_'
        })
        .take(40)
        .collect::<String>();
    if sanitized.is_empty() {
        format!("view-{index}")
    } else {
        sanitized
    }
}

fn write_render_images(directory: &Path, images: &[RenderedImage]) -> Result<Vec<PathBuf>, String> {
    if images.len() > MAX_RENDER_IMAGES {
        return Err(format!(
            "At most {MAX_RENDER_IMAGES} active-project render images may be sent."
        ));
    }

    let mut paths = Vec::with_capacity(images.len());
    for (index, image) in images.iter().enumerate() {
        let (metadata, encoded) = image
            .data_url
            .split_once(',')
            .ok_or_else(|| "A rendered image was not a valid data URL.".to_string())?;
        if metadata != "data:image/png;base64" {
            return Err("Only base64 PNG render images are accepted.".to_string());
        }
        let bytes = BASE64
            .decode(encoded)
            .map_err(|_| "A rendered image contained invalid base64 data.".to_string())?;
        if bytes.len() > MAX_RENDER_IMAGE_BYTES {
            return Err(format!(
                "A rendered image exceeded the {} MiB limit.",
                MAX_RENDER_IMAGE_BYTES / 1024 / 1024
            ));
        }
        let path = directory.join(format!("{}.png", safe_image_name(&image.name, index)));
        fs::write(&path, bytes).map_err(|error| error.to_string())?;
        paths.push(path);
    }
    Ok(paths)
}

fn secret_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.scadmate.desktop", "openai-compatible-api-key")
        .map_err(|error| error.to_string())
}

async fn local_cli_status(
    executable: Option<String>,
    fallback: &str,
    args: &[&str],
    connected_phrase: Option<&str>,
) -> Result<CliStatus, String> {
    let executable = configured_executable(executable.as_deref(), fallback);
    let output = match Command::new(&executable).args(args).output().await {
        Ok(output) => output,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(CliStatus {
                installed: false,
                connected: false,
                detail: command_error(fallback, error),
            });
        }
        Err(error) => return Err(command_error(fallback, error)),
    };
    let detail = process_detail(&output.stdout, &output.stderr);
    let connected = output.status.success()
        && connected_phrase
            .map(|phrase| detail.to_lowercase().contains(phrase))
            .unwrap_or(true);

    Ok(CliStatus {
        installed: true,
        connected,
        detail: if detail.is_empty() {
            if connected {
                format!("{fallback} installation and sign-in are ready.")
            } else {
                format!("{fallback} is installed, but no active session was found.")
            }
        } else {
            detail
        },
    })
}

async fn spawn_login(
    executable: Option<String>,
    fallback: &str,
    args: &[&str],
) -> Result<(), String> {
    let executable = configured_executable(executable.as_deref(), fallback);
    let mut child = Command::new(executable)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| command_error(fallback, error))?;

    tauri::async_runtime::spawn(async move {
        let _ = child.wait().await;
    });
    Ok(())
}

#[tauri::command]
async fn codex_status(executable: Option<String>) -> Result<CliStatus, String> {
    local_cli_status(executable, "codex", &["login", "status"], Some("logged in")).await
}

#[tauri::command]
async fn codex_login(executable: Option<String>) -> Result<(), String> {
    spawn_login(executable, "codex", &["login"]).await
}

#[tauri::command]
async fn codex_generate(input: InferenceInput) -> Result<InferenceOutput, String> {
    validate_inference(&input.system_prompt, &input.user_prompt)?;
    let executable = configured_executable(input.executable.as_deref(), "codex");
    let workspace = tempfile::tempdir().map_err(|error| error.to_string())?;
    let output_path = workspace.path().join("response.txt");
    let image_paths = write_render_images(workspace.path(), &input.images)?;

    let mut command = Command::new(executable);
    command.args([
        "exec",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--color",
        "never",
        "--json",
        "--cd",
    ]);
    command.arg(workspace.path());
    command.arg("--output-last-message").arg(&output_path);
    for path in &image_paths {
        command.arg("--image").arg(path);
    }
    if let Some(model) = input
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        command.args(["--model", model.trim()]);
    }
    command
        .arg("-")
        .current_dir(workspace.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| command_error("codex", error))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex stdin could not be opened.".to_string())?;
    stdin
        .write_all(format!("{}\n\n{}", input.system_prompt, input.user_prompt).as_bytes())
        .await
        .map_err(|error| format!("Codex prompt could not be sent: {error}"))?;
    drop(stdin);

    let output = tokio::time::timeout(INFERENCE_TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| "Codex inference exceeded the 120 second limit.".to_string())?
        .map_err(|error| command_error("codex", error))?;
    if !output.status.success() {
        let detail = process_detail(&output.stdout, &output.stderr);
        return Err(if detail.is_empty() {
            "Codex inference failed.".to_string()
        } else {
            detail
        });
    }

    let response = fs::read_to_string(output_path).map_err(|error| error.to_string())?;
    let response = strip_markdown_fences(&response);
    if response.is_empty() {
        return Err("Codex returned an empty response.".to_string());
    }
    Ok(InferenceOutput {
        content: response,
        reasoning: codex_reasoning_summary(&output.stdout),
    })
}

#[tauri::command]
async fn claude_status(executable: Option<String>) -> Result<CliStatus, String> {
    local_cli_status(executable, "claude", &["auth", "status", "--text"], None).await
}

#[tauri::command]
async fn claude_login(executable: Option<String>) -> Result<(), String> {
    spawn_login(executable, "claude", &["auth", "login"]).await
}

#[tauri::command]
async fn claude_generate(input: InferenceInput) -> Result<InferenceOutput, String> {
    validate_inference(&input.system_prompt, &input.user_prompt)?;
    let executable = configured_executable(input.executable.as_deref(), "claude");
    let workspace = tempfile::tempdir().map_err(|error| error.to_string())?;
    let image_paths = write_render_images(workspace.path(), &input.images)?;
    let mut command = Command::new(executable);
    command
        .args([
            "--bare",
            "--print",
            "--output-format",
            "text",
            "--no-session-persistence",
            "--tools",
            if image_paths.is_empty() { "" } else { "Read" },
            "--strict-mcp-config",
            "--system-prompt",
            &input.system_prompt,
        ])
        .current_dir(workspace.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(model) = input
        .model
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        command.args(["--model", model.trim()]);
    }

    let image_note = image_paths
        .iter()
        .map(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("render.png")
        })
        .collect::<Vec<_>>()
        .join(", ");
    let prompt = if image_note.is_empty() {
        input.user_prompt
    } else {
        format!(
            "{}\n\nThe active-project render images are local read-only files in the current directory: {image_note}. Read every image before deciding.",
            input.user_prompt
        )
    };
    command
        .arg("Use the complete task context supplied on stdin and follow the response contract.");

    let mut child = command
        .spawn()
        .map_err(|error| command_error("claude", error))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Claude Code stdin could not be opened.".to_string())?;
    stdin
        .write_all(prompt.as_bytes())
        .await
        .map_err(|error| format!("Claude Code prompt could not be sent: {error}"))?;
    drop(stdin);

    let output = tokio::time::timeout(INFERENCE_TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| "Claude Code inference exceeded the 120 second limit.".to_string())?
        .map_err(|error| format!("Claude Code inference failed: {error}"))?;
    if !output.status.success() {
        let detail = process_detail(&output.stdout, &output.stderr);
        return Err(if detail.is_empty() {
            "Claude Code inference failed.".to_string()
        } else {
            detail
        });
    }

    let response = strip_markdown_fences(&String::from_utf8_lossy(&output.stdout));
    if response.is_empty() {
        return Err("Claude Code returned an empty response.".to_string());
    }
    Ok(InferenceOutput {
        content: response,
        reasoning: None,
    })
}

#[tauri::command]
async fn compatible_generate(input: CompatibleInferenceInput) -> Result<InferenceOutput, String> {
    if input.endpoint.trim().is_empty()
        || input.api_key.trim().is_empty()
        || input.model.trim().is_empty()
    {
        return Err("AI endpoint, API key, and model are required.".to_string());
    }
    validate_inference(&input.system_prompt, &input.user_prompt)?;

    let user_content = if input.images.is_empty() {
        serde_json::Value::String(input.user_prompt)
    } else {
        let mut parts = vec![serde_json::json!({
            "type": "text",
            "text": input.user_prompt
        })];
        for image in input.images {
            parts.push(serde_json::json!({
                "type": "image_url",
                "image_url": { "url": image.data_url }
            }));
        }
        serde_json::Value::Array(parts)
    };
    let payload = serde_json::json!({
        "model": input.model.trim(),
        "temperature": 0.2,
        "messages": [
            { "role": "system", "content": input.system_prompt },
            { "role": "user", "content": user_content }
        ]
    });

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(INFERENCE_TIMEOUT)
        .build()
        .map_err(|error| format!("AI client initialization failed: {error}"))?;
    let request_id = input.request_id;
    let (cancel_sender, cancel_receiver) = oneshot::channel();
    if let Ok(mut cancellations) = ai_cancellations().lock() {
        if let Some(previous) = cancellations.insert(request_id.clone(), cancel_sender) {
            let _ = previous.send(());
        }
    }
    let request = async {
        let response = client
            .post(input.endpoint.trim())
            .bearer_auth(input.api_key.trim())
            .json(&payload)
            .send()
            .await
            .map_err(|error| format!("AI request failed: {error}"))?;
        let status = response.status();
        let result = response
            .json::<CompatibleResponse>()
            .await
            .map_err(|error| format!("AI endpoint returned an unreadable response: {error}"))?;
        Ok::<_, String>((status, result))
    };
    let request_result = tokio::select! {
        result = request => result,
        _ = cancel_receiver => Err("Stopped.".to_string()),
    };
    if let Ok(mut cancellations) = ai_cancellations().lock() {
        cancellations.remove(&request_id);
    }
    let (status, result) = request_result?;

    if !status.is_success() {
        return Err(result
            .error
            .and_then(|error| error.message)
            .unwrap_or_else(|| format!("AI request failed with HTTP {status}.")));
    }

    let message = result
        .choices
        .and_then(|choices| choices.into_iter().next())
        .and_then(|choice| choice.message);
    let response = message
        .as_ref()
        .and_then(|message| message.content.as_deref())
        .map(|value| strip_markdown_fences(&value))
        .unwrap_or_default();
    if response.is_empty() {
        return Err("The AI returned an empty response.".to_string());
    }
    let reasoning = message
        .and_then(|message| message.reasoning.or(message.reasoning_content))
        .map(|value| value.trim().chars().take(MAX_REASONING_CHARS).collect())
        .filter(|value: &String| !value.is_empty());
    Ok(InferenceOutput {
        content: response,
        reasoning,
    })
}

#[tauri::command]
async fn save_api_key(api_key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let entry = secret_entry()?;
        if api_key.is_empty() {
            let _ = entry.delete_credential();
            Ok(())
        } else {
            entry
                .set_password(&api_key)
                .map_err(|error| error.to_string())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn load_api_key() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let entry = secret_entry()?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            codex_status,
            codex_login,
            codex_generate,
            claude_status,
            claude_login,
            claude_generate,
            compatible_generate,
            cancel_ai_request,
            save_api_key,
            load_api_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running SCADmate");
}

#[cfg(test)]
mod tests {
    use super::{
        codex_reasoning_summary, configured_executable, safe_image_name, strip_markdown_fences,
        validate_inference,
    };

    #[test]
    fn removes_accidental_markdown_fences() {
        assert_eq!(
            strip_markdown_fences("```openscad\ncube([10, 10, 10]);\n```"),
            "cube([10, 10, 10]);"
        );
    }

    #[test]
    fn rejects_empty_prompt_sections() {
        assert!(validate_inference("policy", "request").is_ok());
        assert!(validate_inference("", "request").is_err());
        assert!(validate_inference("policy", " ").is_err());
    }

    #[test]
    fn configured_cli_path_overrides_default_command() {
        assert_eq!(
            configured_executable(Some(" /opt/tools/codex "), "codex"),
            "/opt/tools/codex"
        );
        assert_eq!(configured_executable(Some(""), "codex"), "codex");
    }

    #[test]
    fn extracts_reasoning_summaries_from_codex_jsonl() {
        let jsonl = concat!(
            "{\"type\":\"item.completed\",\"item\":{\"type\":\"reasoning\",\"summary\":[{\"text\":\"Checked the requested dimensions.\"}]}}\n",
            "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"cube(10);\"}}\n",
            "{\"type\":\"item.completed\",\"item\":{\"type\":\"reasoning\",\"text\":\"Verified printable wall thickness.\"}}\n"
        );
        assert_eq!(
            codex_reasoning_summary(jsonl.as_bytes()).as_deref(),
            Some("Checked the requested dimensions.\n\nVerified printable wall thickness.")
        );
    }

    #[test]
    fn render_image_names_are_sanitized() {
        assert_eq!(safe_image_name("../../front view", 0), "frontview");
        assert_eq!(safe_image_name("!@#", 2), "view-2");
    }
}

import { invoke, isTauri } from "@tauri-apps/api/core";

export interface NativeCliStatus {
  installed: boolean;
  connected: boolean;
  detail: string;
}

interface NativeRenderedView {
  name: string;
  dataUrl: string;
}

interface NativeInferenceInput {
  systemPrompt: string;
  userPrompt: string;
  images: NativeRenderedView[];
  model?: string;
  executable?: string;
}

export interface NativeInferenceResult {
  content: string;
  reasoning?: string;
}

export function isDesktopRuntime(): boolean {
  return isTauri();
}

export async function nativeCodexStatus(
  executable?: string,
): Promise<NativeCliStatus> {
  return invoke<NativeCliStatus>("codex_status", {
    executable: executable || null,
  });
}

export async function nativeCodexLogin(executable?: string): Promise<void> {
  return invoke("codex_login", { executable: executable || null });
}

export async function nativeCodexGenerate(
  input: NativeInferenceInput,
): Promise<NativeInferenceResult> {
  return invoke<NativeInferenceResult>("codex_generate", { input });
}

export async function nativeClaudeStatus(
  executable?: string,
): Promise<NativeCliStatus> {
  return invoke<NativeCliStatus>("claude_status", {
    executable: executable || null,
  });
}

export async function nativeClaudeLogin(executable?: string): Promise<void> {
  return invoke("claude_login", { executable: executable || null });
}

export async function nativeClaudeGenerate(
  input: NativeInferenceInput,
): Promise<NativeInferenceResult> {
  return invoke<NativeInferenceResult>("claude_generate", { input });
}

export async function nativeCompatibleGenerate(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  images: NativeRenderedView[];
}): Promise<NativeInferenceResult> {
  return invoke<NativeInferenceResult>("compatible_generate", { input });
}

export async function nativeLoadApiKey(): Promise<string | null> {
  return invoke<string | null>("load_api_key");
}

export async function nativeSaveApiKey(apiKey: string): Promise<void> {
  return invoke("save_api_key", { apiKey });
}

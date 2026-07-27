import { FormEvent, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { AIProviderType, AISettings } from "../types";
import {
  isDesktopRuntime,
  nativeClaudeLogin,
  nativeClaudeStatus,
  nativeCodexLogin,
  nativeCodexStatus,
} from "../native/tauri";

interface SettingsDialogProps {
  settings: AISettings;
  onClose: () => void;
  onSave: (settings: AISettings) => void;
}

type LocalProvider = "codex" | "claude-code";
type CliConnection = "idle" | "checking" | "connected" | "disconnected";

const providerCopy = {
  codex: {
    name: "Codex",
    subscription: "ChatGPT subscription",
    command: "codex",
    modelLabel: "Codex model",
    modelPlaceholder: "Leave blank to use the Codex default",
  },
  "claude-code": {
    name: "Claude Code",
    subscription: "Claude Pro / Max",
    command: "claude",
    modelLabel: "Claude model",
    modelPlaceholder: "Leave blank to use the Claude Code default",
  },
} as const;

export function SettingsDialog({
  settings,
  onClose,
  onSave,
}: SettingsDialogProps) {
  const [draft, setDraft] = useState(settings);
  const [showKey, setShowKey] = useState(false);
  const [connection, setConnection] = useState<CliConnection>("idle");
  const [connectionDetail, setConnectionDetail] = useState(
    "Installation and sign-in have not been checked yet.",
  );

  const selectProvider = (provider: AIProviderType) => {
    setDraft((current) => ({ ...current, provider }));
    setConnection("idle");
    setConnectionDetail("Installation and sign-in have not been checked yet.");
  };

  const executableFor = (provider: LocalProvider) =>
    provider === "codex" ? draft.codexExecutable : draft.claudeExecutable;

  const checkLocalProvider = async (provider: LocalProvider) => {
    const copy = providerCopy[provider];
    setConnection("checking");
    setConnectionDetail(`Checking ${copy.name} installation and sign-in…`);
    if (!isDesktopRuntime()) {
      setConnection("disconnected");
      setConnectionDetail(
        "Local CLI providers are available in the SCADmate desktop app.",
      );
      return;
    }

    try {
      const status =
        provider === "codex"
          ? await nativeCodexStatus(executableFor(provider))
          : await nativeClaudeStatus(executableFor(provider));
      setConnection(status.connected ? "connected" : "disconnected");
      setConnectionDetail(status.detail);
    } catch (error) {
      setConnection("disconnected");
      setConnectionDetail(
        error instanceof Error
          ? error.message
          : `${copy.name} could not start.`,
      );
    }
  };

  const startLogin = async (provider: LocalProvider) => {
    const copy = providerCopy[provider];
    setConnection("checking");
    setConnectionDetail(`Starting the ${copy.name} sign-in flow…`);
    if (!isDesktopRuntime()) {
      setConnection("disconnected");
      setConnectionDetail(
        "Subscription sign-in is available in the SCADmate desktop app.",
      );
      return;
    }

    try {
      if (provider === "codex") {
        await nativeCodexLogin(executableFor(provider));
      } else {
        await nativeClaudeLogin(executableFor(provider));
      }
      setConnectionDetail(
        `Complete the ${copy.name} sign-in opened in your browser, then check the connection.`,
      );
      window.setTimeout(() => void checkLocalProvider(provider), 3000);
    } catch (error) {
      setConnection("disconnected");
      setConnectionDetail(
        error instanceof Error
          ? error.message
          : `${copy.name} sign-in could not be started.`,
      );
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(draft);
  };

  const compatibleComplete = Boolean(
    draft.endpoint.trim() && draft.apiKey.trim() && draft.model.trim(),
  );
  const localProvider =
    draft.provider === "codex" || draft.provider === "claude-code"
      ? draft.provider
      : undefined;
  const localCopy = localProvider ? providerCopy[localProvider] : undefined;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="settings-dialog provider-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Model connection</span>
            <h2 id="settings-title">AI provider settings</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={17} />
          </button>
        </div>
        <p className="dialog-intro">
          Use a local Codex or Claude Code installation, or configure an
          OpenAI-compatible API.
        </p>

        <div className="output-language-setting">
          <label htmlFor="output-language">AI output language</label>
          <select
            id="output-language"
            value={draft.outputLanguage}
            onChange={(event) =>
              setDraft({
                ...draft,
                outputLanguage: event.target
                  .value as AISettings["outputLanguage"],
              })
            }
          >
            <option value="auto">Match the latest request</option>
            <option value="en">English</option>
            <option value="tr">Turkish</option>
          </select>
          <small>
            Controls AI-written chat responses, review notes, and OpenSCAD
            comments. It does not change the application interface.
          </small>
        </div>

        <div
          className="provider-choice"
          role="radiogroup"
          aria-label="AI provider"
        >
          <button
            type="button"
            role="radio"
            aria-checked={draft.provider === "codex"}
            className={draft.provider === "codex" ? "selected" : ""}
            onClick={() => selectProvider("codex")}
          >
            <span className="provider-icon codex">
              <Bot size={18} />
            </span>
            <span>
              <strong>Codex</strong>
              <small>ChatGPT</small>
            </span>
            <i />
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={draft.provider === "claude-code"}
            className={draft.provider === "claude-code" ? "selected" : ""}
            onClick={() => selectProvider("claude-code")}
          >
            <span className="provider-icon claude">
              <Sparkles size={17} />
            </span>
            <span>
              <strong>Claude Code</strong>
              <small>Pro / Max</small>
            </span>
            <i />
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={draft.provider === "openai-compatible"}
            className={draft.provider === "openai-compatible" ? "selected" : ""}
            onClick={() => selectProvider("openai-compatible")}
          >
            <span className="provider-icon compatible">
              <KeyRound size={17} />
            </span>
            <span>
              <strong>Compatible API</strong>
              <small>URL + key</small>
            </span>
            <i />
          </button>
        </div>

        {localProvider && localCopy ? (
          <div className="provider-fields">
            <div className={`codex-connection ${connection}`}>
              <span className="connection-indicator">
                {connection === "connected" ? (
                  <CheckCircle2 size={18} />
                ) : localProvider === "codex" ? (
                  <Bot size={18} />
                ) : (
                  <Sparkles size={18} />
                )}
              </span>
              <div>
                <strong>
                  {connection === "connected"
                    ? `${localCopy.name} connected`
                    : connection === "checking"
                      ? "Checking connection"
                      : `${localCopy.name} · ${localCopy.subscription}`}
                </strong>
                <small>{connectionDetail}</small>
              </div>
            </div>

            <label>
              Executable <em>Optional</em>
              <input
                value={executableFor(localProvider)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    ...(localProvider === "codex"
                      ? { codexExecutable: event.target.value }
                      : { claudeExecutable: event.target.value }),
                  })
                }
                placeholder={`Uses “${localCopy.command}” from PATH`}
              />
            </label>
            <label>
              {localCopy.modelLabel} <em>Optional</em>
              <input
                value={
                  localProvider === "codex"
                    ? draft.codexModel
                    : draft.claudeModel
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    ...(localProvider === "codex"
                      ? { codexModel: event.target.value }
                      : { claudeModel: event.target.value }),
                  })
                }
                placeholder={localCopy.modelPlaceholder}
              />
            </label>
            <div className="codex-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => void startLogin(localProvider)}
              >
                {localProvider === "codex" ? (
                  <Bot size={15} />
                ) : (
                  <Sparkles size={15} />
                )}
                Connect with subscription
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => void checkLocalProvider(localProvider)}
              >
                <RefreshCw size={14} />
                Check installation and sign-in
              </button>
            </div>
            <div className="security-note">
              <ShieldCheck size={17} />
              SCADmate does not bundle this tool. It uses the{" "}
              {localCopy.command} command installed on your system and the
              tool&apos;s secure session storage; OAuth credentials are never
              exposed to the WebView.
            </div>
          </div>
        ) : (
          <div className="provider-fields">
            <label>
              Chat completions endpoint
              <input
                type="url"
                required
                value={draft.endpoint}
                onChange={(event) =>
                  setDraft({ ...draft, endpoint: event.target.value })
                }
                placeholder="https://api.example.com/v1/chat/completions"
              />
            </label>
            <label>
              API key
              <div className="key-input">
                <input
                  type={showKey ? "text" : "password"}
                  required
                  autoComplete="off"
                  value={draft.apiKey}
                  onChange={(event) =>
                    setDraft({ ...draft, apiKey: event.target.value })
                  }
                  placeholder="Stored in the operating system credential vault"
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowKey((visible) => !visible)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <label>
              Model
              <input
                required
                value={draft.model}
                onChange={(event) =>
                  setDraft({ ...draft, model: event.target.value })
                }
                placeholder="Model name used by your provider"
              />
            </label>
            <div
              className={`security-note ${compatibleComplete ? "complete" : ""}`}
            >
              <ShieldCheck size={17} />
              The API key is stored in the operating system credential vault and
              sent only to the endpoint above.
            </div>
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            Save provider
          </button>
        </div>
      </form>
    </div>
  );
}

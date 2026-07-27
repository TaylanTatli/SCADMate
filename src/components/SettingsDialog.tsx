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
    subscription: "ChatGPT aboneliği",
    command: "codex",
    modelLabel: "Codex modeli",
    modelPlaceholder: "Boş bırakırsanız Codex varsayılanı kullanılır",
  },
  "claude-code": {
    name: "Claude Code",
    subscription: "Claude Pro / Max",
    command: "claude",
    modelLabel: "Claude modeli",
    modelPlaceholder: "Boş bırakırsanız Claude Code varsayılanı kullanılır",
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
    "Kurulum ve oturum henüz kontrol edilmedi.",
  );

  const selectProvider = (provider: AIProviderType) => {
    setDraft((current) => ({ ...current, provider }));
    setConnection("idle");
    setConnectionDetail("Kurulum ve oturum henüz kontrol edilmedi.");
  };

  const executableFor = (provider: LocalProvider) =>
    provider === "codex" ? draft.codexExecutable : draft.claudeExecutable;

  const checkLocalProvider = async (provider: LocalProvider) => {
    const copy = providerCopy[provider];
    setConnection("checking");
    setConnectionDetail(`${copy.name} kurulumu ve oturumu kontrol ediliyor…`);
    if (!isDesktopRuntime()) {
      setConnection("disconnected");
      setConnectionDetail(
        "Yerel CLI sağlayıcıları SCADmate masaüstü uygulamasında kullanılabilir.",
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
        error instanceof Error ? error.message : `${copy.name} başlatılamadı.`,
      );
    }
  };

  const startLogin = async (provider: LocalProvider) => {
    const copy = providerCopy[provider];
    setConnection("checking");
    setConnectionDetail(`${copy.name} giriş akışı başlatılıyor…`);
    if (!isDesktopRuntime()) {
      setConnection("disconnected");
      setConnectionDetail(
        "Abonelik girişi SCADmate masaüstü uygulamasında kullanılabilir.",
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
        `Tarayıcıda açılan ${copy.name} girişini tamamlayın, ardından bağlantıyı kontrol edin.`,
      );
      window.setTimeout(() => void checkLocalProvider(provider), 3000);
    } catch (error) {
      setConnection("disconnected");
      setConnectionDetail(
        error instanceof Error
          ? error.message
          : `${copy.name} girişi başlatılamadı.`,
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
            <span className="eyebrow">Model bağlantısı</span>
            <h2 id="settings-title">AI sağlayıcı ayarları</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Ayarları kapat"
          >
            <X size={17} />
          </button>
        </div>
        <p className="dialog-intro">
          Yerel Codex veya Claude Code kurulumunuzu kullanın; alternatif olarak
          compatible API bilgilerini girin.
        </p>

        <div
          className="provider-choice"
          role="radiogroup"
          aria-label="AI sağlayıcısı"
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
                    ? `${localCopy.name} bağlı`
                    : connection === "checking"
                      ? "Bağlantı kontrol ediliyor"
                      : `${localCopy.name} · ${localCopy.subscription}`}
                </strong>
                <small>{connectionDetail}</small>
              </div>
            </div>

            <label>
              Çalıştırılabilir dosya <em>Opsiyonel</em>
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
                placeholder={`PATH üzerindeki “${localCopy.command}” komutu kullanılır`}
              />
            </label>
            <label>
              {localCopy.modelLabel} <em>Opsiyonel</em>
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
                Abonelik ile bağlan
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => void checkLocalProvider(localProvider)}
              >
                <RefreshCw size={14} />
                Kurulumu ve oturumu kontrol et
              </button>
            </div>
            <div className="security-note">
              <ShieldCheck size={17} />
              SCADmate bu aracı paketlemez. Sisteminizde kurulu{" "}
              {localCopy.command} komutunu ve aracın kendi güvenli oturum
              deposunu kullanır; OAuth bilgileri WebView’a aktarılmaz.
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
                  placeholder="İşletim sisteminin güvenli kasasında saklanır"
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowKey((visible) => !visible)}
                  aria-label={
                    showKey ? "API anahtarını gizle" : "API anahtarını göster"
                  }
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
                placeholder="Sağlayıcınızın model adı"
              />
            </label>
            <div
              className={`security-note ${compatibleComplete ? "complete" : ""}`}
            >
              <ShieldCheck size={17} />
              API key işletim sisteminin güvenli kasasında tutulur ve yalnızca
              yukarıdaki endpoint’e gönderilir.
            </div>
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            İptal
          </button>
          <button type="submit" className="button primary">
            Sağlayıcıyı kaydet
          </button>
        </div>
      </form>
    </div>
  );
}

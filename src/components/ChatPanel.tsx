import { FormEvent, useState } from "react";
import { ArrowUp, Bot, KeyRound, Sparkles } from "lucide-react";
import type { ChatMessage } from "../types";

interface ChatPanelProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  configured: boolean;
  onSend: (request: string) => void;
  onOpenSettings: () => void;
}

export function ChatPanel({
  messages,
  isGenerating,
  configured,
  onSend,
  onOpenSettings,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const request = draft.trim();
    if (!request || isGenerating) return;
    setDraft("");
    onSend(request);
  };

  return (
    <section className="panel chat-panel" aria-label="AI chat">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">AI copilot</span>
          <h2>Build by describing</h2>
        </div>
        <span
          className={`status-dot ${configured ? "ready" : ""}`}
          title="AI configuration status"
        />
      </div>

      <div className="messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="bot-mark">
              <Bot size={21} />
            </div>
            <h3>What should we make?</h3>
            <p>
              Describe a printable part, enclosure, jig, or fixture. SCADmate
              will write the complete OpenSCAD model.
            </p>
            <button
              className="prompt-suggestion"
              onClick={() =>
                setDraft(
                  "Create a desktop enclosure for a 4.3-inch display with two USB openings and M2.5 screw posts.",
                )
              }
            >
              <Sparkles size={15} />
              Try a display enclosure
            </button>
          </div>
        ) : (
          messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <span>{message.role === "user" ? "You" : "SCADmate"}</span>
              <p>{message.content}</p>
            </article>
          ))
        )}
        {isGenerating && (
          <article className="message assistant thinking">
            <span>SCADmate</span>
            <div className="thinking-dots">
              <i />
              <i />
              <i />
            </div>
          </article>
        )}
      </div>

      <div className="chat-compose-wrap">
        {!configured && (
          <button className="config-callout" onClick={onOpenSettings}>
            <KeyRound size={14} />
            Add your AI endpoint to generate models
          </button>
        )}
        <form className="chat-compose" onSubmit={submit}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Describe a model or request a change…"
            rows={3}
            aria-label="Model request"
          />
          <button
            type="submit"
            className="send-button"
            disabled={!draft.trim() || isGenerating}
            aria-label="Send request"
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        </form>
        <small>Enter to send · Shift + Enter for a new line</small>
      </div>
    </section>
  );
}

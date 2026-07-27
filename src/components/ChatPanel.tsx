import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  History,
  KeyRound,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import type { ChatMessage, ProjectSummary } from "../types";

interface ChatPanelProps {
  activeProjectId: string;
  projects: ProjectSummary[];
  messages: ChatMessage[];
  isGenerating: boolean;
  configured: boolean;
  onSend: (request: string) => void;
  onSelectProject: (projectId: string) => void;
  onOpenSettings: () => void;
}

export function ChatPanel({
  activeProjectId,
  projects,
  messages,
  isGenerating,
  configured,
  onSend,
  onSelectProject,
  onOpenSettings,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [showHistory, setShowHistory] = useState(false);

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
          <h2>{showHistory ? "Conversations" : "Build by describing"}</h2>
        </div>
        <div className="chat-heading-actions">
          <button
            className="conversation-toggle"
            onClick={() => setShowHistory((visible) => !visible)}
            aria-expanded={showHistory}
            title={
              showHistory ? "Back to current conversation" : "Conversations"
            }
          >
            {showHistory ? <ArrowLeft size={14} /> : <History size={14} />}
            <span>{showHistory ? "Back" : "Chats"}</span>
          </button>
          <span
            className={`status-dot ${configured ? "ready" : ""}`}
            title="AI configuration status"
          />
        </div>
      </div>

      <div className="messages">
        {showHistory ? (
          <div className="conversation-list">
            {projects.map((project) => (
              <button
                key={project.id}
                className={`conversation-item ${
                  project.id === activeProjectId ? "active" : ""
                }`}
                onClick={() => onSelectProject(project.id)}
                disabled={isGenerating}
              >
                <MessageSquare size={15} />
                <span>
                  <strong>{project.name}</strong>
                  <small>
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(project.updatedAt)}
                  </small>
                </span>
              </button>
            ))}
          </div>
        ) : messages.length === 0 ? (
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

      <div className={`chat-compose-wrap ${showHistory ? "hidden" : ""}`}>
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

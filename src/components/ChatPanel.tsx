import { FormEvent, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  BrainCircuit,
  History,
  KeyRound,
  MessageSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import type { ChatMessage, ProjectSummary } from "../types";

interface ChatPanelProps {
  activeProjectId: string;
  projectName: string;
  projects: ProjectSummary[];
  messages: ChatMessage[];
  isGenerating: boolean;
  configured: boolean;
  onNewProject: () => void;
  onSend: (request: string) => void;
  onSelectProject: (projectId: string) => void;
  onOpenSettings: () => void;
}

export function ChatPanel({
  activeProjectId,
  projectName,
  projects,
  messages,
  isGenerating,
  configured,
  onNewProject,
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
        <div className="conversation-heading">
          <span className="eyebrow">
            {showHistory ? "Conversation history" : "AI conversation"}
          </span>
          <h2>{showHistory ? "Recent conversations" : projectName}</h2>
        </div>
        <div className="chat-heading-actions">
          <button
            className="conversation-action primary"
            onClick={onNewProject}
            disabled={isGenerating}
            title="Start a new conversation"
          >
            <Plus size={14} />
            <span>New</span>
          </button>
          <button
            className="conversation-action"
            onClick={() => setShowHistory((visible) => !visible)}
            aria-expanded={showHistory}
            title={showHistory ? "Back to current conversation" : "History"}
          >
            {showHistory ? <ArrowLeft size={14} /> : <History size={14} />}
            <span>{showHistory ? "Back" : "History"}</span>
          </button>
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
            <article
              key={message.id}
              className={`message ${message.role} ${message.status ?? "done"}`}
            >
              <span>{message.role === "user" ? "You" : "SCADmate"}</span>
              <div className="message-content">{message.content}</div>
              {message.role === "assistant" && message.reasoning && (
                <details className="message-reasoning">
                  <summary>
                    <BrainCircuit size={13} />
                    Reasoning summary
                  </summary>
                  <div>{message.reasoning}</div>
                </details>
              )}
              {message.status === "sending" && (
                <div className="message-progress" aria-label="AI is working">
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  Working
                </div>
              )}
            </article>
          ))
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

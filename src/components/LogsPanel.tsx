import { ChevronDown, ChevronUp, TerminalSquare, Trash2 } from "lucide-react";
import type { RenderLog } from "../types";

interface LogsPanelProps {
  logs: RenderLog[];
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
}

export function LogsPanel({ logs, open, onToggle, onClear }: LogsPanelProps) {
  const errors = logs.filter((log) => log.stream === "error").length;
  const warnings = logs.filter((log) => log.stream === "warning").length;

  return (
    <section
      className={`logs-panel ${open ? "open" : ""}`}
      aria-label="OpenSCAD logs"
    >
      <div className="logs-toolbar">
        <button className="logs-toggle" onClick={onToggle}>
          <TerminalSquare size={15} />
          OpenSCAD output
          {errors > 0 && (
            <span className="log-badge error">{errors} errors</span>
          )}
          {warnings > 0 && (
            <span className="log-badge warning">{warnings} warnings</span>
          )}
          {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
        {open && (
          <button
            className="icon-button compact"
            onClick={onClear}
            title="Clear logs"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {open && (
        <div className="log-output">
          {logs.length === 0 ? (
            <span className="muted">Render output will appear here.</span>
          ) : (
            logs.map((log) => (
              <div key={log.id} className={`log-line ${log.stream}`}>
                <span>{log.stream}</span>
                <pre>{log.text}</pre>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

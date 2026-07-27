import type { RenderStatus, RevisionHistory } from "../types";
import { commitRevision } from "./revisions";

export class ActiveWorkflow {
  private readonly controller = new AbortController();
  private state: "active" | "stopped" | "completed" = "active";

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get active(): boolean {
    return this.state === "active";
  }

  stop(): void {
    if (!this.active) return;
    this.state = "stopped";
    this.controller.abort();
  }

  complete(): void {
    if (this.active) this.state = "completed";
  }

  assertActive(): void {
    if (!this.active) throw createAbortError();
  }
}

export function createAbortError(): DOMException {
  return new DOMException("Stopped", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function preserveStoppedSource(
  history: RevisionHistory,
  candidateSource: string | undefined,
  lastValidSource: string,
): RevisionHistory {
  let nextHistory = history;
  if (candidateSource && candidateSource !== nextHistory.present.source) {
    nextHistory = commitRevision(
      nextHistory,
      candidateSource,
      "AI source preserved after stop",
    );
  }
  if (lastValidSource !== nextHistory.present.source) {
    nextHistory = commitRevision(
      nextHistory,
      lastValidSource,
      "Restored last valid source after stop",
    );
  }
  return nextHistory;
}

export function stoppedRenderStatus(hasValidPreview: boolean): RenderStatus {
  return hasValidPreview ? "success" : "idle";
}

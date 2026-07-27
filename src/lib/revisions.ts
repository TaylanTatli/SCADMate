import type { RevisionHistory, SourceRevision } from "../types";

const revision = (source: string, label: string): SourceRevision => ({
  id: crypto.randomUUID(),
  source,
  label,
  createdAt: Date.now(),
});

export function createHistory(
  source: string,
  label = "Sample project",
): RevisionHistory {
  return { past: [], present: revision(source, label), future: [] };
}

export function commitRevision(
  history: RevisionHistory,
  source: string,
  label: string,
): RevisionHistory {
  if (source === history.present.source) return history;
  return {
    past: [...history.past, history.present],
    present: revision(source, label),
    future: [],
  };
}

export function undoRevision(history: RevisionHistory): RevisionHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoRevision(history: RevisionHistory): RevisionHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

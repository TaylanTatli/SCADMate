export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: Exclude<MessageRole, "system">;
  content: string;
  reasoning?: string;
  createdAt: number;
  status?: "sending" | "done" | "error";
}

export type AIProviderType = "codex" | "claude-code" | "openai-compatible";

export interface AISettings {
  provider: AIProviderType;
  codexModel: string;
  codexExecutable: string;
  claudeModel: string;
  claudeExecutable: string;
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface SourceRevision {
  id: string;
  source: string;
  label: string;
  createdAt: number;
}

export interface RevisionHistory {
  past: SourceRevision[];
  present: SourceRevision;
  future: SourceRevision[];
}

export type LogStream = "stdout" | "stderr" | "warning" | "error";

export interface RenderLog {
  id: string;
  requestId?: number;
  stream: LogStream;
  text: string;
  timestamp: number;
}

export type RenderStatus =
  "idle" | "initializing" | "rendering" | "success" | "error";

export interface RenderRequest {
  type: "render";
  requestId: number;
  source: string;
}

export interface RenderSuccess {
  type: "result";
  requestId: number;
  ok: true;
  stl: ArrayBuffer;
  stdout: string[];
  stderr: string[];
  elapsedMs: number;
}

export interface RenderFailure {
  type: "result";
  requestId: number;
  ok: false;
  error: string;
  stdout: string[];
  stderr: string[];
  elapsedMs: number;
}

export type RenderResponse = RenderSuccess | RenderFailure;

export interface StoredProject {
  id: string;
  name: string;
  source: string;
  messages: ChatMessage[];
  history: RevisionHistory;
  updatedAt: number;
}

export type ProjectSummary = Pick<StoredProject, "id" | "name" | "updatedAt">;

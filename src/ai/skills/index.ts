import type {
  ChatMessage,
  OutputLanguage,
  RenderLog,
  RenderStatus,
} from "../../types";
import type { CustomizerVariable } from "../../lib/customizer";
import { stripMarkdownFences } from "../../lib/markdown";
import { outputLanguageInstruction } from "../../lib/outputLanguage";
import { ITERATION_POLICY, SCADMATE_POLICY } from "./scadmate-policy";
import {
  MESH_FORMAT_GUIDANCE,
  OPENSCAD_AUTHORING,
  SOURCE_RESPONSE_CONTRACT,
} from "./openscad-authoring";
import {
  LOG_INTERPRETATION,
  VISUAL_REVIEW_RESPONSE_CONTRACT,
  VISUAL_VALIDATION,
} from "./visual-validation";
import { PRINTABILITY } from "./printability";
import { ORGANIC_AUTHORING } from "./organic-authoring";

export type AgentTask =
  "create" | "revise" | "visual-review" | "mesh-reference";
export type SkillId =
  | "policy"
  | "authoring"
  | "iteration"
  | "visual-validation"
  | "log-interpretation"
  | "printability"
  | "organic-authoring"
  | "mesh-formats";

export interface RenderedView {
  name: "isometric" | "front" | "rear" | "left" | "right" | "top" | "bottom";
  dataUrl: string;
}

export interface PromptAssemblyInput {
  task?: AgentTask;
  userRequest: string;
  outputLanguage?: OutputLanguage;
  currentSource?: string;
  recentMessages?: ChatMessage[];
  customizerVariables?: CustomizerVariable[];
  renderStatus?: RenderStatus;
  renderRequestId?: number;
  renderLogs?: RenderLog[];
  renderedViews?: RenderedView[];
}

export interface AssembledPrompt {
  task: AgentTask;
  skillIds: SkillId[];
  systemPrompt: string;
  userPrompt: string;
  images: RenderedView[];
}

export interface VisualReviewResult {
  status: "accept" | "revise";
  message?: string;
  scores: VisualReviewScores;
  decisionRationale: string;
  blockingDefects: string[];
  observations: string[];
  source?: string;
  uncertainties: string[];
}

export interface VisualReviewScores {
  requestFidelity: number;
  recognizability: number;
  proportions: number;
  structuralCoherence: number;
  requestedStyleMatch: number;
  printability: number;
}

const SCORE_FIELDS = [
  "requestFidelity",
  "recognizability",
  "proportions",
  "structuralCoherence",
  "requestedStyleMatch",
  "printability",
] as const satisfies ReadonlyArray<keyof VisualReviewScores>;

export function visualReviewHasBlockingDefects(
  review: Pick<VisualReviewResult, "blockingDefects">,
): boolean {
  return review.blockingDefects.length > 0;
}

const SECTION_BY_ID: Record<SkillId, string> = {
  policy: SCADMATE_POLICY,
  authoring: OPENSCAD_AUTHORING,
  iteration: ITERATION_POLICY,
  "visual-validation": VISUAL_VALIDATION,
  "log-interpretation": LOG_INTERPRETATION,
  printability: PRINTABILITY,
  "organic-authoring": ORGANIC_AUTHORING,
  "mesh-formats": MESH_FORMAT_GUIDANCE,
};

const ORGANIC_SUBJECT_PATTERN =
  /\b(?:organic|figurative|figure|figurine|sculpture|statue|anatomy|anatomical|realistic|animal|creature|human|person|body|head|torso|limb|leg|arm|tail|horn|antelope|gazelle|deer|horse|dog|cat|bird|owl|dragon|organik|figür|figürü|heykel|gerçekçi|hayvan|insan|gövde|baş|bacak|kol|kuyruk|boynuz|antilop|ceylan|geyik|at|köpek|kedi|kuş|baykuş|ejderha)\b/iu;

export function isOrganicSubject(context: string): boolean {
  return ORGANIC_SUBJECT_PATTERN.test(context);
}

export function selectAgentTask(
  userRequest: string,
  currentSource?: string,
  explicitTask?: AgentTask,
): AgentTask {
  if (explicitTask) return explicitTask;
  if (/\b(?:stl|3mf|triangle mesh|mesh import)\b/i.test(userRequest))
    return "mesh-reference";
  return currentSource?.trim() ? "revise" : "create";
}

export function selectSkillIds(task: AgentTask, context = ""): SkillId[] {
  const organic = isOrganicSubject(context);
  switch (task) {
    case "create":
      return [
        "policy",
        "authoring",
        ...(organic ? (["organic-authoring"] as const) : []),
        "printability",
      ];
    case "revise":
      return [
        "policy",
        "authoring",
        ...(organic ? (["organic-authoring"] as const) : []),
        "iteration",
      ];
    case "visual-review":
      return [
        "policy",
        "iteration",
        "visual-validation",
        ...(organic ? (["organic-authoring"] as const) : []),
        "log-interpretation",
        "printability",
      ];
    case "mesh-reference":
      return ["policy", "authoring", "mesh-formats"];
  }
}

function formatRecentMessages(messages: ChatMessage[] = []): string {
  return messages
    .slice(-8)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
}

export function formatCustomizerVariables(
  variables: CustomizerVariable[] = [],
): string {
  return variables
    .slice(0, 80)
    .map((variable) => {
      const control = variable.options
        ? ` options=[${variable.options.join(", ")}]`
        : variable.min !== undefined || variable.max !== undefined
          ? ` range=[${variable.min ?? ""}:${variable.step ?? ""}:${variable.max ?? ""}]`
          : "";
      return `${variable.name}=${JSON.stringify(variable.value)} (${variable.kind}${control})`;
    })
    .join("\n");
}

export function trimRenderLogs(
  logs: RenderLog[] = [],
  activeRequestId?: number,
  maxChars = 6000,
): string {
  const scoped =
    activeRequestId === undefined
      ? logs
      : logs.filter((log) => log.requestId === activeRequestId);
  if (scoped.length === 0)
    return "No logs are available for the current render request.";

  const indexed = scoped.map((log, index) => ({ log, index }));
  const important = indexed.filter(
    ({ log }) => log.stream === "error" || log.stream === "warning",
  );
  const candidates = [...important.reverse(), ...indexed.slice().reverse()];
  const selected = new Map<string, { log: RenderLog; index: number }>();
  let length = 0;

  for (const candidate of candidates) {
    if (selected.has(candidate.log.id)) continue;
    const line = `[${candidate.log.stream.toUpperCase()}] ${candidate.log.text}`;
    if (selected.size > 0 && length + line.length + 1 > maxChars) continue;
    selected.set(candidate.log.id, candidate);
    length += line.length + 1;
  }

  return [...selected.values()]
    .sort((left, right) => left.index - right.index)
    .map(({ log }) => `[${log.stream.toUpperCase()}] ${log.text}`)
    .join("\n");
}

export function assembleAgentPrompt(
  input: PromptAssemblyInput,
): AssembledPrompt {
  const task = selectAgentTask(
    input.userRequest,
    input.currentSource,
    input.task,
  );
  const skillContext = [
    input.userRequest,
    input.currentSource ?? "",
    ...(input.recentMessages ?? []).slice(-4).map((message) => message.content),
  ].join("\n");
  const skillIds = selectSkillIds(task, skillContext);
  const systemSections = skillIds.map((id) => SECTION_BY_ID[id]);
  systemSections.push(
    task === "visual-review"
      ? VISUAL_REVIEW_RESPONSE_CONTRACT
      : SOURCE_RESPONSE_CONTRACT,
  );
  systemSections.push(
    `OUTPUT LANGUAGE:\n${outputLanguageInstruction(input.outputLanguage ?? "auto")}`,
  );

  const userSections = [`LATEST USER REQUEST:\n${input.userRequest.trim()}`];
  if (input.currentSource?.trim()) {
    userSections.push(`CURRENT COMPLETE SCAD SOURCE:\n${input.currentSource}`);
  } else {
    userSections.push("CURRENT COMPLETE SCAD SOURCE:\n<blank project>");
  }

  const recent = formatRecentMessages(input.recentMessages);
  if (recent) userSections.push(`RELEVANT RECENT CONVERSATION:\n${recent}`);

  const parameters = formatCustomizerVariables(input.customizerVariables);
  if (parameters)
    userSections.push(`CURRENT CUSTOMIZER PARAMETERS:\n${parameters}`);

  if (task === "visual-review") {
    userSections.push(
      `LATEST RENDER STATUS:\nstatus=${input.renderStatus ?? "idle"} requestId=${input.renderRequestId ?? "unknown"}`,
    );
    userSections.push(
      `LATEST RELEVANT OPENSCAD LOGS:\n${trimRenderLogs(
        input.renderLogs,
        input.renderRequestId,
      )}`,
    );
    const viewNames = input.renderedViews?.map((view) => view.name).join(", ");
    userSections.push(
      `ACTIVE-PROJECT RENDERED VIEWS:\n${viewNames || "No current image is available. Rely on source and logs, and record the missing visual evidence as uncertainty."}`,
    );
  } else if (input.renderLogs?.length) {
    userSections.push(
      `LATEST RENDER STATUS AND RELEVANT LOGS:\nstatus=${input.renderStatus ?? "unknown"} requestId=${input.renderRequestId ?? "unknown"}\n${trimRenderLogs(
        input.renderLogs,
        input.renderRequestId,
      )}`,
    );
  }

  return {
    task,
    skillIds,
    systemPrompt: systemSections.join("\n\n"),
    userPrompt: userSections.join("\n\n---\n\n"),
    images: input.renderedViews ?? [],
  };
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function parseVisualReviewResponse(raw: string): VisualReviewResult {
  let payload: unknown;
  try {
    payload = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error("The visual-review response was not valid JSON.");
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("The visual-review response must be an object.");
  }

  const candidate = payload as Record<string, unknown>;
  if (candidate.status !== "accept" && candidate.status !== "revise") {
    throw new Error("The visual-review status must be accept or revise.");
  }
  if (
    !Array.isArray(candidate.observations) ||
    candidate.observations.length === 0 ||
    !candidate.observations.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    )
  ) {
    throw new Error(
      "The visual-review observations must contain concrete evidence-based strings.",
    );
  }
  const genericApproval =
    /^(?:no obvious (?:geometry )?(?:errors?|issues?)(?: were found)?|no issues? (?:were )?found|looks? good|compiled successfully|geometry is valid)[.!]?$/i;
  if (
    candidate.observations.every(
      (item) => typeof item === "string" && genericApproval.test(item.trim()),
    )
  ) {
    throw new Error(
      "The visual-review observations must be request-specific, not a generic approval.",
    );
  }

  if (!candidate.scores || typeof candidate.scores !== "object") {
    throw new Error("The visual-review response must include a scorecard.");
  }
  const rawScores = candidate.scores as Record<string, unknown>;
  const scores = Object.fromEntries(
    SCORE_FIELDS.map((field) => [field, rawScores[field]]),
  ) as unknown as VisualReviewScores;
  if (
    SCORE_FIELDS.some(
      (field) =>
        typeof scores[field] !== "number" ||
        !Number.isFinite(scores[field]) ||
        scores[field] < 0 ||
        scores[field] > 5,
    )
  ) {
    throw new Error(
      "Every visual-review score must be a finite number from 0 to 5.",
    );
  }
  const decisionRationale =
    typeof candidate.decisionRationale === "string"
      ? candidate.decisionRationale.trim()
      : "";
  if (!decisionRationale) {
    throw new Error(
      "The visual-review response must explain its decision rationale.",
    );
  }
  const blockingDefects =
    Array.isArray(candidate.blockingDefects) &&
    candidate.blockingDefects.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    )
      ? candidate.blockingDefects.map((item) => item.trim())
      : undefined;
  if (!blockingDefects) {
    throw new Error(
      "The visual-review blockingDefects must be an array of concrete strings.",
    );
  }
  if (candidate.status === "accept" && blockingDefects.length > 0) {
    throw new Error(
      "A visual review with blocking defects cannot return accept.",
    );
  }
  if (candidate.status === "revise" && blockingDefects.length === 0) {
    throw new Error(
      "A revise response must identify at least one concrete blocking defect.",
    );
  }
  const uncertainties =
    candidate.uncertainties === undefined
      ? []
      : Array.isArray(candidate.uncertainties) &&
          candidate.uncertainties.every((item) => typeof item === "string")
        ? candidate.uncertainties
        : undefined;
  if (!uncertainties) {
    throw new Error(
      "The visual-review uncertainties must be an array of strings.",
    );
  }

  const source =
    typeof candidate.source === "string"
      ? stripMarkdownFences(candidate.source)
      : undefined;
  if (candidate.status === "revise" && !source) {
    throw new Error(
      "A revise response must include complete corrected OpenSCAD source.",
    );
  }
  const message =
    typeof candidate.message === "string" && candidate.message.trim()
      ? candidate.message.trim().slice(0, 4000)
      : undefined;
  return {
    status: candidate.status,
    ...(message ? { message } : {}),
    scores,
    decisionRationale,
    blockingDefects,
    observations: candidate.observations,
    ...(source ? { source } : {}),
    uncertainties,
  };
}

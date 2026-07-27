import type {
  AISettings,
  ChatMessage,
  RenderLog,
  RenderStatus,
} from "../types";
import type { CustomizerVariable } from "../lib/customizer";
import { stripMarkdownFences } from "../lib/markdown";
import {
  isDesktopRuntime,
  nativeClaudeGenerate,
  nativeCodexGenerate,
  nativeCompatibleGenerate,
} from "../native/tauri";
import {
  assembleAgentPrompt,
  parseVisualReviewResponse,
  type AssembledPrompt,
  type RenderedView,
  type VisualReviewResult,
} from "./skills";

export interface GenerateScadInput {
  userRequest: string;
  outputLanguage?: AISettings["outputLanguage"];
  currentSource?: string;
  recentMessages: ChatMessage[];
  customizerVariables?: CustomizerVariable[];
  renderStatus?: RenderStatus;
  renderRequestId?: number;
  renderLogs?: RenderLog[];
}

export interface VisualReviewInput extends GenerateScadInput {
  currentSource: string;
  renderedViews: RenderedView[];
}

export interface GenerateScadResult {
  source: string;
  reasoning?: string;
}

interface InferenceResult {
  content: string;
  reasoning?: string;
}

export interface AIProvider {
  generateScad(input: GenerateScadInput): Promise<GenerateScadResult>;
  reviewRender(input: VisualReviewInput): Promise<VisualReviewResult>;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
    };
  }>;
  error?: { message?: string };
}

function normalizeReasoning(reasoning?: string | null): string | undefined {
  const normalized = reasoning?.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 12_000);
}

abstract class PromptedProvider implements AIProvider {
  protected abstract infer(prompt: AssembledPrompt): Promise<InferenceResult>;

  async generateScad(input: GenerateScadInput): Promise<GenerateScadResult> {
    const prompt = assembleAgentPrompt(input);
    const result = await this.infer(prompt);
    const source = stripMarkdownFences(result.content);
    if (!source) {
      throw new Error(
        "The AI returned an empty response. The current source was not changed.",
      );
    }
    const reasoning = normalizeReasoning(result.reasoning);
    return { source, ...(reasoning ? { reasoning } : {}) };
  }

  async reviewRender(input: VisualReviewInput): Promise<VisualReviewResult> {
    const prompt = assembleAgentPrompt({ ...input, task: "visual-review" });
    const result = await this.infer(prompt);
    return parseVisualReviewResponse(result.content);
  }
}

export class OpenAICompatibleProvider extends PromptedProvider {
  constructor(private readonly settings: AISettings) {
    super();
  }

  protected async infer(prompt: AssembledPrompt): Promise<InferenceResult> {
    const { endpoint, apiKey, model } = this.settings;
    if (!endpoint.trim() || !apiKey.trim() || !model.trim()) {
      throw new Error(
        "AI settings are incomplete. Add an endpoint, API key, and model.",
      );
    }

    if (isDesktopRuntime()) {
      try {
        return await nativeCompatibleGenerate({
          endpoint,
          apiKey,
          model,
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          images: prompt.images,
        });
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : String(error),
          { cause: error },
        );
      }
    }

    const userContent =
      prompt.images.length === 0
        ? prompt.userPrompt
        : [
            { type: "text", text: prompt.userPrompt },
            ...prompt.images.map((image) => ({
              type: "image_url",
              image_url: { url: image.dataUrl },
            })),
          ];

    let response: Response;
    try {
      response = await fetch(endpoint.trim(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.trim(),
          temperature: 0.2,
          messages: [
            { role: "system", content: prompt.systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });
    } catch (error) {
      throw new Error(
        `AI request failed. Check the endpoint, network connection, and browser CORS policy. ${
          error instanceof Error ? error.message : ""
        }`.trim(),
        { cause: error },
      );
    }

    const raw = await response.text();
    let payload: ChatCompletionResponse;
    try {
      payload = JSON.parse(raw) as ChatCompletionResponse;
    } catch {
      throw new Error(
        `AI endpoint returned an unreadable response (HTTP ${response.status}).`,
      );
    }
    if (!response.ok) {
      throw new Error(
        payload.error?.message ??
          `AI request failed with HTTP ${response.status}.`,
      );
    }
    const message = payload.choices?.[0]?.message;
    const reasoning = normalizeReasoning(
      message?.reasoning ?? message?.reasoning_content,
    );
    return {
      content: message?.content ?? "",
      ...(reasoning ? { reasoning } : {}),
    };
  }
}

export class CodexProvider extends PromptedProvider {
  constructor(private readonly settings: AISettings) {
    super();
  }

  protected async infer(prompt: AssembledPrompt): Promise<InferenceResult> {
    if (!isDesktopRuntime()) {
      throw new Error(
        "ChatGPT subscription access is available in the SCADmate desktop app.",
      );
    }
    try {
      return await nativeCodexGenerate({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        images: prompt.images,
        ...(this.settings.codexModel.trim()
          ? { model: this.settings.codexModel.trim() }
          : {}),
        ...(this.settings.codexExecutable.trim()
          ? { executable: this.settings.codexExecutable.trim() }
          : {}),
      });
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : `Codex generation failed: ${String(error)}`,
        { cause: error },
      );
    }
  }
}

export class ClaudeCodeProvider extends PromptedProvider {
  constructor(private readonly settings: AISettings) {
    super();
  }

  protected async infer(prompt: AssembledPrompt): Promise<InferenceResult> {
    if (!isDesktopRuntime()) {
      throw new Error(
        "Claude subscription access is available in the SCADmate desktop app.",
      );
    }
    try {
      return await nativeClaudeGenerate({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        images: prompt.images,
        ...(this.settings.claudeModel.trim()
          ? { model: this.settings.claudeModel.trim() }
          : {}),
        ...(this.settings.claudeExecutable.trim()
          ? { executable: this.settings.claudeExecutable.trim() }
          : {}),
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error), {
        cause: error,
      });
    }
  }
}

export function createAIProvider(settings: AISettings): AIProvider {
  if (settings.provider === "codex") return new CodexProvider(settings);
  if (settings.provider === "claude-code")
    return new ClaudeCodeProvider(settings);
  return new OpenAICompatibleProvider(settings);
}

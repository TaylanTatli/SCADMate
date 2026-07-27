import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenAICompatibleProvider,
  parseSourceGenerationResponse,
} from "./provider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("source generation response", () => {
  it("extracts complete source and the AI-written chat message", () => {
    const result = parseSourceGenerationResponse(
      JSON.stringify({
        source: "width = 20;\ncube(width);",
        message: "### Model hazır\n\nParametrik gövde oluşturuldu.",
      }),
    );

    expect(result.source).toContain("cube(width)");
    expect(result.message).toContain("Model hazır");
  });

  it("keeps source-only provider responses backward compatible", () => {
    expect(
      parseSourceGenerationResponse("```openscad\ncube(10);\n```").source,
    ).toBe("cube(10);");
  });

  it("aborts an active OpenAI-compatible HTTP request", async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Stopped", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAICompatibleProvider({
      provider: "openai-compatible",
      outputLanguage: "en",
      codexModel: "",
      codexExecutable: "",
      claudeModel: "",
      claudeExecutable: "",
      endpoint: "https://example.test/v1/chat/completions",
      apiKey: "test-only",
      model: "test-model",
    });
    const controller = new AbortController();

    const request = provider.generateScad({
      userRequest: "Make a cube",
      recentMessages: [],
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});

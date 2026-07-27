import { describe, expect, it } from "vitest";
import { parseSourceGenerationResponse } from "./provider";

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
});

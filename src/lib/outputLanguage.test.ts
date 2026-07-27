import { describe, expect, it } from "vitest";
import { outputLanguageInstruction } from "./outputLanguage";

describe("output language", () => {
  it("instructs the model not to mix output languages", () => {
    expect(outputLanguageInstruction("auto")).toContain("latest user request");
    expect(outputLanguageInstruction("tr")).toContain("Turkish");
    expect(outputLanguageInstruction("en")).toContain("English");
  });
});

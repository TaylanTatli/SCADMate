import { describe, expect, it } from "vitest";
import { stripMarkdownFences } from "./markdown";

describe("stripMarkdownFences", () => {
  it("removes accidental OpenSCAD fences", () => {
    expect(stripMarkdownFences("```openscad\ncube(10);\n```")).toBe(
      "cube(10);",
    );
  });

  it("removes generic fences and surrounding whitespace", () => {
    expect(stripMarkdownFences("  ```\n  sphere(4);\n```  ")).toBe(
      "sphere(4);",
    );
  });

  it("does not alter unfenced source content", () => {
    expect(stripMarkdownFences("// model\ncube(10);")).toBe(
      "// model\ncube(10);",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  parseCustomizerVariables,
  updateCustomizerVariable,
} from "./customizer";

const source = `/* [Body] */
width = 80; // [40:5:120]
enabled = true;
label = "case";
finish = "matte"; // [matte, gloss, textured]
count = 3; // [1, 3, 5]
/* [Hidden] */
$fn = 40;
secret = 9;
`;

describe("Customizer variable parsing", () => {
  it("parses numbers, booleans, strings, ranges, and enumerations", () => {
    const variables = parseCustomizerVariables(source);
    expect(variables.map(({ name }) => name)).toEqual([
      "width",
      "enabled",
      "label",
      "finish",
      "count",
    ]);
    expect(variables[0]).toMatchObject({
      name: "width",
      kind: "number",
      value: 80,
      min: 40,
      step: 5,
      max: 120,
      section: "Body",
    });
    expect(variables[1]).toMatchObject({ kind: "boolean", value: true });
    expect(variables[2]).toMatchObject({ kind: "string", value: "case" });
    expect(variables[3]).toMatchObject({
      kind: "enum",
      options: ["matte", "gloss", "textured"],
    });
    expect(variables[4]).toMatchObject({ kind: "enum", options: [1, 3, 5] });
  });

  it("updates only the selected source declaration", () => {
    const [width] = parseCustomizerVariables(source);
    expect(width).toBeDefined();
    const updated = updateCustomizerVariable(source, width!, 95);
    expect(updated).toContain("width = 95; // [40:5:120]");
    expect(updated).toContain("secret = 9;");
  });
});

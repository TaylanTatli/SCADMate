import { describe, expect, it } from "vitest";
import { BLANK_SOURCE, hasScadContent } from "./scadSource";

describe("hasScadContent", () => {
  it("rejects the blank project placeholder", () => {
    expect(hasScadContent(BLANK_SOURCE)).toBe(false);
  });

  it("rejects whitespace and block comments", () => {
    expect(hasScadContent(" \n/* nothing to render */\n")).toBe(false);
  });

  it("accepts an OpenSCAD statement", () => {
    expect(hasScadContent("// model\ncube([10, 10, 10]);")).toBe(true);
  });
});

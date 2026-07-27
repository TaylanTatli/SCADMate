import { describe, expect, it } from "vitest";
import {
  NEW_PROJECT_NAME,
  projectNameFromRequest,
  upsertProjectSummary,
} from "./projects";

describe("project helpers", () => {
  it("derives a compact conversation title from the first request", () => {
    expect(projectNameFromRequest("  Make   a phone stand  ")).toBe(
      "Make a phone stand",
    );
    expect(projectNameFromRequest(" ".repeat(4))).toBe(NEW_PROJECT_NAME);
  });

  it("moves an updated project to the top without duplicating it", () => {
    const projects = [
      { id: "a", name: "Older", updatedAt: 1 },
      { id: "b", name: "Other", updatedAt: 2 },
    ];
    const result = upsertProjectSummary(projects, {
      id: "a",
      name: "Updated",
      source: "cube(1);",
      messages: [],
      history: {
        past: [],
        present: {
          id: "revision",
          source: "cube(1);",
          label: "Sample",
          createdAt: 1,
        },
        future: [],
      },
      updatedAt: 3,
    });

    expect(result.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(result[0]?.name).toBe("Updated");
  });
});

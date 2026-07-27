import { describe, expect, it } from "vitest";
import {
  commitRevision,
  createHistory,
  redoRevision,
  undoRevision,
} from "./revisions";

describe("revision history", () => {
  it("commits, undoes, and redoes complete sources", () => {
    const initial = createHistory("cube(1);");
    const changed = commitRevision(initial, "cube(2);", "AI resize");
    const updated = commitRevision(changed, "sphere(2);", "AI reshape");

    expect(updated.past).toHaveLength(2);
    const undone = undoRevision(updated);
    expect(undone.present.source).toBe("cube(2);");
    expect(undone.future).toHaveLength(1);
    expect(redoRevision(undone).present.source).toBe("sphere(2);");
  });

  it("clears redo entries after a new revision", () => {
    const changed = commitRevision(createHistory("a"), "b", "change");
    const undone = undoRevision(changed);
    const branched = commitRevision(undone, "c", "branch");
    expect(branched.future).toEqual([]);
  });

  it("keeps the previous workspace recoverable after starting blank", () => {
    const current = commitRevision(
      createHistory("cube(10);"),
      "cube(20);",
      "Manual edit",
    );
    const blank = commitRevision(
      current,
      "// Describe your model in chat.\n",
      "New blank project",
    );

    expect(undoRevision(blank).present.source).toBe("cube(20);");
  });
});

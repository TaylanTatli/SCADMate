import { describe, expect, it } from "vitest";
import { createHistory } from "./revisions";
import {
  ActiveWorkflow,
  preserveStoppedSource,
  stoppedRenderStatus,
} from "./activeWorkflow";

describe("active workflow cancellation", () => {
  it("aborts the shared signal and rejects late workflow updates", async () => {
    const workflow = new ActiveWorkflow();
    let visibleResult = "last valid";
    let release!: () => void;
    const lateResponse = new Promise<void>((resolve) => {
      release = resolve;
    }).then(() => {
      if (workflow.active) visibleResult = "late result";
    });

    workflow.stop();
    release();
    await lateResponse;

    expect(workflow.signal.aborted).toBe(true);
    expect(workflow.active).toBe(false);
    expect(visibleResult).toBe("last valid");
    expect(() => workflow.assertActive()).toThrowError("Stopped");
  });

  it("preserves a complete AI draft while restoring the last valid source and preview state", () => {
    const history = preserveStoppedSource(
      createHistory("previous_valid();"),
      "complete_ai_draft();",
      "previous_valid();",
    );

    expect(history.present.source).toBe("previous_valid();");
    expect(
      history.past.some(({ source }) => source === "complete_ai_draft();"),
    ).toBe(true);
    expect(stoppedRenderStatus(true)).toBe("success");
  });

  it("returns to an idle state when no valid preview exists", () => {
    const workflow = new ActiveWorkflow();
    workflow.stop();

    expect(workflow.active).toBe(false);
    expect(stoppedRenderStatus(false)).toBe("idle");
  });
});

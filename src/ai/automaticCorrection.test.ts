import { describe, expect, it, vi } from "vitest";
import {
  MAX_AUTOMATIC_CORRECTIONS,
  runAutomaticCorrection,
  type RenderEvidence,
} from "./automaticCorrection";
import { createHistory } from "../lib/revisions";

const evidence = (ok: boolean, requestId: number): RenderEvidence => ({
  ok,
  requestId,
  status: ok ? "success" : "error",
  logs: [],
  images: [],
  ...(!ok ? { error: "compile failed" } : {}),
});

describe("automatic visual correction", () => {
  it("never exceeds two automatic source corrections", async () => {
    const render = vi
      .fn()
      .mockResolvedValueOnce(evidence(true, 1))
      .mockResolvedValueOnce(evidence(false, 2))
      .mockResolvedValueOnce(evidence(false, 3));
    const review = vi.fn().mockImplementation((source: string) =>
      Promise.resolve({
        status: "revise" as const,
        observations: [`problem in ${source}`],
        source: `${source}\n// correction`,
        uncertainties: [],
      }),
    );

    const result = await runAutomaticCorrection({
      initialSource: "cube(10);",
      fallbackSource: "sphere(5);",
      render,
      review,
      maxCorrections: 99,
    });

    expect(result.correctionAttempts).toBe(MAX_AUTOMATIC_CORRECTIONS);
    expect(render).toHaveBeenCalledTimes(3);
    expect(result.uncertainties.join(" ")).toContain("strict limit");
  });

  it("restores the previous valid revision when later corrections fail", async () => {
    const render = vi
      .fn()
      .mockResolvedValueOnce(evidence(true, 1))
      .mockResolvedValueOnce(evidence(false, 2))
      .mockResolvedValueOnce(evidence(false, 3));
    const review = vi.fn().mockResolvedValue({
      status: "revise",
      observations: ["clear defect"],
      source: "broken();",
      uncertainties: [],
    });

    const result = await runAutomaticCorrection({
      initialSource: "valid_generated();",
      fallbackSource: "previous_valid();",
      render,
      review,
    });

    expect(result.source).toBe("valid_generated();");
    expect(result.validSources).toEqual(["valid_generated();"]);
    expect(result.accepted).toBe(false);
  });

  it("keeps the pre-existing valid source when every AI candidate fails", async () => {
    const history = createHistory("previous_valid();", "Last valid revision");
    const result = await runAutomaticCorrection({
      initialSource: "broken();",
      fallbackSource: history.present.source,
      render: vi.fn().mockResolvedValue(evidence(false, 1)),
      review: vi.fn().mockResolvedValue({
        status: "accept",
        observations: [],
        uncertainties: [],
      }),
    });

    expect(result.source).toBe("previous_valid();");
    expect(result.validSources).toEqual([]);
    expect(history.present.source).toBe(result.source);
    expect(result.accepted).toBe(false);
  });
});

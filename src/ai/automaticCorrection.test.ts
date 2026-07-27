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

const goodScores = {
  requestFidelity: 4,
  recognizability: 4,
  proportions: 4,
  structuralCoherence: 4,
  requestedStyleMatch: 4,
  printability: 4,
};

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
        scores: goodScores,
        decisionRationale: "A concrete source defect requires correction.",
        blockingDefects: [
          "The candidate still contains the identified defect.",
        ],
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
      scores: goodScores,
      decisionRationale: "The correction failed to compile.",
      blockingDefects: ["The corrected source does not compile."],
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
        scores: goodScores,
        decisionRationale:
          "No visual acceptance is possible after a failed compile.",
        blockingDefects: [],
        observations: [],
        uncertainties: [],
      }),
    });

    expect(result.source).toBe("previous_valid();");
    expect(result.validSources).toEqual([]);
    expect(history.present.source).toBe(result.source);
    expect(result.accepted).toBe(false);
  });

  it("stops waiting for a visual review after the configured timeout", async () => {
    vi.useFakeTimers();
    try {
      const resultPromise = runAutomaticCorrection({
        initialSource: "cube(10);",
        fallbackSource: "sphere(5);",
        render: vi.fn().mockResolvedValue(evidence(true, 1)),
        review: vi.fn().mockReturnValue(new Promise(() => undefined)),
        reviewTimeoutMs: 25,
      });

      await vi.advanceTimersByTimeAsync(25);
      const result = await resultPromise;

      expect(result.source).toBe("cube(10);");
      expect(result.uncertainties.join(" ")).toContain("time limit");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not accept a compiled but visibly poor figurative model", async () => {
    const result = await runAutomaticCorrection({
      initialSource: "poor_antelope();",
      fallbackSource: "previous_valid();",
      render: vi.fn().mockResolvedValue(evidence(true, 1)),
      review: vi.fn().mockResolvedValue({
        status: "accept",
        scores: {
          ...goodScores,
          requestFidelity: 2,
          recognizability: 1,
          proportions: 2,
          requestedStyleMatch: 1,
        },
        decisionRationale:
          "The requested realistic antelope is materially contradicted by rod-like anatomy.",
        blockingDefects: [
          "Legs are uniform rods.",
          "The torso lacks an antelope-like ribcage.",
        ],
        observations: [
          "Legs are uniform rods and the torso lacks an antelope-like ribcage.",
          "The neck is disproportionately long for the requested realistic style.",
        ],
        uncertainties: [],
      }),
    });

    expect(result.accepted).toBe(false);
    expect(result.uncertainties.join(" ")).toContain(
      "explicit blocking defects",
    );
  });

  it("automatically renders a corrected source when figurative scores are low", async () => {
    const render = vi
      .fn()
      .mockResolvedValueOnce(evidence(true, 1))
      .mockResolvedValueOnce(evidence(true, 2));
    const review = vi
      .fn()
      .mockResolvedValueOnce({
        status: "revise",
        scores: {
          ...goodScores,
          recognizability: 2,
          proportions: 2,
        },
        decisionRationale:
          "The visible anatomy materially misses the requested antelope proportions.",
        blockingDefects: [
          "Legs are uniform rods and the neck is disproportionately long.",
        ],
        observations: [
          "Legs are uniform rods and the neck is disproportionately long.",
        ],
        source: "corrected_antelope();",
        uncertainties: [],
      })
      .mockResolvedValueOnce({
        status: "accept",
        scores: goodScores,
        decisionRationale:
          "The corrected stylized anatomy now matches the request without a concrete blocker.",
        blockingDefects: [],
        observations: [
          "The tapered legs, ribcage silhouette, and curved horns now read as an antelope.",
        ],
        uncertainties: [],
      });

    const result = await runAutomaticCorrection({
      initialSource: "poor_antelope();",
      fallbackSource: "previous_valid();",
      render,
      review,
    });

    expect(result.accepted).toBe(true);
    expect(result.source).toBe("corrected_antelope();");
    expect(result.correctionAttempts).toBe(1);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("aborts before starting an automatic correction retry", async () => {
    const controller = new AbortController();
    const render = vi.fn().mockResolvedValue(evidence(true, 1));
    const review = vi.fn().mockImplementation(async () => {
      controller.abort();
      return {
        status: "revise" as const,
        scores: goodScores,
        decisionRationale: "A correction would normally be required.",
        blockingDefects: ["A visible defect remains."],
        observations: ["A visible defect remains."],
        source: "corrected();",
        uncertainties: [],
      };
    });

    await expect(
      runAutomaticCorrection({
        initialSource: "candidate();",
        fallbackSource: "previous_valid();",
        render,
        review,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(render).toHaveBeenCalledTimes(1);
    expect(review).toHaveBeenCalledTimes(1);
  });
});

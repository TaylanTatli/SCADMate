import type { RenderLog, RenderStatus } from "../types";
import { createAbortError, isAbortError } from "../lib/activeWorkflow";
import {
  visualReviewHasBlockingDefects,
  type RenderedView,
  type VisualReviewResult,
} from "./skills";

export const MAX_AUTOMATIC_CORRECTIONS = 2;
export const DEFAULT_VISUAL_REVIEW_TIMEOUT_MS = 120_000;

export interface RenderEvidence {
  ok: boolean;
  requestId: number;
  status: RenderStatus;
  logs: RenderLog[];
  images: RenderedView[];
  error?: string;
}

export interface AutomaticCorrectionInput {
  initialSource: string;
  fallbackSource: string;
  render: (source: string) => Promise<RenderEvidence>;
  review: (
    source: string,
    evidence: RenderEvidence,
  ) => Promise<VisualReviewResult>;
  maxCorrections?: number;
  reviewTimeoutMs?: number;
  signal?: AbortSignal;
}

export interface AutomaticCorrectionResult {
  source: string;
  accepted: boolean;
  correctionAttempts: number;
  message?: string;
  observations: string[];
  uncertainties: string[];
  validSources: string[];
  latestEvidence?: RenderEvidence;
}

export async function runAutomaticCorrection({
  initialSource,
  fallbackSource,
  render,
  review,
  maxCorrections = MAX_AUTOMATIC_CORRECTIONS,
  reviewTimeoutMs = DEFAULT_VISUAL_REVIEW_TIMEOUT_MS,
  signal,
}: AutomaticCorrectionInput): Promise<AutomaticCorrectionResult> {
  signal?.throwIfAborted();
  const limit = Math.max(
    0,
    Math.min(maxCorrections, MAX_AUTOMATIC_CORRECTIONS),
  );
  let candidate = initialSource;
  let lastValidSource = fallbackSource;
  let corrections = 0;
  let latestEvidence: RenderEvidence | undefined;
  const validSources: string[] = [];
  const observations: string[] = [];
  const uncertainties: string[] = [];

  const reviewWithTimeout = (
    source: string,
    evidence: RenderEvidence,
  ): Promise<VisualReviewResult> =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }
      const abort = () => {
        globalThis.clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        reject(createAbortError());
      };
      const timeout = globalThis.setTimeout(
        () => {
          signal?.removeEventListener("abort", abort);
          reject(
            new Error(
              "The visual review exceeded its time limit. The compiled model remains available.",
            ),
          );
        },
        Math.max(1, reviewTimeoutMs),
      );
      signal?.addEventListener("abort", abort, { once: true });
      void review(source, evidence).then(
        (result) => {
          globalThis.clearTimeout(timeout);
          signal?.removeEventListener("abort", abort);
          resolve(result);
        },
        (error: unknown) => {
          globalThis.clearTimeout(timeout);
          signal?.removeEventListener("abort", abort);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });

  while (true) {
    signal?.throwIfAborted();
    try {
      latestEvidence = await render(candidate);
      signal?.throwIfAborted();
    } catch (error) {
      if (isAbortError(error)) throw error;
      uncertainties.push(
        `Automatic render validation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        source: lastValidSource,
        accepted: false,
        correctionAttempts: corrections,
        observations,
        uncertainties,
        validSources,
        latestEvidence,
      };
    }
    if (latestEvidence.ok) {
      lastValidSource = candidate;
      if (validSources.at(-1) !== candidate) validSources.push(candidate);
    }

    let decision: VisualReviewResult;
    try {
      decision = await reviewWithTimeout(candidate, latestEvidence);
      signal?.throwIfAborted();
    } catch (error) {
      if (isAbortError(error)) throw error;
      uncertainties.push(
        `Automatic visual review failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        source: lastValidSource,
        accepted: false,
        correctionAttempts: corrections,
        observations,
        uncertainties,
        validSources,
        latestEvidence,
      };
    }

    observations.push(...decision.observations);
    uncertainties.push(...decision.uncertainties);
    const hasBlockingDefects = visualReviewHasBlockingDefects(decision);
    const effectiveStatus = hasBlockingDefects
      ? ("revise" as const)
      : decision.status;
    if (hasBlockingDefects && decision.status === "accept") {
      uncertainties.push(
        "The provider attempted to accept a model with explicit blocking defects; acceptance was rejected.",
      );
    }

    if (effectiveStatus === "accept" && latestEvidence.ok) {
      return {
        source: candidate,
        accepted: true,
        correctionAttempts: corrections,
        ...(decision.message ? { message: decision.message } : {}),
        observations,
        uncertainties,
        validSources,
        latestEvidence,
      };
    }

    if (
      effectiveStatus === "revise" &&
      decision.source &&
      corrections < limit
    ) {
      signal?.throwIfAborted();
      corrections += 1;
      candidate = decision.source;
      continue;
    }

    if (!latestEvidence.ok) {
      uncertainties.push(
        "The latest candidate did not compile; the previous valid source was restored.",
      );
    }
    if (effectiveStatus === "revise" && corrections >= limit) {
      uncertainties.push(
        `Automatic correction stopped at the strict limit of ${limit}.`,
      );
    }
    if (effectiveStatus === "accept" && !latestEvidence.ok) {
      uncertainties.push(
        "A failed compile cannot be accepted solely from model output.",
      );
    }
    if (effectiveStatus === "revise" && !decision.source) {
      uncertainties.push(
        "The identified blocking defects require revision, but no complete corrected source was returned.",
      );
    }

    return {
      source: lastValidSource,
      accepted: false,
      correctionAttempts: corrections,
      observations,
      uncertainties,
      validSources,
      latestEvidence,
    };
  }
}

import type { RenderLog, RenderStatus } from "../types";
import type { RenderedView, VisualReviewResult } from "./skills";

export const MAX_AUTOMATIC_CORRECTIONS = 2;

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
}

export interface AutomaticCorrectionResult {
  source: string;
  accepted: boolean;
  correctionAttempts: number;
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
}: AutomaticCorrectionInput): Promise<AutomaticCorrectionResult> {
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

  while (true) {
    try {
      latestEvidence = await render(candidate);
    } catch (error) {
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
      decision = await review(candidate, latestEvidence);
    } catch (error) {
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
    if (decision.status === "accept" && latestEvidence.ok) {
      return {
        source: candidate,
        accepted: true,
        correctionAttempts: corrections,
        observations,
        uncertainties,
        validSources,
        latestEvidence,
      };
    }

    if (
      decision.status === "revise" &&
      decision.source &&
      corrections < limit
    ) {
      corrections += 1;
      candidate = decision.source;
      continue;
    }

    if (!latestEvidence.ok) {
      uncertainties.push(
        "The latest candidate did not compile; the previous valid source was restored.",
      );
    }
    if (decision.status === "revise" && corrections >= limit) {
      uncertainties.push(
        `Automatic correction stopped at the strict limit of ${limit}.`,
      );
    }
    if (decision.status === "accept" && !latestEvidence.ok) {
      uncertainties.push(
        "A failed compile cannot be accepted solely from model output.",
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

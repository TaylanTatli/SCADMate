import { describe, expect, it } from "vitest";
import type { RenderLog } from "../../types";
import {
  assembleAgentPrompt,
  parseVisualReviewResponse,
  selectAgentTask,
  selectSkillIds,
  trimRenderLogs,
} from "./index";

describe("OpenSCAD skill selection and prompt assembly", () => {
  it("selects focused skill sets for creation, revision, review, and mesh tasks", () => {
    expect(selectAgentTask("Create a phone stand")).toBe("create");
    expect(selectAgentTask("Move the opening", "cube(10);")).toBe("revise");
    expect(selectAgentTask("Use this STL as a reference", "cube(10);")).toBe(
      "mesh-reference",
    );
    expect(selectSkillIds("visual-review")).toContain("visual-validation");
    expect(selectSkillIds("create")).not.toContain("visual-validation");
  });

  it("omits irrelevant visual-review guidance from a creation prompt", () => {
    const prompt = assembleAgentPrompt({
      userRequest: "Create a small enclosure",
      currentSource: undefined,
    });

    expect(prompt.skillIds).toEqual(["policy", "authoring", "printability"]);
    expect(prompt.systemPrompt).not.toContain(
      "Review every supplied active-project view",
    );
    expect(prompt.userPrompt).not.toContain("LATEST RELEVANT OPENSCAD LOGS");
    expect(prompt.systemPrompt).toContain(
      "Return only the complete updated OpenSCAD source",
    );
  });

  it("includes current source, parameters, active logs, and view names for review", () => {
    const logs: RenderLog[] = [
      {
        id: "active",
        requestId: 4,
        stream: "warning",
        text: "WARNING: active warning",
        timestamp: 2,
      },
    ];
    const prompt = assembleAgentPrompt({
      task: "visual-review",
      userRequest: "Add two USB openings",
      currentSource: "width = 40; // [20:1:80]\ncube(width);",
      customizerVariables: [
        {
          name: "width",
          kind: "number",
          value: 40,
          section: "Parameters",
          min: 20,
          max: 80,
          step: 1,
          start: 0,
          end: 24,
        },
      ],
      renderStatus: "success",
      renderRequestId: 4,
      renderLogs: logs,
      renderedViews: [
        { name: "isometric", dataUrl: "data:image/png;base64,AA==" },
      ],
    });

    expect(prompt.userPrompt).toContain("CURRENT COMPLETE SCAD SOURCE");
    expect(prompt.userPrompt).toContain("width=40");
    expect(prompt.userPrompt).toContain("WARNING: active warning");
    expect(prompt.userPrompt).toContain("isometric");
    expect(prompt.images).toHaveLength(1);
  });
});

describe("render log trimming", () => {
  it("rejects stale logs and retains the latest active error under the size limit", () => {
    const logs: RenderLog[] = [
      {
        id: "stale-error",
        requestId: 1,
        stream: "error",
        text: "ERROR: stale parser failure",
        timestamp: 1,
      },
      {
        id: "noise",
        requestId: 2,
        stream: "stdout",
        text: "x".repeat(300),
        timestamp: 2,
      },
      {
        id: "latest-error",
        requestId: 2,
        stream: "error",
        text: "ERROR: latest parser failure",
        timestamp: 3,
      },
    ];

    const trimmed = trimRenderLogs(logs, 2, 90);
    expect(trimmed).toContain("latest parser failure");
    expect(trimmed).not.toContain("stale parser failure");
  });
});

describe("structured visual-review validation", () => {
  it("accepts valid fenced JSON and cleans a fenced corrected source", () => {
    const result = parseVisualReviewResponse(`\`\`\`json
{"status":"revise","observations":["opening is blocked"],"source":"\`\`\`openscad\\ncube(10);\\n\`\`\`","uncertainties":[]}
\`\`\``);
    expect(result.status).toBe("revise");
    expect(result.source).toBe("cube(10);");
  });

  it("rejects revise responses without a complete source", () => {
    expect(() =>
      parseVisualReviewResponse(
        '{"status":"revise","observations":["compile failed"],"uncertainties":[]}',
      ),
    ).toThrow(/complete corrected OpenSCAD source/);
  });
});

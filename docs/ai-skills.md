# OpenSCAD agent skill layer

SCADmate assembles focused, task-specific instructions instead of sending one large static system
prompt. The skill files in `src/ai/skills` contain original SCADmate-specific wording and are
selected by `assembleAgentPrompt`.

## Task selection

| Task                    | Included guidance                                                      |
| ----------------------- | ---------------------------------------------------------------------- |
| New model               | SCADmate policy, OpenSCAD authoring, printability                      |
| Existing-model revision | Policy, authoring, focused iteration                                   |
| Automatic render review | Policy, iteration, visual validation, log interpretation, printability |
| STL/3MF or mesh request | Policy, authoring, mesh-format limitations                             |

Creation and revision calls return a complete `.scad` file. The current source remains the editable
source of truth; patches are not required. Visual review uses a validated JSON response with
`accept` or `revise`, a concise user-facing Markdown message, observations, uncertainties, and
complete replacement source when revision is requested. The AI writes that chat message in the
output language selected in Settings; SCADmate does not rebuild it from hard-coded prose.

## Evidence and correction flow

After an AI source-generation call, SCADmate compiles the candidate through the existing OpenSCAD
WASM worker. Logs are tagged with the monotonic render request ID. Prompt assembly rejects entries
from other request IDs and limits the current log section to 6,000 characters while prioritizing
the latest errors and warnings.

On a successful compile, the Three.js preview captures deterministic isometric, front, rear, left,
right, and top PNG views. The grid is hidden during capture, images are reduced to at most 512
pixels on their longest side, and only current-project images are sent to the selected provider.
The interactive camera is restored after capture.

The review can accept the result or return corrected complete source. A correction is compiled and
reviewed again, with an unconditional maximum of two automatic corrections. Failed candidates are
not committed as valid revisions. A compile, review, timeout, or structured-response failure stops
the loop and restores the most recent valid source and preview. Observations and unresolved
uncertainties are shown in chat.

The successfully compiled model is announced immediately while visual review continues. Review is
limited to 45 seconds so a slow provider cannot leave the chat pending indefinitely; a timeout
keeps the latest valid model and preview available.

Visual evidence can reveal obvious placement and geometry problems, but it cannot prove exact
dimensional fit, manifoldness, manufacturing tolerance, or print success. Those remain explicit
uncertainties where applicable.

## Source and mesh formats

SCAD is SCADmate's editable, parameterized source of truth. STL is a triangle-mesh result or
reference input and does not retain parameters or design intent. Arbitrary STL geometry is not
promised to be reconstructable as clean parametric SCAD. 3MF can carry objects and metadata, but
it does not replace the initial SCAD-first workflow and SCADmate is not a general mesh editor.

## Provider and privacy boundary

The existing `AIProvider` abstraction is preserved. It now exposes source generation and
structured render review. Codex and Claude receive current-project PNGs through isolated temporary
directories; compatible endpoints receive standard image data URLs. Prompts contain only the
active request, complete current source, up to eight recent messages, current Customizer values,
and current render evidence. API keys are never included in prompts, source, project persistence,
or render logs.

## Design references and licensing

The following repositories were studied as design references:

- [iancanderson/openscad-agent](https://github.com/iancanderson/openscad-agent): iterative
  refinement, render feedback, and geometry validation. Its README declares the project MIT
  licensed.
- [mitsuhiko/agent-stuff OpenSCAD skill](https://github.com/mitsuhiko/agent-stuff/tree/main/skills/openscad):
  parameter conventions, validation, multi-angle inspection, and export discipline. The repository
  is Apache-2.0 licensed.

No reference text, shell command workflow, source code, or filename-based revision scheme was
copied. Their local OpenSCAD/CLI assumptions were translated into original instructions for
SCADmate's browser-based WASM renderer, Three.js preview, and existing immutable revision history.

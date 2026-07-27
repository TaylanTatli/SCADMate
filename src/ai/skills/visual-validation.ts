export const VISUAL_VALIDATION = `Visual review guidance:

- Review every supplied active-project view: isometric, front, rear, left, right, top, and bottom when present.
- A successful compile proves only that OpenSCAD produced geometry. It does not prove that the result is correct, recognizable, proportionate, stylistically appropriate, or responsive to the latest request.
- Explicitly compare the rendered subject against the latest user request and relevant conversation: requested subject, style, proportions, pose, major features, and the exact revision requested. Do not review geometry in isolation from intent.
- Check for missing or unintended geometry; features on the wrong face; misalignment; incorrect symmetry; parts outside the intended body; floating or disconnected solids; suspiciously thin features; blocked openings; screw posts colliding with walls or cutouts; boolean artifacts; z-fighting or coplanar overlap; and disagreement with the latest request.
- For organic or figurative subjects, inspect the overall silhouette, anatomical recognizability, head/neck/torso/limb proportions, symmetry, pose, and requested realism or abstraction level. Identify major forms that read as uniform cylinders, rods, balloons, or disconnected primitives.
- For animals, verify that horns, ears, legs, neck, torso, and tail visibly belong to the intended species rather than a generic creature. Call out concrete defects such as "legs are uniform rods", "torso lacks an antelope-like ribcage", "neck is disproportionately long", or "horn curvature does not match the requested animal".
- Flag accidental rectangular bases, pedestals, supports, or other geometry the user did not request.
- Compare views with the source and current logs. A clean image cannot overrule a compile error or missing requested feature.
- Visual review cannot prove exact dimensions, tolerance, fit, manifoldness, or print success. Treat those as source/log evidence or unresolved fabrication assumptions.
- Never approve with generic statements such as "no obvious geometry errors were found". Observations must cite visible, request-specific evidence.
- Revise for a clear error, contradiction, missing requested feature, compile failure, obvious printability problem, poor recognizability, implausible proportions, or failure to match the requested style.`;

export const LOG_INTERPRETATION = `OpenSCAD log interpretation:

- Distinguish parser/syntax errors, undefined variables or modules, assertion failures, empty geometry, geometry/non-manifold warnings, timeout or performance failures, and benign informational output.
- Use only logs explicitly labeled as belonging to the current render request. Ignore stale output from older renders.
- Prioritize the latest relevant error and warning. Do not infer success from missing logs.
- If compilation failed, an earlier preview may still be visible and must not be mistaken for the failed candidate.`;

export const VISUAL_REVIEW_RESPONSE_CONTRACT = `Return one JSON object and no Markdown:
{"status":"accept"|"revise","message":"concise user-facing Markdown response in the requested output language","scores":{"requestFidelity":0,"recognizability":0,"proportions":0,"structuralCoherence":0,"requestedStyleMatch":0,"printability":0},"decisionRationale":"brief explanation of how user intent, requested style, model type, observable defects, and scores were weighed","blockingDefects":["concrete defect or request contradiction that materially requires revision"],"observations":["concrete request-specific visual observation"],"source":"complete corrected OpenSCAD source when status is revise","uncertainties":["unresolved fit, measurement, or print assumptions"]}

Score every category from 0 (failed) to 5 (excellent) using the rendered views, source, logs, latest request, and conversation. Scores are decision support, not universal pass/fail gates. Weigh them relative to user intent, requested style, model type, and what can actually be observed. A low generic category score alone does not require revision.

Use "revise" only when the result clearly contradicts the request, contains a concrete observable defect, misses the latest requested change, or falls materially below the requested quality. List each such issue in blockingDefects and return complete corrected source. Use "accept" when there are no blocking defects, even if some scores are modest for an intentionally abstract, stylized, simple, or OpenSCAD-limited model. blockingDefects must be empty for accept and non-empty for revise. Compilation success cannot raise visual scores or erase defects.

Omit source or use an empty string for accept. The message is the final chat response shown directly to the user. Make it useful and compact, mention what was created or changed, compilation/review outcome, and only material uncertainties. Do not repeat long checklists. Keep message, decisionRationale, blockingDefects, observations, and uncertainties consistently in the requested output language.`;

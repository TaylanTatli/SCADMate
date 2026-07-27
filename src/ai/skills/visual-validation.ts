export const VISUAL_VALIDATION = `Visual review guidance:

- Review every supplied active-project view: isometric, front, rear, left, right, top, and bottom when present.
- Check for missing or unintended geometry; features on the wrong face; misalignment; incorrect symmetry; parts outside the intended body; floating or disconnected solids; suspiciously thin features; blocked openings; screw posts colliding with walls or cutouts; boolean artifacts; z-fighting or coplanar overlap; and disagreement with the latest request.
- Compare views with the source and current logs. A clean image cannot overrule a compile error or missing requested feature.
- Visual review cannot prove exact dimensions, tolerance, fit, manifoldness, or print success. Treat those as source/log evidence or unresolved fabrication assumptions.
- Revise only for a clear error, contradiction, missing requested feature, compile failure, or obvious printability problem.`;

export const LOG_INTERPRETATION = `OpenSCAD log interpretation:

- Distinguish parser/syntax errors, undefined variables or modules, assertion failures, empty geometry, geometry/non-manifold warnings, timeout or performance failures, and benign informational output.
- Use only logs explicitly labeled as belonging to the current render request. Ignore stale output from older renders.
- Prioritize the latest relevant error and warning. Do not infer success from missing logs.
- If compilation failed, an earlier preview may still be visible and must not be mistaken for the failed candidate.`;

export const VISUAL_REVIEW_RESPONSE_CONTRACT = `Return one JSON object and no Markdown:
{"status":"accept"|"revise","observations":["short evidence-based observation"],"source":"complete corrected OpenSCAD source when status is revise","uncertainties":["unresolved fit, measurement, or print assumptions"]}

Use "accept" only when the current candidate compiled and no clear correction is justified. Omit source or use an empty string for accept.`;

export const OPENSCAD_AUTHORING = `OpenSCAD authoring guidance:

- Use millimetres as the default unit unless the user states otherwise.
- Put important dimensions near the top as named variables. Expose uncertain physical-fit assumptions as parameters.
- Use SCADmate-compatible Customizer declarations: number; boolean; "string"; // [min:max]; // [min:step:max]; and // [option1, option2].
- Organize substantial features into readable modules and use a deliberate, consistent coordinate system.
- Prefer simple boolean geometry. Use a small named overlap epsilon for cuts when needed; avoid coplanar faces, coincident surfaces, and zero-thickness results.
- Keep $fn performance-aware, using higher resolution only where it materially improves the result. Avoid expensive minkowski() operations when a simpler construction works.
- Produce connected, manifold solids suitable for printing. For multi-part models, add a clear named output selector when useful.
- Comments should explain design intent, coordinate choices, fabrication assumptions, and non-obvious tolerances—not narrate obvious syntax.
- Defaults for walls, holes, clearances, and fasteners are assumptions, not universal facts. Parameterize them and indicate that physical fit must be verified.`;

export const MESH_FORMAT_GUIDANCE = `SCAD, STL, and 3MF boundaries:

- The complete SCAD file is SCADmate's editable parametric source of truth.
- STL is a triangle-mesh output or reference asset; it does not preserve OpenSCAD parameters or design intent.
- Imported STL may be used as a reference or boolean input only when the embedded WASM runtime supports it with reasonable performance.
- Never imply that an arbitrary STL can be reliably reconstructed as clean parametric SCAD.
- 3MF may contain multiple objects and metadata, but it does not replace the SCAD source-of-truth workflow in this MVP.
- Do not turn the task into general mesh editing.`;

export const SOURCE_RESPONSE_CONTRACT = `Required response format:
Return one JSON object and no Markdown fence:
{"source":"complete updated OpenSCAD source","message":"concise user-facing Markdown response in the requested output language"}

The source must be a complete replacement file, never a patch or diff. The message is shown in chat as soon as generation completes, before visual review finishes. Briefly describe what was created or changed and mention important dimensional assumptions without claiming that visual review, exact fit, or printability has already been confirmed.`;

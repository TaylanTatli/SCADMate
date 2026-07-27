# Third-party notices

SCADmate directly depends on the packages listed in `package-lock.json`. The principal runtime
components are:

| Component                                                   | Purpose                                  | License           |
| ----------------------------------------------------------- | ---------------------------------------- | ----------------- |
| [Tauri](https://github.com/tauri-apps/tauri)                | Native desktop host and bundling         | Apache-2.0 OR MIT |
| [keyring-rs](https://github.com/hwchen/keyring-rs)          | Operating-system credential vault access | Apache-2.0 OR MIT |
| [OpenSCAD WASM](https://github.com/openscad/openscad-wasm)  | Browser CAD compilation                  | GPL-2.0           |
| [OpenSCAD](https://github.com/openscad/openscad)            | CAD engine inside the WASM bundle        | GPL-2.0-or-later  |
| [Three.js](https://github.com/mrdoob/three.js)              | STL parsing and interactive 3D display   | MIT               |
| [Monaco Editor](https://github.com/microsoft/monaco-editor) | Source editing                           | MIT               |
| [React](https://github.com/facebook/react)                  | User interface                           | MIT               |
| [Dexie](https://github.com/dexie/Dexie.js)                  | IndexedDB abstraction                    | Apache-2.0        |
| [Lucide](https://github.com/lucide-icons/lucide)            | Interface icons                          | ISC               |
| [Streamdown](https://github.com/vercel/streamdown)          | AI response Markdown rendering           | Apache-2.0        |

The OpenSCAD WASM bundle contains further compiled dependencies. Its upstream repository and the
[OpenSCAD Playground license inventory](https://github.com/openscad/openscad-playground/blob/master/LICENSE.md)
provide the relevant notices and full license texts.

FrameOS cases and OpenSCAD Playground were used only for architectural research. SCADmate contains
no copied source or assets from those projects.

The [iancanderson/openscad-agent](https://github.com/iancanderson/openscad-agent) project (declared
MIT in its README) and [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff)
(Apache-2.0) were studied for agent-workflow concepts including iterative rendering, parameter
discipline, multi-angle review, and validation. SCADmate uses original project-specific wording and
does not copy their skills, source, shell commands, or filename-based workflows.

OpenAI Codex CLI and Anthropic Claude Code are optional, user-installed external programs. They are
not included in SCADmate's source or distribution and remain subject to their providers' terms.

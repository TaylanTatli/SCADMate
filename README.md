# SCADmate

SCADmate is a lightweight Tauri desktop workspace for AI-assisted OpenSCAD modeling. Describe a
printable model in chat, receive a complete `.scad` source file, compile it locally with OpenSCAD
WebAssembly, and inspect or export the resulting STL.

## MVP capabilities

- ChatGPT subscription sign-in through the user's local Codex installation
- Claude Pro/Max sign-in through the user's local Claude Code installation
- OpenAI-compatible provider with a user-supplied endpoint, API key, and model
- Complete-source generation and follow-up editing with current source, recent chat, and logs
- Task-focused OpenSCAD authoring, visual-validation, iteration, and printability guidance
- Six-view AI render review with at most two automatic correction attempts
- Monaco source editor and OpenSCAD Customizer-compatible controls
- Worker-based compilation, captured logs, a hard timeout, and stale-result rejection
- Interactive Three.js preview with orbit, pan, zoom, fit, and camera reset
- Last-valid preview preservation on compilation failure
- AI revision undo/redo plus `.scad` and STL downloads
- IndexedDB project persistence and OS credential-vault storage for compatible API keys
- A printable sample 4.3-inch display enclosure that works without an AI connection

## Development

Requirements:

- Node.js 22 or newer and npm
- Rust 1.77.2 or newer
- Tauri's platform prerequisites
- Codex or Claude Code on `PATH` only when that local subscription provider will be used

Install dependencies and start the desktop app:

```sh
npm install
npm run dev
```

The development command starts Vite, compiles the Rust host, and opens the desktop window. In
**Settings**, choose Codex, Claude Code, or Compatible API. Local CLI providers use the command
found on `PATH`; an explicit executable path can be entered when a GUI-launched application has a
different PATH. Use the connection button to start the provider's browser login.
The AI output-language setting controls generated chat responses, review notes, and OpenSCAD
comments without changing the application interface language.

Useful commands:

```sh
npm run dev:web       # browser UI only; ChatGPT sign-in is unavailable
npm run build:web     # type-check and build the frontend
npm run tauri:build   # build desktop installers/bundles
npm run format        # format frontend, docs, configuration, and Rust
npm run format:check  # verify formatting without modifying files
npm run typecheck
npm test
npm run lint
```

`cargo-tauri` may be installed globally, but it is not required: the repository pins
`@tauri-apps/cli` and npm scripts use that project-local version.

End users do not need Node.js, Rust, or OpenSCAD. They install only the optional subscription CLI
they intend to use (`codex` for ChatGPT or `claude` for Claude). Compatible API users need neither.
SCADmate does not redistribute either AI CLI, keeping the desktop package small and leaving CLI
updates and licensing with the original provider.

## Security boundaries

- There is no localhost HTTP bridge.
- ChatGPT and Claude credentials stay in their CLI's local credential store and are never exposed
  to the WebView.
- Compatible-provider API keys are stored through the operating system credential vault.
- Compatible API requests originate in Rust, go only to the configured endpoint, and do not depend
  on browser CORS support.
- Codex generation runs in an isolated temporary directory with a read-only sandbox. Claude Code
  runs there with built-in tools and MCP access disabled. Both have a two-minute hard timeout.
- Projects, chat history, revisions, and non-secret settings remain local in the WebView's
  IndexedDB.

The initial OpenSCAD WASM load is approximately 14 MB. No local OpenSCAD binary is required.

## OpenSCAD WebAssembly integration and license

SCADmate uses [`openscad-wasm`](https://github.com/openscad/openscad-wasm), currently npm version
`0.0.4`. Its headless Emscripten runtime exposes a virtual filesystem and CLI-compatible
`callMain`; the worker writes `/input.scad`, renders with the Manifold backend, and transfers
`/output.stl` to the UI. The package is GPL-2.0 licensed, so this MVP is marked `GPL-2.0-only`.
See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

The FrameOS cases repository and OpenSCAD Playground were consulted only as architectural
references. No source code or design assets were copied from either project.

SCADmate is distributed under the [GNU GPL version 2 only](./LICENSE).

See [docs/architecture.md](./docs/architecture.md) for data flow and subsystem boundaries and
[docs/ai-skills.md](./docs/ai-skills.md) for the OpenSCAD agent skill and validation workflow.
Tagged native releases and optional signing are documented in
[docs/releasing.md](./docs/releasing.md).

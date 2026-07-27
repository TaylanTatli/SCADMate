# SCADmate architecture

SCADmate is a Tauri desktop application with a React WebView and a small Rust host. Rendering, AI,
persistence, source manipulation, and presentation remain separate so each boundary can evolve
without replacing the others.

## Data flow

```text
User prompt
    │
    ▼
Task-aware skill assembly ──► AIProvider ── current source + chat + current render evidence
    ├── CodexProvider ── Tauri IPC ── Rust ── local Codex / ChatGPT session
    ├── ClaudeCodeProvider ── Tauri IPC ── Rust ── local Claude / Pro or Max session
    └── OpenAICompatibleProvider ── Tauri IPC ── Rust ── configured HTTPS endpoint
    │
    ▼ complete .scad source
Revision history ──► editor / Customizer ──750 ms debounce──► module Web Worker
    │                                                      │
    └──────────── IndexedDB                                ▼
                                                 openscad-wasm callMain
                                                  │ logs       │ STL
                                                  ▼            ▼
                                              logs panel   Three.js viewer
                                                                  │
                                      six current views + logs ◄───┘
                                                   │
                                         structured AI review
                                         (maximum 2 corrections)
```

## Responsibilities

- `src/ai/skills`: task selection, focused policy/authoring/visual/printability guidance, prompt
  assembly, current-request log trimming, and visual-review response validation.
- `src/ai`: provider adapters and the bounded automatic-correction coordinator.
- `src/native/tauri.ts`: the only frontend boundary for native IPC.
- `src-tauri/src/lib.rs`: local CLI discovery, Codex and Claude login/status/generation,
  compatible HTTP calls, timeouts, response validation, and OS credential-vault access.
- `src/workers`: WASM initialization, Emscripten filesystem, compilation, and log capture. Each
  new render terminates an active worker and request IDs reject late results.
- `src/components/PreviewPanel.tsx`: parses only successfully compiled STL, owns Three.js camera
  controls, and captures six deterministic current-model views for review.
- `src/lib/customizer.ts`: parses top-level scalar assignments and bracket comments, then performs
  a narrow source replacement for the selected declaration.
- `src/lib/revisions.ts`: immutable complete-source revision history. AI updates branch history;
  manual edits are snapshotted before the next AI replacement.
- `src/persistence`: a small Dexie boundary for the current project and non-secret settings. The
  compatible API key crosses the native boundary to the OS credential vault instead.
- `src/App.tsx`: workflow orchestration and short-lived UI state. It preserves the previous STL
  buffer when a new compile fails.

## Rendering lifecycle

Editor and Customizer changes schedule one render after 750 ms. Starting a render increments a
monotonic request ID, terminates an older worker, and displays a busy state over the prior mesh.
The worker compiles once—there is no retry loop—and returns binary STL plus stdout/stderr. A result
is applied only when its ID matches the latest request. A 45-second timeout terminates the worker.
Errors update logs but never clear the last valid STL.

## AI lifecycle

Prompt assembly first classifies the call as create, revision, visual review, or mesh-reference
work and includes only the corresponding skill sections. The selected provider receives the user
request, complete current source, up to eight recent messages, useful Customizer values, and
current-request render evidence. Source generation must return a complete file.

For Codex, Tauri starts the configured local executable in an isolated temporary directory. Codex reads only
the generated context file, uses its own ChatGPT credential store, runs with a read-only sandbox,
and writes the final response to a temporary output file. The WebView never receives OAuth tokens.

Claude Code uses the same isolated-directory boundary. It runs in non-interactive print mode with
session persistence and MCP discovery disabled. Its tool set is empty for source generation and
limited to reading the current temporary PNG files during visual review. Context is supplied over
stdin and only stdout is accepted as the generated source.

For compatible APIs, the WebView invokes a Rust command. Rust loads the key supplied for the
request, posts an OpenAI-compatible chat-completions payload to the configured endpoint, and
returns only the generated source. Persistent key storage uses the operating system credential
vault.

SCADmate strips accidental Markdown fences, rejects empty content, and snapshots manual edits.
After generation it compiles the candidate, captures isometric/front/rear/left/right/top images,
and requests a structured review. Clear defects may trigger a complete-source correction followed
by another compile/review, but the hard limit is two automatic corrections. Only valid sources are
committed; failures retain the previous valid source and preview. Logs are scoped by render request
ID and trimmed before submission.

## Distribution

SCADmate bundles only its Tauri host and web assets. Codex and Claude Code remain optional
user-managed integrations discovered through `PATH` or an explicit path in Settings. This avoids
shipping hundreds of megabytes of provider binaries and lets each provider own authentication,
updates, and licensing.

## Future extension points

Additional AI providers implement `AIProvider` and can add a native command without changing the
editor or rendering flow. A different compiler can retain the render request/response contract.
Multi-project storage can add project IDs without touching AI or rendering, and an optional backend
can later proxy providers or synchronize projects without changing the source model.

See [ai-skills.md](./ai-skills.md) for skill selection, evidence handling, source-of-truth rules,
and reference attribution.

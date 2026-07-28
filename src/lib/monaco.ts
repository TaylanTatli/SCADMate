import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/contrib/find/browser/findController.js";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

// The React wrapper otherwise loads Monaco from a CDN, which is unavailable
// under SCADmate's production Tauri content-security policy.
loader.config({ monaco });

import Editor, { type OnMount } from "@monaco-editor/react";
import { useRef } from "react";
import { Braces, Search, SlidersHorizontal, TextSearch } from "lucide-react";
import type { CustomizerVariable } from "../lib/customizer";
import { CustomizerView } from "./CustomizerView";

export type WorkspaceTab = "source" | "customizer";

interface WorkspacePanelProps {
  source: string;
  tab: WorkspaceTab;
  variables: CustomizerVariable[];
  onSourceChange: (source: string) => void;
  onTabChange: (tab: WorkspaceTab) => void;
  onVariableChange: (
    variable: CustomizerVariable,
    value: number | boolean | string,
  ) => void;
}

const configureEditor: OnMount = (_editor, monaco) => {
  if (
    !monaco.languages
      .getLanguages()
      .some((language) => language.id === "openscad")
  ) {
    monaco.languages.register({ id: "openscad" });
    monaco.languages.setLanguageConfiguration("openscad", {
      comments: {
        lineComment: "//",
        blockComment: ["/*", "*/"],
      },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
      ],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"', notIn: ["string", "comment"] },
        { open: "/*", close: "*/", notIn: ["string"] },
      ],
      surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
      ],
      wordPattern: /(-?\d*\.\d\w*)|([^\W\d][\w$]*)/,
      folding: {
        markers: {
          start: /^\s*\/\/\s*#?region\b/,
          end: /^\s*\/\/\s*#?endregion\b/,
        },
      },
    });
    monaco.languages.setMonarchTokensProvider("openscad", {
      keywords: [
        "module",
        "function",
        "if",
        "else",
        "for",
        "let",
        "each",
        "intersection_for",
        "true",
        "false",
        "undef",
      ],
      tokenizer: {
        root: [
          [/\/\/.*$/, "comment"],
          [/\/\*/, "comment", "@comment"],
          [/"(?:[^"\\]|\\.)*"/, "string"],
          [/-?\d+(?:\.\d+)?/, "number"],
          [
            /[a-zA-Z_$][\w$]*/,
            { cases: { "@keywords": "keyword", "@default": "identifier" } },
          ],
          [/[{}()[\]]/, "@brackets"],
        ],
        comment: [
          [/[^/*]+/, "comment"],
          [/\*\//, "comment", "@pop"],
          [/[/*]/, "comment"],
        ],
      },
    });
  }
};

export function WorkspacePanel({
  source,
  tab,
  variables,
  onSourceChange,
  onTabChange,
  onVariableChange,
}: WorkspacePanelProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const mountEditor: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    configureEditor(editor, monaco);
  };
  const runEditorAction = (actionId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    void editor.getAction(actionId)?.run();
  };

  return (
    <section className="panel workspace-panel" aria-label="OpenSCAD workspace">
      <div className="workspace-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "source"}
          className={tab === "source" ? "active" : ""}
          onClick={() => onTabChange("source")}
        >
          <Braces size={15} />
          <span className="workspace-tab-label">Source</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "customizer"}
          className={tab === "customizer" ? "active" : ""}
          onClick={() => onTabChange("customizer")}
        >
          <SlidersHorizontal size={15} />
          <span className="workspace-tab-label">Customizer</span>
          <span className="tab-count">{variables.length}</span>
        </button>
        <div className="editor-search-actions" aria-label="Source search">
          <button
            type="button"
            onClick={() => runEditorAction("actions.find")}
            disabled={tab !== "source"}
            title="Find (Ctrl+F)"
          >
            <Search size={13} />
            <span>Find</span>
          </button>
          <button
            type="button"
            onClick={() =>
              runEditorAction("editor.action.startFindReplaceAction")
            }
            disabled={tab !== "source"}
            title="Find and replace (Ctrl+H)"
          >
            <TextSearch size={13} />
            <span>Replace</span>
          </button>
        </div>
      </div>
      <div className="workspace-content">
        {tab === "source" ? (
          <Editor
            height="100%"
            language="openscad"
            value={source}
            onChange={(value) => onSourceChange(value ?? "")}
            onMount={mountEditor}
            theme="vs-dark"
            options={{
              automaticLayout: true,
              minimap: { enabled: false },
              fontFamily:
                "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
              fontSize: 13,
              lineHeight: 21,
              padding: { top: 18, bottom: 18 },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              renderLineHighlight: "gutter",
              bracketPairColorization: { enabled: true },
            }}
          />
        ) : (
          <CustomizerView variables={variables} onChange={onVariableChange} />
        )}
      </div>
    </section>
  );
}

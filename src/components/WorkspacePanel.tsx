import Editor, { type OnMount } from "@monaco-editor/react";
import { Braces, SlidersHorizontal } from "lucide-react";
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
          Source
        </button>
        <button
          role="tab"
          aria-selected={tab === "customizer"}
          className={tab === "customizer" ? "active" : ""}
          onClick={() => onTabChange("customizer")}
        >
          <SlidersHorizontal size={15} />
          Customizer
          <span className="tab-count">{variables.length}</span>
        </button>
      </div>
      <div className="workspace-content">
        {tab === "source" ? (
          <Editor
            height="100%"
            language="openscad"
            value={source}
            onChange={(value) => onSourceChange(value ?? "")}
            onMount={configureEditor}
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

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Download, Play, Redo2, Settings, Sparkles, Undo2 } from "lucide-react";
import { ChatPanel } from "./components/ChatPanel";
import { LogsPanel } from "./components/LogsPanel";
import {
  PreviewPanel,
  type PreviewPanelHandle,
} from "./components/PreviewPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { WorkspacePanel, type WorkspaceTab } from "./components/WorkspacePanel";
import { createAIProvider } from "./ai/provider";
import {
  runAutomaticCorrection,
  type RenderEvidence,
} from "./ai/automaticCorrection";
import {
  parseCustomizerVariables,
  updateCustomizerVariable,
  type CustomizerVariable,
} from "./lib/customizer";
import { downloadBlob, downloadSource } from "./lib/downloads";
import { formatUnknownError } from "./lib/errors";
import {
  NEW_PROJECT_NAME,
  projectNameFromRequest,
  upsertProjectSummary,
} from "./lib/projects";
import { RenderCoordinator } from "./lib/renderCoordinator";
import {
  commitRevision,
  createHistory,
  redoRevision,
  undoRevision,
} from "./lib/revisions";
import { BLANK_SOURCE, hasScadContent } from "./lib/scadSource";
import {
  loadActiveProject,
  loadProject,
  loadProjects,
  loadSettings,
  saveActiveProjectId,
  saveProject,
  saveSettings,
} from "./persistence/database";
import { SAMPLE_SOURCE } from "./sample";
import type {
  AISettings,
  ChatMessage,
  ProjectSummary,
  RenderLog,
  RenderResponse,
  RenderStatus,
  RevisionHistory,
  StoredProject,
} from "./types";

const DEFAULT_SETTINGS: AISettings = {
  provider: "codex",
  codexModel: "",
  codexExecutable: "",
  claudeModel: "",
  claudeExecutable: "",
  endpoint: "https://api.openai.com/v1/chat/completions",
  apiKey: "",
  model: "",
};

const newMessage = (
  role: ChatMessage["role"],
  content: string,
  status: ChatMessage["status"] = "done",
): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  createdAt: Date.now(),
  status,
});

function classifyLog(
  text: string,
  fallback: "stdout" | "stderr",
): RenderLog["stream"] {
  if (/\berror\b/i.test(text)) return "error";
  if (/\bwarning\b/i.test(text)) return "warning";
  return fallback;
}

function renderLogsForResponse(response: RenderResponse): RenderLog[] {
  const timestamp = Date.now();
  const outputLogs: RenderLog[] = [
    ...response.stdout.map((text) => ({
      id: crypto.randomUUID(),
      requestId: response.requestId,
      stream: classifyLog(text, "stdout"),
      text,
      timestamp,
    })),
    ...response.stderr.map((text) => ({
      id: crypto.randomUUID(),
      requestId: response.requestId,
      stream: classifyLog(text, "stderr"),
      text,
      timestamp,
    })),
  ];
  return [
    ...outputLogs,
    {
      id: crypto.randomUUID(),
      requestId: response.requestId,
      stream: response.ok ? "stdout" : "error",
      text: response.ok
        ? `Render completed in ${(response.elapsedMs / 1000).toFixed(2)} seconds.`
        : formatUnknownError(
            response.error,
            "OpenSCAD compilation failed without an error message.",
          ),
      timestamp,
    },
  ];
}

function waitForPreviewPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function App() {
  const [projectId, setProjectId] = useState<string>(() => crypto.randomUUID());
  const [projectName, setProjectName] = useState("Sample display enclosure");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [source, setSource] = useState(SAMPLE_SOURCE);
  const [history, setHistory] = useState<RevisionHistory>(() =>
    createHistory(SAMPLE_SOURCE),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("source");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<RenderLog[]>([]);
  const [renderStatus, setRenderStatus] = useState<RenderStatus>("idle");
  const [renderError, setRenderError] = useState<string>();
  const [renderElapsed, setRenderElapsed] = useState<number>();
  const [stl, setStl] = useState<ArrayBuffer | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [leftWidth, setLeftWidth] = useState(25);
  const [rightWidth, setRightWidth] = useState(35);

  const gridRef = useRef<HTMLElement>(null);
  const previewRef = useRef<PreviewPanelHandle>(null);
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const hasValidStlRef = useRef(false);
  const lastValidSourceRef = useRef(SAMPLE_SOURCE);
  const skipNextDebouncedRenderRef = useRef<string | undefined>(undefined);
  const coordinatorRef = useRef(new RenderCoordinator());
  const variables = useMemo(() => parseCustomizerVariables(source), [source]);
  const configured =
    settings.provider !== "openai-compatible" ||
    Boolean(settings.endpoint && settings.apiKey && settings.model);

  const createProjectSnapshot = useCallback(
    (updatedAt = Date.now()): StoredProject => ({
      id: projectId,
      name: projectName,
      source,
      messages,
      history,
      updatedAt,
    }),
    [history, messages, projectId, projectName, source],
  );

  const persistCurrentProject = useCallback(async () => {
    const project = createProjectSnapshot();
    if (project.history.present.source !== project.source) {
      project.history = commitRevision(
        project.history,
        project.source,
        "Manual edits before leaving conversation",
      );
    }
    await saveProject(project);
    setProjects((current) => upsertProjectSummary(current, project));
  }, [createProjectSnapshot]);

  useEffect(() => {
    void Promise.all([loadActiveProject(), loadProjects(), loadSettings()])
      .then(([project, storedProjects, storedSettings]) => {
        setProjects(
          storedProjects.map(({ id, name, updatedAt }) => ({
            id,
            name,
            updatedAt,
          })),
        );
        if (project) {
          setProjectId(project.id);
          setProjectName(project.name);
          setSource(project.source);
          setHistory(project.history);
          setMessages(project.messages);
          void saveActiveProjectId(project.id);
        }
        if (storedSettings) setSettings(storedSettings);
      })
      .catch(() => {
        setLogs((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            stream: "warning",
            text: "Local project storage could not be opened. Work will continue without persistence.",
            timestamp: Date.now(),
          },
        ]);
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const project = createProjectSnapshot();
      void Promise.all([
        saveProject(project),
        saveActiveProjectId(project.id),
      ]).then(() => {
        setProjects((current) => upsertProjectSummary(current, project));
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [createProjectSnapshot, hydrated]);

  const applyRenderResponse = useCallback((response: RenderResponse) => {
    if (!coordinatorRef.current.accepts(response)) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    workerRef.current?.terminate();
    workerRef.current = null;
    setRenderElapsed(response.elapsedMs);

    const outputLogs = renderLogsForResponse(response);

    if (response.ok) {
      hasValidStlRef.current = true;
      setStl(response.stl);
      setRenderStatus("success");
      setRenderError(undefined);
      setLogs(outputLogs);
    } else {
      const error = formatUnknownError(
        response.error,
        "OpenSCAD compilation failed without an error message.",
      );
      setRenderStatus("error");
      setRenderError(error);
      setLogs(outputLogs);
      setLogsOpen(true);
    }
  }, []);

  const renderSource = useCallback(
    (nextSource: string): Promise<RenderResponse> =>
      new Promise((resolve) => {
        workerRef.current?.terminate();
        if (timeoutRef.current !== null)
          window.clearTimeout(timeoutRef.current);
        const requestId = coordinatorRef.current.begin();
        setRenderStatus(hasValidStlRef.current ? "rendering" : "initializing");
        setRenderError(undefined);
        setLogs([]);

        const worker = new Worker(
          new URL("./workers/openscad.worker.ts", import.meta.url),
          {
            type: "module",
          },
        );
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<RenderResponse>) => {
          if (event.data.ok && coordinatorRef.current.accepts(event.data)) {
            lastValidSourceRef.current = nextSource;
          }
          applyRenderResponse(event.data);
          resolve(event.data);
        };
        worker.onerror = (event) => {
          const response: RenderResponse = {
            type: "result",
            requestId,
            ok: false,
            error: `OpenSCAD WebAssembly initialization failed: ${event.message}`,
            stdout: [],
            stderr: [],
            elapsedMs: 0,
          };
          applyRenderResponse(response);
          resolve(response);
        };
        worker.postMessage({ type: "render", requestId, source: nextSource });
        timeoutRef.current = window.setTimeout(() => {
          if (coordinatorRef.current.currentRequestId !== requestId) return;
          worker.terminate();
          workerRef.current = null;
          const response: RenderResponse = {
            type: "result",
            requestId,
            ok: false,
            error: "OpenSCAD render exceeded the 45 second browser limit.",
            stdout: [],
            stderr: [],
            elapsedMs: 45_000,
          };
          applyRenderResponse(response);
          resolve(response);
        }, 45_000);
      }),
    [applyRenderResponse],
  );

  useEffect(() => {
    if (!hydrated) return;
    if (!hasScadContent(source)) {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      coordinatorRef.current.begin();
      setRenderStatus("idle");
      setRenderError(undefined);
      setLogs([]);
      return;
    }
    if (skipNextDebouncedRenderRef.current === source) {
      skipNextDebouncedRenderRef.current = undefined;
      return;
    }
    const timer = window.setTimeout(() => void renderSource(source), 750);
    return () => window.clearTimeout(timer);
  }, [hydrated, renderSource, source]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handleChatRequest = async (request: string) => {
    if (!configured) {
      setSettingsOpen(true);
      return;
    }
    const userMessage = newMessage("user", request);
    const contextMessages = [...messages, userMessage];
    if (messages.length === 0 && projectName === NEW_PROJECT_NAME) {
      setProjectName(projectNameFromRequest(request));
    }
    setMessages(contextMessages);
    setIsGenerating(true);
    try {
      const provider = createAIProvider(settings);
      const nextSource = await provider.generateScad({
        userRequest: request,
        currentSource: source.trim() ? source : undefined,
        recentMessages: messages,
        customizerVariables: variables,
        renderStatus,
        renderRequestId: coordinatorRef.current.currentRequestId,
        renderLogs: logs,
      });

      let nextHistory = history;
      if (history.present.source !== source) {
        nextHistory = commitRevision(
          nextHistory,
          source,
          "Manual edits before AI update",
        );
      }

      const correctionResult = await runAutomaticCorrection({
        initialSource: nextSource,
        fallbackSource: lastValidSourceRef.current,
        render: async (candidate): Promise<RenderEvidence> => {
          skipNextDebouncedRenderRef.current = candidate;
          setSource(candidate);
          setWorkspaceTab("source");
          const response = await renderSource(candidate);
          if (!coordinatorRef.current.accepts(response)) {
            throw new Error(
              "A newer render replaced this automatic-review result.",
            );
          }
          const renderLogs = renderLogsForResponse(response);
          let images: RenderEvidence["images"] = [];
          if (response.ok) {
            await waitForPreviewPaint();
            images = (await previewRef.current?.captureViews()) ?? [];
          }
          return {
            ok: response.ok,
            requestId: response.requestId,
            status: response.ok ? "success" : "error",
            logs: renderLogs,
            images,
            ...(!response.ok ? { error: response.error } : {}),
          };
        },
        review: (candidate, evidence) =>
          provider.reviewRender({
            userRequest: request,
            currentSource: candidate,
            recentMessages: contextMessages,
            customizerVariables: parseCustomizerVariables(candidate),
            renderStatus: evidence.status,
            renderRequestId: evidence.requestId,
            renderLogs: evidence.logs,
            renderedViews: evidence.images,
          }),
      });

      correctionResult.validSources.forEach((validSource, index) => {
        nextHistory = commitRevision(
          nextHistory,
          validSource,
          index === 0
            ? `AI · ${request.slice(0, 56)}`
            : `AI visual correction ${index} · ${request.slice(0, 40)}`,
        );
      });
      if (nextHistory.present.source !== correctionResult.source) {
        nextHistory = commitRevision(
          nextHistory,
          correctionResult.source,
          "Restored last valid source",
        );
      }
      skipNextDebouncedRenderRef.current = correctionResult.source;
      setHistory(nextHistory);
      setSource(correctionResult.source);
      setMessages((current) => [
        ...current,
        newMessage(
          "assistant",
          [
            correctionResult.accepted
              ? "Updated, compiled, and visually reviewed the complete OpenSCAD model."
              : "Automatic review stopped with the last valid model preserved.",
            correctionResult.correctionAttempts
              ? `${correctionResult.correctionAttempts} automatic correction attempt(s) were used.`
              : "",
            correctionResult.observations.length
              ? `Review observations: ${correctionResult.observations.slice(-3).join(" ")}`
              : "",
            correctionResult.uncertainties.length
              ? `Unresolved: ${correctionResult.uncertainties.join(" ")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          correctionResult.accepted ? "done" : "error",
        ),
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        newMessage(
          "assistant",
          error instanceof Error
            ? error.message
            : "The AI request failed. Your source was not changed.",
          "error",
        ),
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVariableChange = (
    variable: CustomizerVariable,
    value: number | boolean | string,
  ) => {
    setSource((current) => updateCustomizerVariable(current, variable, value));
  };

  const handleUndo = () => {
    const next = undoRevision(history);
    setHistory(next);
    setSource(next.present.source);
  };

  const handleRedo = () => {
    const next = redoRevision(history);
    setHistory(next);
    setSource(next.present.source);
  };

  const resetProjectRuntime = (nextSource: string) => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    coordinatorRef.current.begin();
    hasValidStlRef.current = false;
    lastValidSourceRef.current = nextSource;
    setStl(null);
    setLogs([]);
    setRenderStatus("idle");
    setRenderError(undefined);
    setWorkspaceTab("source");
  };

  const openProject = async (project: StoredProject) => {
    setProjectId(project.id);
    setProjectName(project.name);
    setSource(project.source);
    setHistory(project.history);
    setMessages(project.messages);
    resetProjectRuntime(project.source);
    await saveActiveProjectId(project.id);
  };

  const handleNewProject = async () => {
    if (isGenerating) return;
    await persistCurrentProject();
    const now = Date.now();
    const project: StoredProject = {
      id: crypto.randomUUID(),
      name: NEW_PROJECT_NAME,
      source: BLANK_SOURCE,
      messages: [],
      history: createHistory(BLANK_SOURCE, "New blank project"),
      updatedAt: now,
    };
    await saveProject(project);
    setProjects((current) => upsertProjectSummary(current, project));
    await openProject(project);
  };

  const handleSelectProject = async (nextProjectId: string) => {
    if (nextProjectId === projectId || isGenerating) return;
    await persistCurrentProject();
    const project = await loadProject(nextProjectId);
    if (project) await openProject(project);
  };

  const beginResize =
    (side: "left" | "right") => (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const move = (pointerEvent: PointerEvent) => {
        const rect = gridRef.current?.getBoundingClientRect();
        if (!rect) return;
        if (side === "left") {
          setLeftWidth(
            Math.max(
              18,
              Math.min(
                40,
                ((pointerEvent.clientX - rect.left) / rect.width) * 100,
              ),
            ),
          );
        } else {
          setRightWidth(
            Math.max(
              24,
              Math.min(
                48,
                ((rect.right - pointerEvent.clientX) / rect.width) * 100,
              ),
            ),
          );
        }
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
    };

  const layoutStyle = {
    "--left-width": `${leftWidth}%`,
    "--right-width": `${rightWidth}%`,
  } as CSSProperties;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="SCADmate">
          <span className="brand-mark">
            <Sparkles size={16} />
          </span>
          <strong>
            SCAD<span>mate</span>
          </strong>
        </div>
        <nav className="top-actions" aria-label="Project actions">
          <button
            className="icon-button"
            onClick={handleUndo}
            disabled={history.past.length === 0}
            title="Undo source revision"
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon-button"
            onClick={handleRedo}
            disabled={history.future.length === 0}
            title="Redo source revision"
          >
            <Redo2 size={16} />
          </button>
          <button
            className="toolbar-button"
            onClick={() => downloadSource(source)}
          >
            <Download size={15} />
            SCAD
          </button>
          <button
            className="toolbar-button"
            disabled={!stl}
            onClick={() =>
              stl && downloadBlob(new Blob([stl]), "scadmate-model.stl")
            }
          >
            <Download size={15} />
            STL
          </button>
          <button
            className="render-button"
            onClick={() => renderSource(source)}
            disabled={
              !hasScadContent(source) ||
              renderStatus === "rendering" ||
              renderStatus === "initializing"
            }
          >
            <Play size={14} fill="currentColor" />
            Render
          </button>
          <button
            className="icon-button"
            onClick={() => setSettingsOpen(true)}
            title="AI settings"
          >
            <Settings size={17} />
          </button>
        </nav>
      </header>

      <main className="workspace-grid" ref={gridRef} style={layoutStyle}>
        <ChatPanel
          key={projectId}
          activeProjectId={projectId}
          projectName={projectName}
          projects={projects}
          messages={messages}
          isGenerating={isGenerating}
          configured={configured}
          onNewProject={() => void handleNewProject()}
          onSend={handleChatRequest}
          onSelectProject={(id) => void handleSelectProject(id)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="resize-handle" onPointerDown={beginResize("left")} />
        <WorkspacePanel
          source={source}
          tab={workspaceTab}
          variables={variables}
          onSourceChange={setSource}
          onTabChange={setWorkspaceTab}
          onVariableChange={handleVariableChange}
        />
        <div className="resize-handle" onPointerDown={beginResize("right")} />
        <PreviewPanel
          ref={previewRef}
          stl={stl}
          status={renderStatus}
          elapsedMs={renderElapsed}
          error={renderError}
        />
      </main>

      <LogsPanel
        logs={logs}
        open={logsOpen}
        onToggle={() => setLogsOpen((open) => !open)}
        onClear={() => setLogs([])}
      />

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(nextSettings) => {
            setSettings(nextSettings);
            void saveSettings(nextSettings);
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}

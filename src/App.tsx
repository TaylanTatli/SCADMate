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
  type AutomaticCorrectionResult,
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
  ActiveWorkflow,
  isAbortError,
  preserveStoppedSource,
  stoppedRenderStatus,
} from "./lib/activeWorkflow";
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
  deleteProject,
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
  outputLanguage: "auto",
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

interface ActiveGenerationRun {
  workflow: ActiveWorkflow;
  assistantMessageId: string;
  candidateSource?: string;
}

interface PendingRender {
  requestId: number;
  resolve: (response: RenderResponse) => void;
}

function formatCompletionMessage(
  result: Pick<
    AutomaticCorrectionResult,
    | "accepted"
    | "correctionAttempts"
    | "latestEvidence"
    | "message"
    | "observations"
    | "uncertainties"
  >,
  generatedMessage?: string,
): string {
  if (result.message?.trim()) return result.message.trim();
  if (result.latestEvidence?.ok && generatedMessage?.trim()) {
    return generatedMessage.trim();
  }

  const sections = [
    result.accepted
      ? "### Model ready\n\nThe model compiled successfully and the rendered views were reviewed."
      : "### Review incomplete\n\nThe last valid model and preview were preserved.",
  ];

  if (result.correctionAttempts > 0) {
    sections.push(`**Automatic corrections:** ${result.correctionAttempts}`);
  }

  const observations = result.observations.slice(-3);
  if (observations.length > 0) {
    sections.push(
      `#### Review\n\n${observations
        .map((observation) => `- ${observation.trim()}`)
        .join("\n")}`,
    );
  }

  if (result.uncertainties.length > 0) {
    sections.push(
      `#### Needs verification\n\n${result.uncertainties
        .map((uncertainty) => `- ${uncertainty.trim()}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

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
  const pendingRenderRef = useRef<PendingRender | null>(null);
  const activeRunRef = useRef<ActiveGenerationRun | null>(null);
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
          setMessages(
            project.messages.map((message) =>
              message.status === "sending"
                ? {
                    ...message,
                    content: `${message.content}\n\nThis operation was interrupted before it completed.`,
                    status: "error",
                  }
                : message,
            ),
          );
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
        const superseded = pendingRenderRef.current;
        if (superseded) {
          superseded.resolve({
            type: "result",
            requestId: superseded.requestId,
            ok: false,
            error: "Render superseded by a newer request.",
            stdout: [],
            stderr: [],
            elapsedMs: 0,
          });
          pendingRenderRef.current = null;
        }
        workerRef.current?.terminate();
        if (timeoutRef.current !== null)
          window.clearTimeout(timeoutRef.current);
        const requestId = coordinatorRef.current.begin();
        const settle = (response: RenderResponse) => {
          if (pendingRenderRef.current?.requestId === requestId) {
            pendingRenderRef.current = null;
          }
          resolve(response);
        };
        pendingRenderRef.current = { requestId, resolve };
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
          settle(event.data);
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
          settle(response);
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
            error: "OpenSCAD render exceeded the 45 second time limit.",
            stdout: [],
            stderr: [],
            elapsedMs: 45_000,
          };
          applyRenderResponse(response);
          settle(response);
        }, 45_000);
      }),
    [applyRenderResponse],
  );

  const cancelActiveRender = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    coordinatorRef.current.begin();
    const pending = pendingRenderRef.current;
    pendingRenderRef.current = null;
    pending?.resolve({
      type: "result",
      requestId: pending.requestId,
      ok: false,
      error: "Render stopped.",
      stdout: [],
      stderr: [],
      elapsedMs: 0,
    });
    setRenderStatus(stoppedRenderStatus(hasValidStlRef.current));
    setRenderError(undefined);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!hasScadContent(source)) {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      coordinatorRef.current.begin();
      const resetTimer = window.setTimeout(() => {
        setRenderStatus("idle");
        setRenderError(undefined);
        setLogs([]);
      }, 0);
      return () => window.clearTimeout(resetTimer);
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

  const handleStop = useCallback(() => {
    const run = activeRunRef.current;
    if (!run) return;

    run.workflow.stop();
    activeRunRef.current = null;
    cancelActiveRender();

    const lastValidSource = lastValidSourceRef.current;
    setHistory((current) =>
      preserveStoppedSource(current, run.candidateSource, lastValidSource),
    );
    setSource((current) => {
      skipNextDebouncedRenderRef.current =
        current === lastValidSource ? undefined : lastValidSource;
      return lastValidSource;
    });
    setMessages((current) =>
      current.map((message) =>
        message.id === run.assistantMessageId
          ? {
              ...message,
              content: "Stopped.",
              status: "done",
            }
          : message,
      ),
    );
    setIsGenerating(false);
  }, [cancelActiveRender]);

  useEffect(() => {
    const stopOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !activeRunRef.current || settingsOpen) {
        return;
      }
      event.preventDefault();
      handleStop();
    };
    window.addEventListener("keydown", stopOnEscape);
    return () => window.removeEventListener("keydown", stopOnEscape);
  }, [handleStop, settingsOpen]);

  const handleChatRequest = async (request: string) => {
    if (!configured) {
      setSettingsOpen(true);
      return;
    }
    if (activeRunRef.current) return;
    const userMessage = newMessage("user", request);
    const contextMessages = [...messages, userMessage];
    const assistantMessage = newMessage(
      "assistant",
      "Generating the OpenSCAD source…",
      "sending",
    );
    const run: ActiveGenerationRun = {
      workflow: new ActiveWorkflow(),
      assistantMessageId: assistantMessage.id,
    };
    activeRunRef.current = run;
    const ensureActive = () => {
      run.workflow.assertActive();
      if (activeRunRef.current !== run) {
        throw new DOMException("Stopped", "AbortError");
      }
    };
    const updateAssistantMessage = (
      content: string,
      status: ChatMessage["status"],
      reasoning?: string,
    ) => {
      if (!run.workflow.active || activeRunRef.current !== run) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content,
                status,
                reasoning: reasoning ?? message.reasoning,
              }
            : message,
        ),
      );
    };
    if (messages.length === 0 && projectName === NEW_PROJECT_NAME) {
      setProjectName(projectNameFromRequest(request));
    }
    setMessages([...contextMessages, assistantMessage]);
    setIsGenerating(true);
    try {
      const provider = createAIProvider(settings);
      const generation = await provider.generateScad({
        signal: run.workflow.signal,
        userRequest: request,
        outputLanguage: settings.outputLanguage,
        currentSource: source.trim() ? source : undefined,
        recentMessages: messages,
        customizerVariables: variables,
        renderStatus,
        renderRequestId: coordinatorRef.current.currentRequestId,
        renderLogs: logs,
      });
      ensureActive();
      const nextSource = generation.source;
      run.candidateSource = nextSource;
      updateAssistantMessage(
        generation.message ??
          "Source generated. Compiling the model in OpenSCAD…",
        "sending",
        generation.reasoning,
      );

      let nextHistory = history;
      if (history.present.source !== source) {
        nextHistory = commitRevision(
          nextHistory,
          source,
          "Manual edits before AI update",
        );
      }

      const correctionResult = await runAutomaticCorrection({
        signal: run.workflow.signal,
        initialSource: nextSource,
        fallbackSource: lastValidSourceRef.current,
        reviewTimeoutMs: 120_000,
        render: async (candidate): Promise<RenderEvidence> => {
          ensureActive();
          run.candidateSource = candidate;
          updateAssistantMessage(
            generation.message ??
              "Compiling and validating the generated geometry…",
            "sending",
            generation.reasoning,
          );
          skipNextDebouncedRenderRef.current = candidate;
          setSource(candidate);
          setWorkspaceTab("source");
          const response = await renderSource(candidate);
          ensureActive();
          if (!coordinatorRef.current.accepts(response)) {
            throw new Error(
              "A newer render replaced this automatic-review result.",
            );
          }
          const renderLogs = renderLogsForResponse(response);
          let images: RenderEvidence["images"] = [];
          if (response.ok) {
            updateAssistantMessage(
              generation.message ??
                "The model was generated and compiled successfully. It is ready to use while automatic visual review continues…",
              "sending",
              generation.reasoning,
            );
            await waitForPreviewPaint();
            ensureActive();
            images = (await previewRef.current?.captureViews()) ?? [];
            ensureActive();
          } else {
            updateAssistantMessage(
              "Compilation reported a problem. Reviewing the logs for a focused correction…",
              "sending",
              generation.reasoning,
            );
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
        review: (candidate, evidence) => {
          ensureActive();
          updateAssistantMessage(
            generation.message ??
              "The model is ready. Running a final check against your request and rendered views…",
            "sending",
            generation.reasoning,
          );
          return provider.reviewRender({
            signal: run.workflow.signal,
            userRequest: request,
            outputLanguage: settings.outputLanguage,
            currentSource: candidate,
            recentMessages: contextMessages,
            customizerVariables: parseCustomizerVariables(candidate),
            renderStatus: evidence.status,
            renderRequestId: evidence.requestId,
            renderLogs: evidence.logs,
            renderedViews: evidence.images,
          });
        },
      });
      ensureActive();

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
      updateAssistantMessage(
        formatCompletionMessage(correctionResult, generation.message),
        correctionResult.latestEvidence?.ok ? "done" : "error",
        generation.reasoning,
      );
    } catch (error) {
      if (
        isAbortError(error) ||
        !run.workflow.active ||
        activeRunRef.current !== run
      ) {
        return;
      }
      updateAssistantMessage(
        error instanceof Error
          ? error.message
          : "The AI request failed. Your source was not changed.",
        "error",
      );
    } finally {
      if (activeRunRef.current === run) {
        run.workflow.complete();
        activeRunRef.current = null;
        setIsGenerating(false);
      }
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

  const createBlankProject = async (): Promise<void> => {
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

  const handleNewProject = async () => {
    if (isGenerating) return;
    await persistCurrentProject();
    await createBlankProject();
  };

  const handleSelectProject = async (nextProjectId: string) => {
    if (nextProjectId === projectId || isGenerating) return;
    await persistCurrentProject();
    const project = await loadProject(nextProjectId);
    if (project) await openProject(project);
  };

  const handleDeleteProject = async (targetProjectId: string) => {
    if (isGenerating) return;
    const target = projects.find((project) => project.id === targetProjectId);
    if (
      !target ||
      !window.confirm(
        `Delete “${target.name}”? This conversation and its source revisions will be removed from this device.`,
      )
    ) {
      return;
    }

    await deleteProject(targetProjectId);
    const remaining = await loadProjects();
    setProjects(
      remaining.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })),
    );
    if (targetProjectId !== projectId) return;

    const nextProject = remaining[0];
    if (nextProject) {
      await openProject(nextProject);
    } else {
      await createBlankProject();
    }
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
    "--left-fr": `${leftWidth}fr`,
    "--center-fr": `${Math.max(1, 100 - leftWidth - rightWidth)}fr`,
    "--right-fr": `${rightWidth}fr`,
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
          onStop={handleStop}
          onSelectProject={(id) => void handleSelectProject(id)}
          onDeleteProject={(id) => void handleDeleteProject(id)}
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

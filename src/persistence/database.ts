import Dexie, { type EntityTable } from "dexie";
import type { AISettings, StoredProject } from "../types";
import {
  isDesktopRuntime,
  nativeLoadApiKey,
  nativeSaveApiKey,
} from "../native/tauri";

interface StoredSettings extends AISettings {
  id: "ai";
}

interface StoredAppState {
  id: "workspace";
  activeProjectId: string;
}

const database = new Dexie("scadmate") as Dexie & {
  projects: EntityTable<StoredProject, "id">;
  settings: EntityTable<StoredSettings, "id">;
  appState: EntityTable<StoredAppState, "id">;
};

database.version(1).stores({
  projects: "id, updatedAt",
  settings: "id",
});

database.version(2).stores({
  projects: "id, updatedAt",
  settings: "id",
  appState: "id",
});

export async function loadProject(
  projectId: string,
): Promise<StoredProject | undefined> {
  return database.projects.get(projectId);
}

export async function loadProjects(): Promise<StoredProject[]> {
  return database.projects.orderBy("updatedAt").reverse().toArray();
}

export async function loadActiveProject(): Promise<StoredProject | undefined> {
  const appState = await database.appState.get("workspace");
  if (appState) {
    const active = await database.projects.get(appState.activeProjectId);
    if (active) return active;
  }

  const legacy = await database.projects.get("current");
  if (legacy) return legacy;

  return database.projects.orderBy("updatedAt").last();
}

export async function saveProject(project: StoredProject): Promise<void> {
  await database.projects.put(project);
}

export async function saveActiveProjectId(projectId: string): Promise<void> {
  await database.appState.put({
    id: "workspace",
    activeProjectId: projectId,
  });
}

export async function loadSettings(): Promise<AISettings | undefined> {
  const settings = await database.settings.get("ai");
  if (!settings) return undefined;
  let apiKey = settings.apiKey ?? "";
  if (isDesktopRuntime()) {
    try {
      apiKey = (await nativeLoadApiKey()) ?? "";
    } catch {
      apiKey = "";
    }
  }
  return {
    provider: settings.provider ?? "codex",
    codexModel: settings.codexModel ?? "",
    codexExecutable: settings.codexExecutable ?? "",
    claudeModel: settings.claudeModel ?? "",
    claudeExecutable: settings.claudeExecutable ?? "",
    endpoint: settings.endpoint ?? "https://api.openai.com/v1/chat/completions",
    apiKey,
    model: settings.model ?? "",
  };
}

export async function saveSettings(settings: AISettings): Promise<void> {
  if (isDesktopRuntime()) {
    await nativeSaveApiKey(settings.apiKey);
    await database.settings.put({ id: "ai", ...settings, apiKey: "" });
    return;
  }
  await database.settings.put({ id: "ai", ...settings });
}

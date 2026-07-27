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

const database = new Dexie("scadmate") as Dexie & {
  projects: EntityTable<StoredProject, "id">;
  settings: EntityTable<StoredSettings, "id">;
};

database.version(1).stores({
  projects: "id, updatedAt",
  settings: "id",
});

export async function loadProject(): Promise<StoredProject | undefined> {
  return database.projects.get("current");
}

export async function saveProject(project: StoredProject): Promise<void> {
  await database.projects.put(project);
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

import type { ProjectSummary, StoredProject } from "../types";

export const NEW_PROJECT_NAME = "New conversation";

export function projectNameFromRequest(request: string): string {
  const compact = request.replace(/\s+/g, " ").trim();
  if (compact.length <= 48) return compact || NEW_PROJECT_NAME;
  return `${compact.slice(0, 47).trimEnd()}…`;
}

export function upsertProjectSummary(
  projects: ProjectSummary[],
  project: StoredProject,
): ProjectSummary[] {
  const summary: ProjectSummary = {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
  };
  return [
    summary,
    ...projects.filter((candidate) => candidate.id !== project.id),
  ].sort((left, right) => right.updatedAt - left.updatedAt);
}

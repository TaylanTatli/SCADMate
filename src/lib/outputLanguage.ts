import type { OutputLanguage } from "../types";

export function outputLanguageInstruction(language: OutputLanguage): string {
  if (language === "tr") {
    return "Use Turkish for all human-readable output, including OpenSCAD comments, review observations, uncertainties, and summaries. Do not mix languages except for code identifiers or established technical terms.";
  }
  if (language === "en") {
    return "Use English for all human-readable output, including OpenSCAD comments, review observations, uncertainties, and summaries. Do not mix languages except for code identifiers or established technical terms.";
  }
  return "Use the same language as the latest user request for all human-readable output, including OpenSCAD comments, review observations, uncertainties, and summaries. Do not mix languages except for code identifiers or established technical terms.";
}

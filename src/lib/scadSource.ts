export const BLANK_SOURCE =
  "// Describe your model in chat, or start writing OpenSCAD here.\n";

export function hasScadContent(source: string): boolean {
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .trim().length > 0
  );
}

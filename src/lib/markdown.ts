export function stripMarkdownFences(input: string): string {
  const trimmed = input.trim();
  const fenced = trimmed.match(
    /^```(?:openscad|scad)?\s*\n?([\s\S]*?)\n?```$/i,
  );
  return (fenced?.[1] ?? trimmed).trim();
}

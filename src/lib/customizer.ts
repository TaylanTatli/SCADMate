export type CustomizerKind = "number" | "boolean" | "string" | "enum";

export interface CustomizerVariable {
  name: string;
  kind: CustomizerKind;
  value: number | boolean | string;
  section: string;
  options?: Array<number | string>;
  min?: number;
  max?: number;
  step?: number;
  start: number;
  end: number;
}

function parseScalar(raw: string): number | boolean | string | null {
  const value = raw.trim();
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  const quoted = value.match(/^"(.*)"$/);
  return quoted ? (quoted[1] ?? "") : null;
}

function parseControl(
  comment: string | undefined,
): Partial<CustomizerVariable> {
  const spec = comment?.match(/\[([^\]]+)\]/)?.[1]?.trim();
  if (!spec) return {};

  const range = spec.split(":").map((part) => Number(part.trim()));
  if (
    (range.length === 2 || range.length === 3) &&
    range.every(Number.isFinite)
  ) {
    return range.length === 2
      ? { min: range[0], max: range[1], step: 1 }
      : { min: range[0], step: range[1], max: range[2] };
  }

  const options = spec
    .split(",")
    .map((part) => parseScalar(part) ?? part.trim())
    .filter(
      (value): value is number | string =>
        typeof value === "number" || typeof value === "string",
    );
  return options.length > 0 ? { options } : {};
}

export function parseCustomizerVariables(source: string): CustomizerVariable[] {
  const variables: CustomizerVariable[] = [];
  const declaration =
    /^([ \t]*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?(?:\d+\.?\d*|\.\d+)|true|false|"(?:[^"\\]|\\.)*")\s*;\s*(?:\/\/\s*(.*))?$/gm;
  const sectionPattern = /\/\*\s*\[([^\]]+)\]\s*\*\//g;
  const sections = [...source.matchAll(sectionPattern)];

  for (const match of source.matchAll(declaration)) {
    const name = match[2];
    const rawValue = match[3];
    if (!name || !rawValue || name.startsWith("$") || match.index === undefined)
      continue;
    const value = parseScalar(rawValue);
    if (value === null) continue;
    let sectionMatch: RegExpMatchArray | undefined;
    for (let index = sections.length - 1; index >= 0; index -= 1) {
      const candidate = sections[index];
      if (candidate && (candidate.index ?? 0) < match.index) {
        sectionMatch = candidate;
        break;
      }
    }
    const section = sectionMatch?.[1]?.trim() ?? "Parameters";
    if (section.toLowerCase() === "hidden") continue;

    const control = parseControl(match[4]);
    const baseKind: CustomizerKind =
      typeof value === "number"
        ? "number"
        : typeof value === "boolean"
          ? "boolean"
          : "string";
    variables.push({
      name,
      value,
      kind: control.options ? "enum" : baseKind,
      section,
      ...control,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return variables;
}

export function updateCustomizerVariable(
  source: string,
  variable: CustomizerVariable,
  nextValue: number | boolean | string,
): string {
  const original = source.slice(variable.start, variable.end);
  const serialized =
    typeof nextValue === "string"
      ? JSON.stringify(nextValue)
      : String(nextValue);
  const declaration = new RegExp(
    `(${variable.name}\\s*=\\s*)(?:-?(?:\\d+\\.?\\d*|\\.\\d+)|true|false|"(?:[^"\\\\]|\\\\.)*")`,
  );
  const updated = original.replace(declaration, `$1${serialized}`);
  return `${source.slice(0, variable.start)}${updated}${source.slice(variable.end)}`;
}

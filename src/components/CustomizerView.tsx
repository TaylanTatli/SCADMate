import type { CustomizerVariable } from "../lib/customizer";

interface CustomizerViewProps {
  variables: CustomizerVariable[];
  onChange: (
    variable: CustomizerVariable,
    value: number | boolean | string,
  ) => void;
}

function labelFor(name: string): string {
  return name
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CustomizerView({ variables, onChange }: CustomizerViewProps) {
  if (variables.length === 0) {
    return (
      <div className="customizer-empty">
        <span>No parameters found</span>
        <p>
          Add top-level assignments such as <code>width = 80; // [40:120]</code>
          .
        </p>
      </div>
    );
  }

  const sections = variables.reduce<Map<string, CustomizerVariable[]>>(
    (grouped, variable) => {
      const current = grouped.get(variable.section) ?? [];
      current.push(variable);
      grouped.set(variable.section, current);
      return grouped;
    },
    new Map(),
  );

  return (
    <div className="customizer-view">
      {[...sections].map(([section, sectionVariables]) => (
        <fieldset key={section}>
          <legend>{section}</legend>
          {sectionVariables.map((variable) => (
            <label className="customizer-field" key={variable.name}>
              <span>
                {labelFor(variable.name)}
                <small>{variable.name}</small>
              </span>
              {variable.kind === "boolean" ? (
                <input
                  type="checkbox"
                  checked={Boolean(variable.value)}
                  onChange={(event) => onChange(variable, event.target.checked)}
                />
              ) : variable.kind === "enum" ? (
                <select
                  value={String(variable.value)}
                  onChange={(event) => {
                    const option = variable.options?.find(
                      (candidate) => String(candidate) === event.target.value,
                    );
                    if (option !== undefined) onChange(variable, option);
                  }}
                >
                  {variable.options?.map((option) => (
                    <option key={String(option)} value={String(option)}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : variable.kind === "number" && variable.min !== undefined ? (
                <div className="range-control">
                  <input
                    type="range"
                    min={variable.min}
                    max={variable.max}
                    step={variable.step}
                    value={Number(variable.value)}
                    onChange={(event) =>
                      onChange(variable, Number(event.target.value))
                    }
                  />
                  <input
                    className="number-input"
                    type="number"
                    min={variable.min}
                    max={variable.max}
                    step={variable.step}
                    value={Number(variable.value)}
                    onChange={(event) =>
                      onChange(variable, Number(event.target.value))
                    }
                  />
                </div>
              ) : (
                <input
                  className="text-input"
                  type={variable.kind === "number" ? "number" : "text"}
                  value={String(variable.value)}
                  onChange={(event) =>
                    onChange(
                      variable,
                      variable.kind === "number"
                        ? Number(event.target.value)
                        : event.target.value,
                    )
                  }
                />
              )}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

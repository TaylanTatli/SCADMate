export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadSource(
  source: string,
  filename = "scadmate-model.scad",
): void {
  downloadBlob(
    new Blob([source], { type: "text/plain;charset=utf-8" }),
    filename,
  );
}

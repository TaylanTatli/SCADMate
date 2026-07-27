/// <reference lib="webworker" />

import { createOpenSCAD } from "openscad-wasm";
import type { RenderRequest, RenderResponse } from "../types";

const scope = self as DedicatedWorkerGlobalScope;

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

scope.onmessage = async (event: MessageEvent<RenderRequest>) => {
  if (event.data.type !== "render") return;
  const { requestId, source } = event.data;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const startedAt = performance.now();

  try {
    const wrapper = await createOpenSCAD({
      noInitialRun: true,
      print: (text) => stdout.push(text),
      printErr: (text) => stderr.push(text),
    });
    const instance = wrapper.getInstance();
    instance.FS.writeFile("/input.scad", source);
    instance.callMain([
      "/input.scad",
      "--backend=manifold",
      "-o",
      "/output.stl",
    ]);
    const output = instance.FS.readFile("/output.stl", { encoding: "binary" });
    const stl = output.buffer.slice(
      output.byteOffset,
      output.byteOffset + output.byteLength,
    );
    const response: RenderResponse = {
      type: "result",
      requestId,
      ok: true,
      stl,
      stdout,
      stderr,
      elapsedMs: performance.now() - startedAt,
    };
    scope.postMessage(response, [stl]);
  } catch (error) {
    const response: RenderResponse = {
      type: "result",
      requestId,
      ok: false,
      error: formatError(error),
      stdout,
      stderr,
      elapsedMs: performance.now() - startedAt,
    };
    scope.postMessage(response);
  }
};

export {};

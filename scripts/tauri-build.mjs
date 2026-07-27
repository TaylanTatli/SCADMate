import { spawnSync } from "node:child_process";

const executable = process.platform === "win32" ? "tauri.cmd" : "tauri";
const result = spawnSync(executable, ["build", ...process.argv.slice(2)], {
  env: {
    ...process.env,
    // linuxdeploy's bundled strip is older than Arch Linux's RELR-enabled system libraries.
    NO_STRIP: process.env.NO_STRIP ?? "true",
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

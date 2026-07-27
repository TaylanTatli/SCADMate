import { readFile, writeFile } from "node:fs/promises";

const rawVersion =
  process.argv[2]?.trim() || process.env.GITHUB_REF_NAME?.trim() || "";
const version = rawVersion.startsWith("v") ? rawVersion.slice(1) : rawVersion;
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!semver.test(version)) {
  throw new Error(
    `Expected a semantic version such as v1.2.3 or v1.2.3-beta.1, received "${rawVersion}".`,
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

const packageJson = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const tauriConfig = await readJson("src-tauri/tauri.conf.json");
const cargoToml = await readFile("src-tauri/Cargo.toml", "utf8");
const cargoLock = await readFile("src-tauri/Cargo.lock", "utf8");

packageJson.version = version;
packageLock.version = version;
if (packageLock.packages?.[""]) packageLock.packages[""].version = version;
tauriConfig.version = version;

const updatedCargoToml = cargoToml.replace(
  /(\[package\][\s\S]*?\nversion = ")[^"]+(")/,
  `$1${version}$2`,
);
const updatedCargoLock = cargoLock.replace(
  /(\[\[package\]\]\nname = "scadmate"\nversion = ")[^"]+(")/,
  `$1${version}$2`,
);
if (
  updatedCargoToml === cargoToml &&
  !cargoToml.includes(`version = "${version}"`)
) {
  throw new Error("Could not update the Cargo package version.");
}
if (
  updatedCargoLock === cargoLock &&
  !cargoLock.includes(`name = "scadmate"\nversion = "${version}"`)
) {
  throw new Error("Could not update the Cargo lockfile version.");
}

await Promise.all([
  writeJson("package.json", packageJson),
  writeJson("package-lock.json", packageLock),
  writeJson("src-tauri/tauri.conf.json", tauriConfig),
  writeFile("src-tauri/Cargo.toml", updatedCargoToml),
  writeFile("src-tauri/Cargo.lock", updatedCargoLock),
]);

process.stdout.write(`SCADmate version set to ${version}\n`);

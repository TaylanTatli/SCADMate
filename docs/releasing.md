# Releases and signing

Pushing a semantic-version tag matching `v*`, for example `v1.2.0` or `v1.2.0-beta.1`, starts
`.github/workflows/release.yml`. The workflow validates the tag, derives the application version,
runs the fast frontend lint, type, and unit-test checks, and then builds on native GitHub-hosted
runners. Each native Tauri build performs the real production frontend and Rust compilation for
that operating system.

The release contains:

- Linux x64: Debian package, RPM package, and AppImage
- macOS arm64 and Intel: DMG images
- Windows x64: NSIS setup executable

One GitHub Release is created after every build succeeds. GitHub generates its release notes.
Semantic-version tags with a prerelease component, such as `v1.2.0-rc.1`, are marked as
prereleases. Per-tag concurrency prevents two release runs from publishing the same tag
simultaneously.

The `scripts/set-version.mjs` helper synchronizes `package.json`, `package-lock.json`, and
`src-tauri/tauri.conf.json` inside each CI job. Tauri reads the installer version from its own
configuration, so the Rust crate and lockfile remain untouched. Release version changes do not
need to be committed separately.

## Unsigned builds

No signing secrets are required by the workflow. Windows installers are unsigned. macOS builds use
Apple's ad-hoc `-` identity so Apple Silicon can execute the app, but they are not Developer ID
signed or notarized. Users may still see operating-system security warnings.

For public macOS distribution, configure an Apple Developer ID certificate and notarization
credentials as described in the
[Tauri macOS signing guide](https://v2.tauri.app/distribute/sign/macos/). Typical CI inputs include
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, a real `APPLE_SIGNING_IDENTITY`, and either
Apple ID or App Store Connect API notarization credentials. Replace the workflow's ad-hoc identity
only after the certificate import is configured.

For trusted Windows distribution, configure either a PFX certificate/signing command or Azure
Artifact Signing according to the
[Tauri Windows signing guide](https://v2.tauri.app/distribute/sign/windows/). Certificate material
and passwords must live in GitHub encrypted secrets and must never be committed to the repository.

## Local workflow

Release automation does not change local commands:

```sh
npm run dev
npm run build:web
npm run tauri:build
```

Run `npm run format` before submitting changes. `npm run format:check` performs a non-mutating local
format validation.

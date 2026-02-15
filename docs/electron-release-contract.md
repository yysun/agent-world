# Electron Release Contract (macOS + Windows)

## Purpose

Define the release/version contract for Agent World desktop distribution so packaging, GitHub publishing, and in-app updates use a consistent, deterministic policy.

## Selected Stack

- Packaging: `electron-builder`
- In-app updates: `electron-updater`
- Release/update provider: GitHub Releases

## Version Contract

- Single source of truth: root `/package.json` `version`
- Electron package `/electron/package.json` version must match root version for every release.
- Enforced commands:
  - `npm run version:sync:electron`
  - `npm run version:check:electron`
  - `npm run release:prepare`

## Release Trigger Policy

- Stable release tag: `vX.Y.Z`
- Prerelease tag: `vX.Y.Z-beta.N` or `vX.Y.Z-rc.N`
- Stable channel users only receive stable releases.
- Prerelease channel must be opt-in.

## Required Desktop Artifacts

### macOS

- Installer artifact(s): DMG for each target architecture (x64, arm64, or universal strategy)
- Updater package artifact(s): ZIP for matching architecture targets
- Updater metadata: `latest-mac.yml`

### Windows

- Installer artifact(s): NSIS installer for x64 and arm64 (where supported)
- Updater package artifact(s): generated blockmap assets for installer/update payloads
- Updater metadata: `latest.yml`

## Signing / Trust Requirements

### macOS

- Code signing required
- Notarization required for production release artifacts
- Release publish must fail when signing/notarization prerequisites are unavailable
- Unsigned/notarization-missing builds may still be produced locally, but are expected to trigger Gatekeeper warnings and/or manual bypass prompts.

### Windows

- Code signing required for production release artifacts
- Release publish must fail when signing prerequisites are unavailable
- Unsigned builds may still run, but users should expect SmartScreen warnings and reduced trust signals.

## CI Secret Baseline

- `GH_TOKEN` (release publishing)
- macOS signing/notarization:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`
- Windows signing:
  - `WIN_CSC_LINK`
  - `WIN_CSC_KEY_PASSWORD`

Notes:
- In GitHub Actions for this repo, `secrets.GITHUB_TOKEN` is mapped to `GH_TOKEN` in publish steps.
- Local-only dist builds (`--publish never`) do not require GitHub release setup/secrets.

## Guardrails

- CI must fail fast on:
  - version mismatch (root vs electron)
  - missing required signing secrets for release jobs
  - missing required update metadata/artifacts
- Release asset naming must remain deterministic per version/platform/architecture.

## Local Verification Commands

Run from repository root:

- `npm run release:prepare`
- `npm run electron:package:base`
- `npm run electron:dist:dir`
- `npm run electron:dist:mac`
- `npm run electron:dist:win`
- `npm run electron:dist:win:arm64`

Notes:
- `electron:package:base` validates the build pipeline and stages runtime assets.
- `electron:dist:mac` and `electron:dist:win` require platform-compatible builder prerequisites and signing setup for production-equivalent output.
- `electron:dist:win:arm64` may require a Windows ARM64-capable build host due native module rebuild constraints.

## Notes

- Linux packaging is out of current scope.
- This contract is Phase 1 baseline for the publish plan and will be consumed by Phase 2 (packaging) and Phase 3 (GitHub workflow automation).

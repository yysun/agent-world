# Electron Release Process (macOS + Windows)

This document explains the desktop release flow for Agent World and answers common release questions directly.

## Short Answers

1. **`npm version`**  
   Use it at repo root to set the release version (`patch`, `minor`, `major`, or explicit version).

2. **`npm run ...`**  
   After versioning, run release-prep and packaging commands to produce desktop artifacts.

3. **Should `dist/` be pushed to GitHub?**  
   **No.** Build output folders are generated artifacts and are ignored by git (`dist/`, `electron/release/`, etc.).

4. **Does auto-updater check versions from GitHub?**  
   **Yes, by design.** Packaging is configured with GitHub as the publish/update provider.  
   Runtime update checks in app UI/main process are **pending** the update implementation phase (Phase 4).

## Versioning Rules

- Single source of truth: root `package.json` `version`.
- Electron version must match root version.
- `npm version ...` also creates a git commit and tag by default (unless your npm/git config changes that behavior).
- Use:
  - `npm version patch` (or `minor` / `major`)
  - `npm run release:prepare`

`release:prepare` runs:
- `npm run version:sync:electron`
- `npm run version:check:electron`

This syncs and verifies `electron/package.json` version.

## Local Build and Packaging Commands

Run from repo root:

```bash
# 1) bump version
npm version patch

# 2) sync/check version contract
npm run release:prepare

# 3) stage runtime assets + build electron app
npm run electron:package:base

# 4) build distributables
npm run electron:dist:mac
npm run electron:dist:win
```

Optional:

```bash
npm run electron:dist:dir        # unpacked app bundle
npm run electron:dist:all        # mac + win (x64 path)
npm run electron:dist:win:arm64  # host/toolchain dependent
```

## What Gets Produced

Artifacts are written to `electron/release/` during packaging.

Typical outputs:
- macOS:
  - `Agent World-<version>-mac-arm64.dmg`
  - `Agent World-<version>-mac-arm64.zip`
  - `latest-mac.yml`
- Windows:
  - `Agent World-<version>-setup-x64.exe`
  - `latest.yml`

Blockmap files are also generated for updater support.

## GitHub: What To Push vs What To Publish

Push to git:
- source code
- config files
- docs

Do **not** push:
- `dist/`
- `release/`
- `electron/release/`

Publish to GitHub Releases:
- desktop installer artifacts
- updater metadata files (`latest*.yml`)
- associated blockmap files

## Auto-Update Behavior

### Source of truth for updates

Updates are resolved from **GitHub Releases** (configured in Electron builder publish settings).

### How version comparison works

- Updater compares installed app version vs latest release metadata.
- Stable tags (e.g. `v0.10.0`) should be used for stable channel.
- Prerelease tags (e.g. `v0.11.0-beta.1`) should be used only for prerelease channel workflows.

### Current implementation status

- Packaging and updater metadata generation: **implemented**.
- In-app check/download/install UI flow: **pending** (planned for Phase 4).

## Required Secrets for Production Publishing

GitHub:
- `GH_TOKEN`

macOS signing/notarization:
- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

Windows signing:
- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

If required signing/notarization prerequisites are missing, release publishing should fail.

### How to set these in GitHub Actions

1. Open repository **Settings**.
2. Go to **Secrets and variables** → **Actions**.
3. In **Repository secrets**, click **New repository secret** and add each secret name/value:
   - `CSC_LINK`
   - `CSC_KEY_PASSWORD`
   - `APPLE_ID`
   - `APPLE_APP_SPECIFIC_PASSWORD`
   - `APPLE_TEAM_ID`
   - `WIN_CSC_LINK`
   - `WIN_CSC_KEY_PASSWORD`
4. Ensure workflow permissions allow release publishing (`contents: write`), as configured in `.github/workflows/electron-release.yml`.

Notes:
- This workflow maps `secrets.GITHUB_TOKEN` to `GH_TOKEN` in the release steps, so a separate `GH_TOKEN` repository secret is typically not required for this pipeline.
- If you run release commands locally (outside GitHub Actions), you must export these as shell environment variables before running packaging/publish commands.

### Local shell example (manual publish)

```bash
export GH_TOKEN="<github-token>"

export CSC_LINK="<base64-or-file-url-to-mac-cert>"
export CSC_KEY_PASSWORD="<mac-cert-password>"
export APPLE_ID="<apple-id-email>"
export APPLE_APP_SPECIFIC_PASSWORD="<app-specific-password>"
export APPLE_TEAM_ID="<team-id>"

export WIN_CSC_LINK="<base64-or-file-url-to-windows-cert>"
export WIN_CSC_KEY_PASSWORD="<windows-cert-password>"
```

## Recommended Release Sequence (Manual)

```bash
# from clean branch
npm version patch
npm run release:prepare
npm run electron:dist:mac
npm run electron:dist:win
```

Then:
1. Create GitHub release with matching tag (for example `v0.10.1`).
2. Upload files from `electron/release/`:
   - installers
   - `latest*.yml`
   - blockmaps
3. Verify installer download and launch.
4. Verify update path from previous installed version.

## FAQ

### Do we commit generated installers?
No. Keep installers as release assets, not git files.

### Why do we need both installer and `latest*.yml`?
Installer is for fresh install. `latest*.yml` is for updater version resolution.

### Why sync versions between root and electron package?
To prevent release drift and updater confusion.

### Do local builds require GitHub setup/secrets?
No for local-only distribution builds. The local dist scripts use `--publish never`, so GitHub release setup/secrets are not required for `npm run electron:dist:mac`, `npm run electron:dist:win`, or `npm run electron:dist:all`.

### What happens if I do not sign the build?
- macOS: artifacts may build locally, but users should expect Gatekeeper warnings and/or manual bypass prompts; missing notarization further reduces install trust for distribution.
- Windows: artifacts may build locally, but users should expect SmartScreen warnings because the installer binary has no trusted code-signing identity.
- CI production publishing is intentionally guarded and should fail when required signing secrets are missing.

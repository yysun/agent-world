# Requirement: Publish Agent World Electron App for macOS and Windows via GitHub

**Date**: 2026-02-14  
**Type**: Release & Distribution  
**Status**: ✅ Requirements Reviewed (AR)

## Architecture Review (AR)

**Review Date**: 2026-02-14  
**Reviewer**: AI Assistant  
**Result**: ✅ APPROVED WITH REVISIONS

### Review Summary

The requirement direction is feasible and aligned with the project state, but needed stronger constraints around updater-compatible artifacts, signing/notarization gates, and version-source consistency. These revisions remove ambiguity that would otherwise cause release/update failures.

### Validated Assumptions

- GitHub Releases can be the distribution and update source for the desktop app.
- macOS desktop distribution requires signed/notarized builds for trust and install reliability.
- Windows desktop distribution requires signed builds for trust and install reliability.
- In-app update requires release assets beyond a basic installer artifact (updater-compatible package + metadata).
- Root and Electron package versions must be coordinated to avoid release/update drift.

### Options Considered

- **Option A (Selected)**: Use Electron packaging + updater integration with GitHub Releases as provider.
  - Pros: standard Electron update lifecycle, predictable metadata contract, CI-friendly.
  - Cons: stricter signing/notarization and release-asset requirements.
- **Option B (Not selected)**: Build installer artifacts only and implement custom update logic.
  - Pros: fewer framework constraints initially.
  - Cons: higher long-term maintenance and reliability risk.
- **Option C (Not selected)**: Keep manual download/replace updates only.
  - Pros: simplest implementation.
  - Cons: does not satisfy in-app upgrade requirement.

## Overview

Enable Agent World Electron desktop delivery for macOS and Windows so end users can install the app through an installer flow, receive new versions from GitHub releases, and update the app from within the app.

## Goals

- Publish macOS and Windows Electron desktop releases to GitHub for each production version.
- Provide an installer-based user installation flow (not source-code setup).
- Provide in-app update detection and upgrade execution for newer published versions.

## Functional Requirements

- **REQ-1**: The system must produce installable macOS and Windows desktop release artifacts for Agent World Electron.
- **REQ-2**: The release artifacts must be published to GitHub in a user-consumable release workflow.
- **REQ-3**: Users must be able to install Agent World from the published installer artifact without building from source.
- **REQ-4**: The desktop app must expose its current application version in the UI.
- **REQ-5**: The desktop app must check for newer versions from the configured GitHub release source.
- **REQ-6**: The app must notify the user when an update is available and provide an explicit action to install it.
- **REQ-7**: The app must support downloading and applying updates from published releases.
- **REQ-8**: The app must preserve user workspace and world data across app upgrades.
- **REQ-9**: If update installation fails, the app must remain usable on the current installed version.
- **REQ-10**: The release process must support repeated versioned publishing without manual file renaming or ad-hoc asset handling.
- **REQ-11**: Release notes associated with each published version must be accessible to users before installing an update.
- **REQ-12**: The installed app must launch successfully on supported macOS environments for both Apple Silicon and Intel targets.
- **REQ-13**: Each release must publish installer artifacts and updater-compatible artifacts/metadata required for in-app update resolution.
- **REQ-14**: The app must support both automatic startup update checks and an explicit user-initiated "Check for updates" action.
- **REQ-15**: Release and update channels (stable and optional prerelease) must be explicitly defined and enforced in publish/update behavior.
- **REQ-16**: Release artifacts used for install/update must be signed and, where required by platform policy, notarized before publication.
- **REQ-17**: If required signing/notarization requirements are not met, release publication must fail rather than publishing unusable artifacts.
- **REQ-18**: App version displayed in UI and version used for release/update resolution must be derived from a single authoritative version contract.
- **REQ-19**: The installed app must launch successfully on supported Windows environments for both x64 and arm64 targets (where supported by the packaging stack).
- **REQ-20**: Windows installer and updater artifacts must be included in each production release.

## Non-Functional Requirements

- **NFR-1 (Security)**: Distributed app binaries and update payloads must be signed and verifiable by the platform trust model.
- **NFR-2 (Reliability)**: Update checks and downloads must fail gracefully with clear user messaging.
- **NFR-3 (Usability)**: Installer and update flows must require minimal manual steps from end users.
- **NFR-4 (Observability)**: Release and update lifecycle states (check, available, download, install result) must be visible via logs.
- **NFR-5 (Maintainability)**: Versioning and publishing must follow a consistent, repeatable release contract.
- **NFR-6 (Operational Safety)**: CI release workflow must be idempotent for reruns and fail-fast on signing/notarization/update-metadata errors.

## Constraints

- Distribution target in this scope is macOS and Windows.
- Release hosting and update source in this scope is GitHub.
- Existing local development workflows for web/cli/electron must remain available.
- macOS release signing/notarization requires Apple developer credentials configured in CI.
- Windows release signing requires Windows code-signing credentials configured in CI.
- In-app update behavior must use only published GitHub release artifacts/metadata (no private side channel).

## Out of Scope

- Linux desktop installers.
- New feature work unrelated to release, install, or update lifecycle.
- Migration of non-desktop distribution channels.

## Acceptance Criteria

- [ ] Versioned macOS and Windows installer artifacts are generated for Agent World Electron.
- [ ] The artifacts are published to a GitHub release and can be downloaded by end users.
- [ ] A user can install Agent World from the published macOS or Windows installer and launch it successfully.
- [ ] The installed app can detect a newly published version and notify the user.
- [ ] A user can trigger update install from within the app and reach the newer version.
- [ ] On update failure, the currently installed app remains launchable and functional.
- [ ] Existing world/workspace data remains intact after successful upgrade.
- [ ] Version and release notes are visible to users during update flow.
- [ ] Release fails when signing/notarization prerequisites are missing or invalid.
- [ ] App supports startup update check and explicit manual update check.
- [ ] Published assets include updater-compatible artifacts/metadata needed for in-app install flow.
- [ ] Displayed app version matches the release/update version contract.
- [ ] Windows users can install from the published installer and successfully complete in-app upgrade flow.

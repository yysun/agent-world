# Requirement: Electron Header Logs Button and Unified Logs Panel

**Date**: 2026-02-27
**Type**: Feature
**Status**: Draft

## Overview

Replace the Electron header refresh action with a logs action that opens a right-side panel and shows application logs from both Electron processes (`main` and `renderer`).

## Goals

- Make runtime diagnostics quickly accessible from the main header.
- Provide a single in-app logs surface that includes both `main` and `renderer` entries.
- Preserve existing world-management capabilities while changing header behavior.

## Functional Requirements

- **REQ-1**: The header refresh button must be replaced with a logs button.
  - The new control must be visible in the same header action region where refresh currently appears.
  - The control must use clear affordance/labeling that indicates logs access.

- **REQ-2**: Activating the header logs button must open the right-side panel in a logs view.
  - If the right-side panel is closed, it must open.
  - If another panel view is active, it must switch to logs.

- **REQ-3**: The right-side logs view must include entries from both Electron `main` and `renderer` processes.
  - Each entry must identify its origin process (`main` or `renderer`).
  - Existing log metadata (for example level/category/timestamp/message) must remain visible to users.

- **REQ-4**: The logs view must support ongoing diagnostics during app use.
  - New log entries emitted while the app is running must become visible in the logs view without requiring app restart.

- **REQ-5**: Existing left-sidebar world info refresh behavior must remain available.
  - Replacing the header refresh action must not remove or break world-info refresh from the left panel.

- **REQ-6**: Existing chat/session/world workflows must remain functionally unchanged except for the header action replacement.

## Non-Functional Requirements

- **NFR-1 (Usability)**: Logs view should make it easy to distinguish source process and severity at a glance.
- **NFR-2 (Reliability)**: Opening/using the logs panel must not destabilize chat streaming, session switching, or world operations.
- **NFR-3 (Performance)**: Logs rendering must avoid perceptible UI lag under normal development logging volume.

## Out of Scope

- Building external log shipping, storage backends, or analytics integrations.
- Redesigning broader right-panel layout outside what is needed to host logs.
- Changing existing logging configuration semantics beyond what is required to display logs.

## Acceptance Criteria

- [ ] Header refresh action is replaced by a logs action.
- [ ] Clicking the header logs action opens the right panel in logs mode.
- [ ] Logs panel shows both `main` and `renderer` log entries.
- [ ] Each log entry clearly shows source process and retains key metadata.
- [ ] New logs appear during runtime without restarting the app.
- [ ] Left-sidebar world info refresh still works.
- [ ] No regressions in core world/session/chat workflows attributable to this change.

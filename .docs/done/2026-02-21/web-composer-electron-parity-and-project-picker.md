# Done: Web Composer Electron Parity and Project Picker

**Date**: 2026-02-21  
**Context**: User-requested web chat composer alignment with Electron UI and behavior.

## Summary

Completed web composer parity updates and implemented Electron-style `Project` button behavior in web:
- composer visual alignment (toolbar layout, floating placement, centered width, white shell),
- interactive `Project` action,
- persisted world `working_directory` updates from selected project folder.

## Completed Scope

### Composer parity and layout updates
- Matched composer structure to Electron:
  - `+` action button,
  - `Project` button,
  - round send/stop action button.
- Updated composer styling:
  - white background shell,
  - centered constrained width on large screens,
  - floating overlay above message list so messages render under it.
- Removed borders on textarea/`+`/`Project` controls in doodle context.

### Web Project button function (Electron-style)
- Added web event `select-project-folder`.
- Wired `Project` button click to event dispatch.
- Implemented browser-side folder selection via Web File API:
  - `showDirectoryPicker` when available,
  - `input[type=file][webkitdirectory]` fallback.
- Implemented world variable persistence:
  - selected path upserts `working_directory` in world `variables`,
  - world is patched via existing world update API,
  - selected path is tracked in web state and reflected in button tooltip.

### Support modules and typing
- Added `web/src/domain/world-variables.ts` for env-text read/upsert helpers.
- Extended web state/props/events typing for selected project path and project-folder action.

## Key Files Updated

- `/Users/esun/Documents/Projects/agent-world/web/src/components/world-chat.tsx`
- `/Users/esun/Documents/Projects/agent-world/web/src/styles.css`
- `/Users/esun/Documents/Projects/agent-world/web/src/pages/World.tsx`
- `/Users/esun/Documents/Projects/agent-world/web/src/pages/World.update.ts`
- `/Users/esun/Documents/Projects/agent-world/web/src/types/index.ts`
- `/Users/esun/Documents/Projects/agent-world/web/src/types/events.ts`
- `/Users/esun/Documents/Projects/agent-world/web/src/api.ts`
- `/Users/esun/Documents/Projects/agent-world/web/src/domain/world-variables.ts`
- `/Users/esun/Documents/Projects/agent-world/web/src/domain/project-folder-picker.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/web-domain/world-variables-domain.test.ts`
- `/Users/esun/Documents/Projects/agent-world/tests/web-domain/world-update-project-folder.test.ts`

## Validation Performed

- `npx vitest run tests/web-domain/world-chat-composer-action.test.ts tests/web-domain/input-domain.test.ts`
- `npx vitest run tests/web-domain/world-variables-domain.test.ts tests/web-domain/world-update-project-folder.test.ts tests/web-domain/world-chat-composer-action.test.ts tests/web-domain/input-domain.test.ts`
- `npm run check --workspace=web`
- `npx tsc --noEmit --project tsconfig.build.json`

All commands above passed.

## CR Findings Logged (Not Yet Fixed)

- P1/P2 findings for server-side picker were addressed by removing server picker flow in favor of browser File API flow.
- P1 world-agent UI-field overwrite was addressed by merging updated world payload with existing UI-enriched agent sprite state.

# DD: Electron Message Links Open in External Browser

**Date:** 2026-03-18  
**Status:** Done  
**Type:** Bug Fix + CR + DD  
**Related REQ:** None  
**Related AP:** None

## Summary

Fixed Electron chat-message hyperlinks so clicking rendered markdown links opens them in the user's external browser or OS handler instead of doing nothing inside the desktop app.

The final fix covers the full path end to end:

- renderer click detection for markdown anchors, including text-node click targets
- typed preload bridge support for external-link open requests
- main-process validation and `shell.openExternal(...)` dispatch
- Electron window-level fallback handling for attempted in-app navigation
- sanitizer policy updates so valid absolute URLs are preserved instead of stripped
- protocol allowlist alignment across sanitize, renderer, and main-process layers

CR follow-up fixes were included before close-out:

- relative links are resolved using the browser's computed `anchor.href` value before validation
- protocol policy is now consistent across all layers for `http`, `https`, `mailto`, `tel`, `sms`, `xmpp`, and `callto`

## Root Cause

- The Electron renderer already displayed markdown links visually, but there was no complete renderer-to-main external-open flow for message clicks.
- Some click targets landed on text nodes inside anchors, so naïve event-target handling missed the link element.
- The markdown sanitizer regex incorrectly allowed only the protocol prefix for normal URLs, which caused absolute links such as YouTube URLs to lose their `href` in the live DOM.
- Protocol policy had drifted across layers: sanitizer rules, renderer click filtering, and main-process external-open validation were not fully aligned.
- Relative markdown links also needed to use the resolved DOM URL rather than the raw `href` attribute when opened externally.

## Implemented Changes

### Desktop IPC contract and preload bridge

- Added `DESKTOP_INVOKE_CHANNELS.LINK_OPEN_EXTERNAL = 'link:openExternal'`.
- Added `ExternalLinkPayload` and `DesktopApi.openExternalLink(url)` to the shared desktop API contract.
- Added preload payload normalization and bridge wiring so renderer code can request external link opens through the secure preload surface.

Updated files:

- `electron/shared/ipc-contracts.ts`
- `electron/preload/payloads.ts`
- `electron/preload/bridge.ts`

### Main-process external opening

- Added `openExternalLink(payload)` to main IPC handlers.
- Added strict URL normalization and absolute-URL validation.
- Restricted supported protocols to the approved external-open set.
- Routed valid requests to Electron `shell.openExternal(...)`.
- Registered the new IPC route and fixed the route registration object in `electron/main.ts` so TypeScript/build remained valid.

Updated files:

- `electron/main-process/ipc-handlers.ts`
- `electron/main-process/ipc-routes.ts`
- `electron/main.ts`

### Renderer link click handling

- Added link-click interception in `MessageContent` so clicks on rendered markdown anchors are opened externally instead of relying on in-app navigation.
- Added event-target normalization so text-node clicks inside anchors are resolved correctly.
- Switched link extraction to `closest('a')` and prefer `anchor.href` first, then raw `href`, then URL-like anchor text as a fallback.
- Added pointer cursor styling for message links.

Updated files:

- `electron/renderer/src/components/MessageContent.tsx`
- `electron/renderer/src/styles.css`

### Sanitizer and policy alignment

- Fixed the Electron markdown sanitizer so full absolute URLs survive sanitization.
- Mirrored the sanitizer fix in the web markdown utility to keep behavior consistent across clients.
- Removed unsupported `cid:` acceptance from the final allowlist so sanitize/open policies match.

Updated files:

- `electron/renderer/src/utils/markdown.ts`
- `web/src/utils/markdown.ts`

### Window-level fallback behavior

- Added `setWindowOpenHandler(...)` handling so attempted popup/new-window navigations are denied in-app and redirected to the external opener when appropriate.
- Added `will-navigate` interception so supported external URLs are prevented from replacing the Electron app window.

Updated file:

- `electron/main.ts`

## Debugging Notes

- Initial tests and type-checking passed after the IPC feature landed, but live Electron behavior still failed for some links.
- CDP inspection against the running Electron app showed that affected anchors had missing `href` values in the DOM, which isolated the real issue to sanitization rather than the bridge or main-process opener.
- Temporary diagnostic logging was added during investigation and removed before final close-out.
- Temporary local CDP helper scripts under `.tmp/` were also removed after verification.

## Regression Coverage

Added or updated tests for:

- preload bridge exposure and invoke payload for `openExternalLink`
- IPC route registration and payload handoff for `link:openExternal`
- main-process external-open validation and allowed-protocol behavior
- renderer extraction of links from anchors and text-node targets
- renderer click handling that calls the desktop bridge opener
- resolved relative-link handling via computed `anchor.href`
- sanitizer acceptance of valid `https` and `sms` links
- sanitizer rejection of `javascript:` and `cid:` targets

Updated tests:

- `tests/electron/preload/preload-bridge.test.ts`
- `tests/electron/main/main-ipc-routes.test.ts`
- `tests/electron/main/main-ipc-handlers.test.ts`
- `tests/electron/renderer/message-content-status-label.test.ts`
- `tests/electron/renderer/markdown-rendering.test.ts`

## Verification

Passed during this delivery:

- Focused Vitest regression run for renderer, preload, and main-process link-opening coverage
- `npm run check`
- `npm test`

Final broad validation state:

- `npm test` passed with 227 test files and 1800 tests
- `npm run check` passed across root, core, web, and Electron

## Result

- Clicking rendered markdown links in Electron messages now opens the URL externally.
- Valid absolute external links survive sanitization and remain clickable in the live DOM.
- Relative links resolve through the browser's computed anchor URL before external opening.
- The app no longer attempts to navigate the Electron window to supported external targets.
- Link-safety policy is aligned across the sanitizer, renderer click handler, and main-process external opener.
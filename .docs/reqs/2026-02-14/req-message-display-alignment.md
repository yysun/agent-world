# Requirement: Message Display Alignment — Favor Electron Simplicity

## Overview

The web app and electron app have diverged in their message stream display logic. The electron app has evolved a cleaner, simpler architecture with better separation of concerns. This requirement defines changes to align both apps — favoring the electron app's simplicity — while selectively back-porting a few high-value web features to electron.

## Background

A comparison of the two frontends revealed:

- **Web app** has accumulated complexity: 3-tier tool call reconstruction, inline rendering in a 1,100-line component, custom CSS classes, emoji icons, sprite-sheet avatars, and heavyweight domain logic for scroll/log state.
- **Electron app** uses a cleaner pattern: role-based `MessageContent` component (~120 lines), Tailwind utility classes, SVG icons, initials-based avatars, hover-revealed actions, dedicated `streaming-state.js`/`activity-state.js` modules, and an `AgentQueueDisplay` for multi-agent scenarios.

The electron app's approach is simpler, more maintainable, and more accessible. The web app should converge toward it.

## Goals

- Simplify the web app's message rendering to match the electron app's cleaner patterns
- Share the markdown utility to prevent drift
- Add missing features where one app has something valuable the other lacks
- Improve accessibility in both apps

## Functional Requirements

### FR-1: Simplify web message content rendering

Extract a standalone `MessageContent` function from the inline rendering in `world-chat.tsx`. It should follow the electron's pattern: three clean rendering paths (log → tool → regular content) with no inline IIFE.

### FR-2: Remove 3-tier tool call reconstruction from web app

The web app's `formatMessageText()` reconstructs tool call display text from raw data using a 3-tier fallback. The electron app simply renders `message.content` through markdown. Adopt the electron approach: rely on content as pre-formatted by the core, remove the 3-tier reconstruction logic.

### FR-3: Align the markdown utilities

Both apps have nearly identical `markdown.ts` files. Since `core/package.json` does not include `marked` or `dompurify`, and the electron renderer does not import from `core/`, moving to a shared module requires adding dependencies to core and configuring the electron vite bundler. Instead, keep each copy in its respective app but ensure they are identical: add the missing `hasMarkdown()` helper to the electron copy and keep both files in sync. A future consolidation can happen when the build tooling evolves.

### FR-4: Add truncation warning to electron tool output

The electron app truncates tool output at 50K chars in `streaming-state.js` but shows no UI warning. Add the same `⚠️ Output truncated` notice that the web app displays.

### FR-5: Add AgentQueueDisplay to web app

The electron app has an `AgentQueueDisplay` component showing the active agent (green dot) and queued agents (avatar stack). Port this to the web app for multi-agent visibility.

### FR-6: Add accessibility attributes to web activity indicators

The electron's `ThinkingIndicator` uses `aria-live="polite"` and `role="status"`. The electron's `ToolExecutionStatus` uses `role="status"`. Apply the same ARIA attributes to the web app equivalents.

### FR-7: Add cross-agent message styling to electron

The web app detects cross-agent messages and shows purple borders + directional labels (`Agent: X → Y`). Add equivalent styling to the electron app's `getMessageCardClassName` and message header rendering.

### ~~FR-8: Hover-reveal message actions in web app~~ (Already implemented)

The web app already has hover-reveal via CSS (`.message:hover .message-actions { opacity: 1 }`). No changes needed.

## Non-Functional Requirements

- No behavioral regressions — all existing tests must pass
- Both apps must render identically formatted tool output for the same message
- Shared markdown module must work in both browser and Node.js contexts

## Constraints

- The web app uses AppRun (not React) — component extraction must use AppRun patterns
- The shared markdown utility cannot import framework-specific code
- Changes should be incremental and independently testable

## Acceptance Criteria

- [ ] Web `world-chat.tsx` message rendering is extracted into a clean `MessageContent`-style function with three rendering paths
- [ ] 3-tier `formatMessageText()` is removed from web; tool calls render from content
- [ ] Electron `markdown.ts` includes `hasMarkdown()` and matches web copy
- [ ] Electron tool output shows truncation warning when content exceeds 50K chars
- [ ] Web app displays agent queue indicator for multi-agent worlds
- [ ] Web activity indicators have `role="status"` and `aria-live` attributes
- [ ] Electron shows cross-agent message styling (distinct border + directional label)
- [x] Web message edit/delete buttons appear on hover only (already implemented)
- [ ] All existing tests pass

# Requirement: Electron App Markdown Rendering

**Date**: 2026-02-10  
**Type**: Feature Enhancement

## Overview

Add markdown rendering capability to the Electron app to match the web app's behavior during streaming and for final messages. Currently, the Electron app displays markdown syntax literally as plain text, while the web app renders it as formatted HTML.

## Goals

- Achieve feature parity between Electron and web apps for markdown rendering
- Provide consistent user experience across both platforms
- Maintain security through HTML sanitization
- Support real-time markdown rendering during streaming

## Functional Requirements

### REQ-1: Markdown Rendering Utility
Create a markdown rendering utility module for the Electron renderer that:
- Converts markdown to HTML using the `marked` library
- Sanitizes HTML output using `DOMPurify` to prevent XSS attacks
- Supports GitHub Flavored Markdown (tables, code blocks, links, etc.)
- Provides the same configuration as the web app

### REQ-2: Streaming Message Rendering
Update message display to render markdown in real-time:
- Render markdown for streaming messages (as content arrives)
- Maintain streaming indicators (thinking animation)
- Ensure proper DOM updates without performance issues

### REQ-3: Final Message Rendering
Update message display to render markdown for completed messages:
- Render all message types (user, assistant, tool, log)
- Preserve special formatting for tool output (stdout/stderr)
- Maintain existing message styles and layouts

### REQ-4: Dependency Management
Add required npm packages to the Electron renderer:
- `marked` - Markdown parser
- `dompurify` - HTML sanitizer
- `@types/dompurify` (dev dependency) - TypeScript types

## Non-Functional Requirements

### Performance
- Markdown rendering should not introduce noticeable lag during streaming
- Large messages should render efficiently

### Security
- All HTML output must be sanitized to prevent XSS attacks
- Only safe HTML tags and attributes should be allowed
- Script tags and inline event handlers must be blocked

### Maintainability
- Code should follow existing project conventions (function-based, file headers)
- Reuse patterns from the web app's markdown utility where applicable
- Keep the implementation simple and testable

## Constraints

- Must maintain existing message display features (timestamps, sender labels, tool output)
- Cannot break current message streaming functionality
- Must work within React/JSX renderer environment
- Should not require changes to backend or core modules

## Acceptance Criteria

- [ ] Markdown utility module created with `marked` and `DOMPurify` integration
- [ ] Dependencies installed in electron/package.json
- [ ] Messages render markdown for bold, italic, links, code blocks, and tables
- [ ] Streaming messages render markdown in real-time
- [ ] Final messages render markdown correctly
- [ ] HTML is properly sanitized (no XSS vulnerabilities)
- [ ] Tool output (stdout/stderr) maintains existing colored terminal display
- [ ] Log messages maintain existing colored dot indicators
- [ ] No visual regressions in message layout or styling
- [ ] Manual testing confirms parity with web app markdown rendering

## Out of Scope

- Adding new markdown features beyond what the web app supports
- Changing markdown styling or CSS
- Adding markdown editor features (preview, syntax highlighting in composer)
- Modifying backend message format or storage

## References

- Web app markdown utility: `/web/src/utils/markdown.ts`
- Web app message display: `/web/src/domain/message-display.ts`
- Electron app component: `/electron/renderer/src/App.jsx`

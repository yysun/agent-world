# Frontend Tool Envelope Preview Display Test Scenarios

## Purpose

Capture the transcript-surface behaviors required for tool-execution-envelope preview display across Electron and web, including the follow-up clarification that Electron previewable artifact interaction must remain inside the frontend surface.

## Scope

1. Standalone tool-result rows.
2. Assistant-linked combined request/result views.
3. Live tool preview payloads and restored persisted envelopes.
4. Electron frontend-surface artifact interaction for previewable artifacts.
5. Fallback handling for non-previewable artifact outputs.

## Electron Scenarios

1. Standalone tool row with a persisted envelope markdown preview renders markdown from `preview`, not raw envelope JSON.
2. Standalone tool row with an image, SVG, audio, or video preview renders the correct preview class from envelope metadata.
3. Standalone tool row with a previewable artifact such as HTML or PDF allows the user to open or focus an in-app viewer surface without leaving the Electron frontend.
4. Assistant-linked combined request/result view with a previewable artifact uses the same in-app viewer interaction model as the standalone tool row.
5. Reloaded persisted envelope content restores the same preview ordering and the same viewer/fallback affordance as the live tool result.
6. Non-previewable artifact outputs such as PPTX remain visible as stable file-style fallback metadata without exposing raw envelope JSON.
7. Tool identity and terminal status remain associated with the rendered preview after restore.

## Web Scenarios

1. Standalone tool row with a persisted envelope preview renders from `preview` rather than `result`.
2. Assistant-linked combined request/result view preserves the same preview meaning and tool identity as the standalone result.
3. Reloaded persisted envelope content preserves preview item order.
4. Unsupported inline preview cases degrade to stable text or file-style fallback derived from envelope metadata.
5. Non-enveloped historical tool results still render in fallback form.

## Edge Cases

1. Multi-item preview arrays preserve order across live and restored states.
2. Missing preview metadata falls back to stable text instead of dropping the tool result.
3. A persisted envelope that only carries tool identity in `envelope.tool` still renders the correct tool label in both Electron and web.
4. Preview activation for Electron previewable artifacts does not depend on a dedicated local-path opener bridge.

## Validation Notes

1. Prefer targeted unit tests at the Electron renderer and web domain boundaries.
2. Add browser/Electron E2E coverage only if the in-app viewer interaction becomes stateful enough that domain tests cannot prove the behavior.
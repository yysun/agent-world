# Requirement: Chat Title Quality and Provenance Hardening

**Date**: 2026-03-11  
**Type**: Reliability and Quality Enhancement  
**Status**: ✅ Implemented — 2026-03-13

## Overview

Improve automatic chat title generation so weak fallback titles do not become permanent, title generation uses enough recent conversation context to capture topic accurately, and edit/reset behavior can distinguish auto-generated titles from user-authored titles using explicit provenance instead of string inference.

## Goals

- Prevent low-signal fallback titles from permanently replacing `New Chat`.
- Improve title quality for short follow-up turns that depend on nearby context.
- Preserve user intent by tracking whether a title is default, auto-generated, or manually assigned.
- Keep existing chat-scoped correctness, event isolation, and commit-time safety guarantees intact.

## Functional Requirements

- **REQ-1 (Weak Fallback No-Commit)**: Automatic title generation must not commit a generic or low-signal fallback title that does not meaningfully identify the chat topic.
- **REQ-2 (Retryable Untitled State)**: When automatic title generation yields only a weak/generic fallback result, the chat must remain in the default-title state so a future eligible generation attempt may still produce a better title.
- **REQ-3 (Bounded Context Window)**: The title generator must derive its prompt input from a bounded, chat-scoped recent transcript window rather than a single isolated latest user message.
- **REQ-4 (Relevant Context Only)**: The prompt input for title generation must continue excluding irrelevant transcript content such as tool output, system events, and unrelated chat/session data.
- **REQ-5 (Compact Prompt Shaping)**: The recent transcript window used for title generation must remain small and deterministic so title generation stays efficient and stable across repeated runs.
- **REQ-6 (Explicit Title Provenance)**: Each chat must track title provenance explicitly with enough information to distinguish at least default, auto-generated, and manual title states.
- **REQ-7 (Manual Title Protection)**: A title that is manually assigned by the user must not later be treated as auto-generated solely because its text matches a previously generated title.
- **REQ-8 (Edit Reset by Provenance)**: Edit/resubmission flows may reset a chat title back to the default-title state only when the current title provenance indicates the title was auto-generated.
- **REQ-9 (Auto-Title Provenance Transition)**: A successful automatic title update must mark the affected chat as auto-titled in the same logical state transition as the title update.
- **REQ-10 (Manual Provenance Transition)**: A user-driven title rename must mark the affected chat as manually titled in the same logical state transition as the rename.
- **REQ-11 (Safe Legacy Behavior)**: Chats created before explicit provenance exists must default to behavior that favors preserving existing user-visible titles over destructive resets.
- **REQ-12 (Event Consistency)**: Successful automatic title updates must continue publishing a correctly scoped `chat-title-updated` event for the affected chat.

## Non-Functional Requirements

- **NFR-1 (User Intent Safety)**: Automatic title logic must not override or silently reinterpret manual naming decisions.
- **NFR-2 (Determinism)**: Title generation input selection must be deterministic for the same persisted chat transcript state.
- **NFR-3 (Backward Compatibility)**: Existing chats and storage backends must remain readable and operational during and after provenance introduction.
- **NFR-4 (Maintainability)**: Title provenance and low-quality-title policy must be centralized so edit, rename, and auto-title flows do not infer behavior from scattered heuristics.

## Constraints

- Must preserve existing chat-scoped generation, compare-and-set commit safety, and `chat-title-updated` event scoping.
- Must remain compatible with the current world/chat lifecycle and edit-resubmission flow.
- Must not reintroduce cross-chat title leakage or current-chat implicit routing.
- Must keep title generation prompt input bounded; the change must not expand to full-history summarization.

## Out of Scope

- Manual title editing UX changes.
- New user-facing controls for forcing title regeneration.
- Large prompt-engineering experiments beyond bounded context shaping.
- Re-titling chats that already have a protected manual title without explicit user action.

## Acceptance Criteria

- [x] If automatic generation produces only a generic fallback result, the chat remains titled `New Chat`.
- [x] A later eligible idle event can still auto-title that same chat after a prior weak fallback no-op.
- [x] Title generation uses a bounded recent transcript window and produces topic-aware titles for follow-up turns that would be ambiguous in isolation.
- [x] Tool/system transcript content is excluded from title prompt input.
- [x] A manual rename to text equal to a previously generated title is still treated as manual and is not reset during edit resubmission.
- [x] Edit/resubmission resets only auto-generated titles and leaves manual titles unchanged.
- [x] Successful auto-title writes preserve existing chat/event scoping guarantees and still emit `chat-title-updated` for the correct chat.
- [x] Automated tests cover weak-fallback no-commit behavior, bounded-context prompt shaping, and provenance-based edit reset protection.

## Architecture Review Updates (AR)

### Validated Assumptions

- Existing idle-only trigger and compare-and-set commit semantics are the right foundation and should remain unchanged.
- Title quality problems now come mainly from insufficient prompt context and lack of explicit provenance, not from the event trigger itself.

### Challenged Assumptions

- A non-empty fallback title is not necessarily better than leaving the chat untitled.
- String equality with the latest `chat-title-updated` event is not a reliable way to infer authorship of the current title.
- The latest user message alone is not enough context for many real chat flows.

### Options Considered

1. **Option A: Fallback Policy Only**
   - Prevent weak fallback commits but keep the current single-message prompt and inferred provenance rules.
   - Pros: smallest change.
   - Cons: title quality and manual-title safety issues remain.
2. **Option B: Fallback Policy + Prompt Context**
   - Improve retry behavior and bounded-context prompt shaping, but keep inferred provenance.
   - Pros: better title quality with moderate scope.
   - Cons: edit/reset can still misclassify manual titles.
3. **Option C: All Three Changes (Recommended)**
   - Add weak-fallback no-commit behavior, bounded-context prompt shaping, and explicit title provenance.
   - Pros: addresses the main quality and user-intent failure modes together.
   - Cons: broader state-model change than prompt-only fixes.

### AR Outcome

- Proceed with **Option C**.
- Preserve the existing idle-only trigger and chat-scoped commit guard.
- Treat “no meaningful title yet” as a safer outcome than committing a generic placeholder.
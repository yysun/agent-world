# Requirement: Chat Session Title Generation Reliability and Quality

**Date**: 2026-02-13  
**Type**: Feature Enhancement  
**Status**: ✅ Implemented

## Overview

Improve chat session title generation so titles are consistently assigned to the correct session, remain readable and topic-focused, and behave predictably under concurrent session activity and cancellation scenarios.

## Goals

- Ensure a generated title is always applied to the intended chat session.
- Improve title quality and consistency across different conversation shapes.
- Keep behavior safe and deterministic when users switch sessions during active processing.
- Preserve existing user-visible behavior for sessions that already have non-default titles.

## Functional Requirements

- **REQ-1 (Session Correctness)**: Title generation and title updates must be explicitly scoped to a single target `chatId`.
- **REQ-2 (Race Safety)**: If session context changes while title generation is in progress, the system must not rename a different chat than the one originally targeted.
- **REQ-3 (Default-Title Guard)**: Automatic title replacement must only occur for chats still in default-title state at update time.
- **REQ-4 (Deterministic Triggering)**: Automatic title generation must run only after session activity reaches idle state for the target chat context.
- **REQ-5 (Cancellation Scope)**: Title generation work must respect existing chat-scoped cancellation behavior.
- **REQ-6 (Prompt Input Quality)**: The title generator must use a stable, chat-scoped conversation view that avoids duplicated or irrelevant turns.
- **REQ-7 (Output Quality Rules)**: Generated titles must be concise, plain-text, and sanitized for UI display.
- **REQ-8 (Fallback Quality)**: When LLM title generation fails or returns low-quality output, the fallback title must still be meaningful and non-empty.
- **REQ-9 (Event Consistency)**: Title-updated notifications must carry the correct chat context so clients refresh only the affected session state.
- **REQ-10 (Idempotency)**: Repeated idle events for the same untitled chat must not produce conflicting or unstable final names.

## Non-Functional Requirements

- **NFR-1 (Reliability)**: Title generation must not introduce cross-session data corruption or accidental renames.
- **NFR-2 (Responsiveness)**: Title update propagation should remain near real-time after idle transition.
- **NFR-3 (Maintainability)**: Default-title semantics should be centralized to avoid string drift.
- **NFR-4 (Observability)**: Logs must provide enough context to diagnose title-generation success/failure and race conditions.

## Constraints

- Must remain compatible with current world/chat event model and storage backends.
- Must remain additive to existing chat lifecycle behavior.
- Must avoid introducing global locks that block unrelated chat sessions.

## Out of Scope

- Manual user-driven title editing UX changes.
- Retitling already user-named chats.
- Multilingual style tuning beyond current model/provider behavior.

## Acceptance Criteria

- [x] When chat A becomes idle, only chat A can be auto-renamed by that generation cycle.
- [x] Switching to chat B during chat A title generation does not rename chat B.
- [x] If a chat is no longer in default-title state at commit time, automatic rename is skipped safely.
- [x] Stop/cancel for a chat also cancels or safely no-ops title-generation work for that same chat.
- [x] Generated titles are plain text, concise, and free of formatting artifacts.
- [x] Fallback title is meaningful when LLM output is unavailable/invalid.
- [x] Title-updated event payload identifies the correct chat so client refresh targets the right session.
- [x] Automated tests cover success path, fallback path, and chat-switch race behavior.

## Architecture Review Updates (AR)

### Validated Assumptions

- The current activity idle signal is an appropriate trigger boundary for title generation.
- Auto-title should remain limited to default-title chats to avoid overriding user intent.

### Challenged Assumptions

- Reading mutable global session context (`currentChatId`) across async title generation is not safe under concurrent session switching.
- Aggregated memory without de-duplication can reduce title quality for multi-agent chats.

### Options Considered

1. **Option A: Minimal Context Fix**
   - Scope all title operations with captured `chatId` and enforce commit-time default-title guard.
   - Pros: low-risk, small change surface.
   - Cons: title quality improvements are limited.
2. **Option B: Context Fix + Input Quality Upgrade (Recommended)**
   - Option A plus deterministic chat transcript shaping (de-dup/filter) for title prompts.
   - Pros: improves correctness and quality together.
   - Cons: moderate implementation effort.
3. **Option C: Event-Sourced Title Pipeline**
   - Move title generation to a dedicated event-driven worker path.
   - Pros: strongest separation and future scalability.
   - Cons: highest complexity and rollout risk.

### AR Outcome

- Proceed with **Option B**.
- Prioritize session-scoped correctness first, then quality improvements within the same feature track.

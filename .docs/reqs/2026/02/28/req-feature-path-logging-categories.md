# Requirement: Feature-Path Logging Categories for LLM and Tool Diagnostics

**Date**: 2026-02-28
**Type**: Feature
**Status**: ✅ Requirements Reviewed (AR Completed)

## Architecture Review (AR)

### Review Summary

The current logging taxonomy does not provide a single, end-to-end feature-path view for one user turn. Existing categories make it hard to answer:
- what exact messages were sent to and received from the LLM,
- how input messages were prepared,
- which tool calls were executed and how continuation proceeded.

### Validated Findings (AR)

- Documented categories and emitted categories are partially inconsistent, creating blind spots during debugging.
- Current LLM/tool bridge logs are useful but intentionally truncated, so deep payload diagnosis is incomplete.
- Message-preparation visibility exists but is not represented as a first-class troubleshooting path in the logging guide.
- Tool lifecycle diagnosis is fragmented across multiple categories without a single per-turn correlation surface.

### AR Decision

Proceed with a path-oriented logging requirements update focused on diagnosability, consistency, and safe raw-payload visibility.

## Overview

Define a feature-path logging model that lets developers trace one user request from message intake through message preparation, LLM request/response, tool execution, continuation, and final publish/persistence outcomes.

## Goals

- Make single-turn debugging deterministic and fast.
- Expose raw LLM and tool payloads when explicitly enabled.
- Keep sensitive data handling explicit and enforceable.
- Align documentation with actual runtime category behavior.

## Functional Requirements

- **REQ-1: Path-Oriented Category Coverage**
  - Logging must support explicit stages of the response path: input/selection, message preparation, LLM request, LLM response, tool request, tool result/error, continuation, and final publish/persistence.
  - Each stage must be represented by dedicated categories and documented with purpose and usage.

- **REQ-2: Per-Turn Correlation**
  - Logs for a single response path must be correlatable using stable identifiers (for example: world, chat, agent, message, and turn/run identifiers).
  - Correlation fields must be consistently present across all path-stage categories.

- **REQ-3: Raw LLM Payload Visibility**
  - The system must provide opt-in logging categories for raw outbound LLM request payloads and raw inbound LLM responses.
  - Raw logging must be disabled by default.

- **REQ-4: Message Preparation Visibility**
  - Logging must expose what user/history/system messages are included, excluded, or transformed before LLM invocation.
  - Logs must surface rationale-oriented metadata (for example: filtered counts, dropped message reasons, tool-call pruning reasons).

- **REQ-5: Tool Lifecycle Visibility**
  - Logging must expose full tool lifecycle events: request handoff, execution start, result/error, and continuation trigger.
  - The lifecycle must include tool identity and tool-call identity for deterministic replay analysis.

- **REQ-6: Continuation Flow Visibility**
  - Continuation after tool execution must be observable with dedicated logs for retries, fallback paths, and stop/cancel outcomes.
  - Continuation logs must be linked to the originating tool call and turn correlation identifiers.

- **REQ-7: Category Consistency and Backward Compatibility**
  - Logging category names documented for operators must match emitted category names.
  - If category renames are introduced, compatibility behavior and migration guidance must be defined.

- **REQ-8: Troubleshooting Profiles**
  - The logging guide must define practical profile presets for common debugging goals, including:
    - raw LLM exchange diagnosis,
    - message-prep diagnosis,
    - tool-execution/continuation diagnosis,
    - full feature-path trace for one turn.

- **REQ-9: Log Safety Controls**
  - Sensitive fields in raw and structured logs must follow explicit redaction rules.
  - The system must provide clear operator guidance on safe development vs production logging modes.

- **REQ-10: Structured Event Contract**
  - Logs emitted for path diagnosis must use a stable structured shape suitable for filtering and machine parsing.
  - Required fields for each path-stage category must be documented.

## Non-Functional Requirements

- **NFR-1 (Diagnosability)**: Engineers should be able to localize a path failure (prep, provider, tool, continuation, publish) from logs alone.
- **NFR-2 (Performance)**: Disabled diagnostic categories should impose minimal runtime overhead.
- **NFR-3 (Usability)**: Category naming should be intuitive for feature-path debugging and reduce cross-category guesswork.
- **NFR-4 (Security)**: Raw payload visibility must remain opt-in with clear safeguards.

## Scope

### In Scope

- Logging category model and naming for end-to-end response-path diagnostics.
- Logging guide updates for category definitions and troubleshooting presets.
- Correlation and structured-field requirements for path diagnostics.

### Out of Scope

- External log shipping or observability platform integration.
- Changes to business logic unrelated to logging diagnostics.
- UI redesign of log viewers beyond what is required to surface added categories/fields.

## Acceptance Criteria

- [ ] A documented category model exists that maps directly to the response feature path stages.
- [ ] Operators can enable raw LLM request/response categories independently from other logs.
- [ ] Operators can diagnose message-preparation decisions through dedicated logs.
- [ ] Operators can trace tool request/result/error and continuation events with stable correlation IDs.
- [ ] Documentation and runtime-emitted category names are aligned or have explicit migration guidance.
- [ ] Troubleshooting presets are documented for raw LLM, message prep, tool lifecycle, and full-turn trace workflows.
- [ ] Redaction/safety rules for raw payload logs are documented and enforced by default behavior.

## Notes

This requirement defines **what** diagnostic visibility must be available. Category names and implementation sequencing are intentionally deferred to the architecture/implementation planning stage.

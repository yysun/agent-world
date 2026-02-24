# Architecture Plan: Progressive Skill Loading in Prompt + Tooling

**Date:** 2026-02-14  
**Related Requirement:** [req-skill-progressive-loading.md](../../reqs/2026-02-14/req-skill-progressive-loading.md)  
**Status:** ✅ Reviewed (AR Completed)

## Overview

Implement progressive skill loading by injecting lightweight skill summaries into the system prompt and adding a `load_skill` tool that fetches full `SKILL.md` content on demand by `skill_id`.

## Architecture Decisions

### AD-1: Prompt Stays Lightweight
- Inject only `id` and `description` into system prompt.
- Do not inline full skill markdown during prompt build.

### AD-2: Registry Is Source of Truth
- Resolve available skills and ID lookups from `core/skill-registry.ts`.
- Avoid duplicate filesystem scanning in prompt builder or tool implementation.

### AD-3: On-Demand Full Context
- `load_skill` fetches full markdown only when agent explicitly invokes the tool.
- Tool returns a structured `<skill_context>` envelope including execution directive.

### AD-4: Deterministic and Safe Failure
- Unknown `skill_id` returns a structured not-found payload.
- Missing/unreadable skill file returns structured error payload without crashing orchestration.

### AD-5: Source Path Resolution
- `load_skill` requires deterministic mapping from `skill_id` to `SKILL.md` file path.
- Prefer extending registry APIs to expose this mapping instead of rescanning filesystem in tool handler.

## End-to-End Flow

```mermaid
flowchart TD
  A["Build system prompt"] --> B["Read skills from registry"]
  B --> C["Inject <available_skills> (id + description)"]
  C --> D["Model chooses tool or normal response"]
  D -->|load_skill(skill_id)| E["Tool resolves skill in registry"]
  E --> F{"Skill found?"}
  F -->|yes| G["Read full SKILL.md content"]
  G --> H["Return <skill_context> envelope"]
  F -->|no| I["Return structured not-found result"]
```

## Phased Implementation

### Phase 1: Prompt Injection Contract
- [x] Locate system prompt construction path used by runtime orchestration.
- [x] Add `Agent Skills` section with the exact required structure.
- [x] Populate `<available_skills>` entries from registry (`id`, `description`).
- [x] Ensure output is stable (sorted IDs) for deterministic prompt text.

### Phase 2: `load_skill` Tool Definition
- [x] Add tool schema for `load_skill` with required `skill_id` input.
- [x] Register `load_skill` in tool catalog where model-visible tools are assembled.
- [x] Ensure tool appears in both direct and queued execution paths (if both exist).

### Phase 3: `load_skill` Runtime Handler
- [x] Implement lookup by `skill_id` using registry APIs.
- [x] Extend registry entry/lookup as needed to resolve source `SKILL.md` path for file reads.
- [x] Read full `SKILL.md` content and return required `<skill_context>` payload.
- [x] Add structured not-found and read-error payloads.

### Phase 4: Orchestration Integration
- [x] Ensure tool result is forwarded intact to model as tool result content.
- [x] Confirm execution-directive block is preserved (no sanitizer truncation).
- [x] Verify behavior with concurrent chats/sessions.

### Phase 5: Tests
- [x] Add unit tests for prompt section injection with mocked registry skills.
- [x] Add unit tests for `load_skill` success path (full markdown wrapped correctly).
- [x] Add unit tests for `load_skill` not-found path.
- [x] Add unit tests for file-read failure path.
- [x] Add integration-level test for model tool invocation flow using mocked tool calls.

### Phase 6: Validation and Documentation
- [x] Run targeted tests for core prompt/tool/orchestrator modules.
- [x] Run project check/build commands for impacted packages.
- [x] Update done doc under `.docs/done/2026-02-14/` after implementation completes.

## Risks and Mitigations

- Risk: Registry does not expose enough data to read `SKILL.md` by ID.  
Mitigation: Extend registry entry model to include canonical source path (internal field or dedicated lookup API).

- Risk: Prompt bloat from long descriptions.  
Mitigation: keep only concise descriptions from front matter and cap output size if needed.

- Risk: Tool payload escaping issues with markdown/XML-like wrappers.  
Mitigation: add serialization tests covering special characters and multiline content.

## Exit Criteria

- [x] Prompt contains required `Agent Skills` section with registry-backed entries.
- [x] `load_skill` is model-visible and executable by `skill_id`.
- [x] Success returns full markdown in required `<skill_context>` envelope.
- [x] Not-found/errors return structured outputs without runtime failure.
- [x] Tests pass for prompt injection and tool execution paths.

## Architecture Review (AR)

**Review Date:** 2026-02-14  
**Reviewer:** AI Assistant  
**Status:** ✅ Approved for SS

### AR Notes
- Plan sequence is sound: prompt contract first, tool registration second, handler third.
- Main risk is path resolution for full `SKILL.md`; AD-5 addresses this explicitly.
- Recommended implementation guardrails:
  - keep prompt output deterministic (sorted by `skill_id`);
  - avoid embedding full markdown in prompt phase;
  - preserve tool result envelope exactly as required by REQ.

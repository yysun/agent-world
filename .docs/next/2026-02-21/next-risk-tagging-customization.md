# Next: Risk Tagging, Comet Visibility, and UI Real-Time Alerts

**Date**: 2026-02-21
**Scope**: Consolidated future work (out of current req/plan scope)

Related current artifacts:
- Done: `.docs/done/2026-02-21/done-infinite-etude-rendering-registry-and-streaming-stabilization.md`
- Scenario validation: `tests/opik/scenarios/infinite-etude-traffic.ts`
- Runtime risk classification: `core/events/orchestrator.ts`
- Opik trace tagging: `packages/opik/src/tracer.ts`

## Purpose

Capture follow-up work required to make risk classification configurable, predictable, and easy to filter in Comet/Opik dashboards.

## Future Items

1. Configurable risk policy map
- Replace hard-coded tool-name risk logic with a centralized policy table.
- Support explicit mapping for level and tags (for example by tool name and pattern family).
- Keep backward-compatible defaults so current scenarios continue to pass.

2. Argument-aware risk elevation
- Extend risk classification with optional argument inspection for high-impact patterns.
- Allow elevation based on command/payload indicators (for example destructive filesystem or network execution patterns).
- Emit deterministic tags for each elevation reason to improve trace filtering.

3. Stable trace tag schema
- Standardize risk tag prefixes and naming conventions across tool spans.
- Keep `risk_level:<level>` plus additive labels for tool and reason dimensions.
- Document required tags for dashboard saved-filters and scenario assertions.

4. Runtime configurability source
- Add a policy loading path from world variables or environment to tune risk behavior without code edits.
- Define precedence and validation behavior for malformed policy input.
- Preserve safe fallback to default policy when external config is unavailable.

5. Validation and observability checks
- Add targeted scenario coverage for low/medium/high tool events with expected tags.
- Ensure risky-tool scenario verifies both high level and reason tags.
- Add a short operator checklist for Comet filtering (`risk_level:high`, `tool:risky`, reason tags).

6. UI risk alert event contract
- Define UI-facing event contract for risk alerts (severity, source, timestamp, tags, message/tool context).
- Reuse existing risk metadata fields (`riskLevel`, `riskTags`) to avoid schema drift.
- Define unified mapping for guardrail events and risky-tool events into alert payloads.

7. Real-time propagation to frontend
- Ensure risk signals are emitted on live channels consumed by the web UI.
- Add reliable routing for tool-start risk metadata and guardrail-trigger events.
- Define ordering and dedup behavior for repeated alerts in a single response lifecycle.

8. UI display behavior and severity policy
- Add a minimal real-time risk alert surface in chat/runtime UI.
- Show severity and concise reason/tags with source context (agent/tool).
- Define persistence behavior (ephemeral toast, stream marker, or sticky warning list).
- Define severity-to-UI treatment for `low`/`medium`/`high`, with strong visibility for high severity.

9. Validation for real-time UI alerts
- Add scenario evidence confirming real-time alerts for risky-tool and guardrail paths.
- Add operator checklist for expected UI alert behavior and filtering.
- Ensure no regressions to existing scenario runner and trace checks.

## Linkages and Prerequisites

These future items depend on current implementation outputs:

1. Current tool metadata schema
- `core/types.ts` already includes `riskLevel` and `riskTags` on tool metadata.

2. Current orchestration event emission
- `core/events/orchestrator.ts` is the source of truth for tool-start risk metadata.

3. Current Opik tracer bridge
- `packages/opik/src/tracer.ts` applies risk metadata to tool span tags in Comet.

4. Current scenario evidence flow
- `tests/opik/scenarios/infinite-etude-traffic.ts` already checks high-risk tool evidence and can be expanded.

5. Current frontend event/render paths
- `web/src/domain/**` is the baseline integration area for risk alert rendering.

## Promotion Rule

When this work is selected for execution:
- Create a dedicated requirement file under `.docs/reqs/<date>/`.
- Create a dedicated plan file under `.docs/plans/<date>/`.
- Keep this file as backlog/index and link promoted artifacts.

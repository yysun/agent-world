# Next: Separate Git Repository for User Agent Worlds

**Date**: 2026-02-21
**Scope**: Consolidated future work (out of current req/plan scope)

Related context:
- Current worlds and content location: `data/`
- Primary candidate scope for extraction: `data/worlds/`
- Current app repository: `agent-world.latest`

## Purpose

Propose splitting user agent worlds content into a separate Git repository so worlds can be versioned, reviewed, shared, and released independently from core runtime code.

## Future Items

1. Define extraction scope
- Confirm which content moves to the new repository (minimum: `data/worlds/`).
- Decide whether any `data/datasets/` artifacts are included or remain in the app repo.
- Document ownership boundaries between runtime code and content repository.

2. Repository model and structure
- Create a dedicated repository for user worlds content with stable folder conventions.
- Define world package layout, metadata expectations, and validation requirements.
- Include clear contributor guidelines for adding/updating worlds.

3. Runtime integration contract
- Define how runtime loads worlds from the separate repository in local and deployed environments.
- Support pinned version/tag loading to ensure deterministic behavior.
- Define fallback behavior when remote content is unavailable.

4. Versioning and release workflow
- Establish semantic versioning or release-tag policy for worlds content.
- Define compatibility expectations between runtime versions and worlds content versions.
- Add change log expectations for prompt/agent/content updates.

5. Security and trust boundaries
- Define trust model for pulled worlds content (signed tags, allowlisted sources, or equivalent).
- Validate content before activation (schema checks and safe defaults).
- Preserve existing runtime guardrails independent of content source.

6. Migration and operator experience
- Provide migration path from current `data/` layout to external worlds repo source.
- Document developer workflows (clone/sync/update/test).
- Add troubleshooting notes for version mismatch and missing-content scenarios.

## Linkages and Prerequisites

These future items depend on current implementation outputs:

1. Existing world loading behavior
- Current loader behavior in the main repo is the baseline for compatibility.

2. Existing docs and world conventions
- Current world prompt/agent structure becomes the initial schema contract.

3. Existing observability and validation paths
- Runtime telemetry and scenario checks should continue to work with externalized content.

## Promotion Rule

When this work is selected for execution:
- Create a dedicated requirement file under `.docs/reqs/<date>/`.
- Create a dedicated plan file under `.docs/plans/<date>/`.
- Keep this file as backlog/index and link promoted artifacts.

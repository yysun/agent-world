# Requirement: Awesome Agent World Marketplace

**Date**: 2026-03-14  
**Type**: Feature Enhancement  
**Component**: Catalog discovery and import flows for worlds, agents, and skills  
**Related**: `req-import-world-from-github.md`, existing world import/export behavior, existing skill registry behavior

## Overview

Add an in-app marketplace experience backed by the `yysun/awesome-agent-world` repository so users can discover and import shareable artifacts without manually copying paths or cloning repositories.

The marketplace must support three artifact types:

- worlds
- agents
- skills

The marketplace is a catalog-and-import experience, not a publishing platform.

## Goals

- Let users browse available worlds, agents, and skills from `awesome-agent-world` inside Agent World.
- Reduce import friction by replacing manual source entry with searchable catalog discovery.
- Keep import behavior consistent with existing validation, conflict handling, and trust boundaries.
- Support source traceability so imported artifacts can be tied back to repository origin.
- Allow the catalog to remain useful even when one or more artifact categories are temporarily empty.

## Functional Requirements

### REQ-1: Marketplace Catalog Discovery

- Agent World **MUST** present a marketplace catalog sourced from the approved repository mapping for `awesome-agent-world`.
- The catalog **MUST** expose separate browseable categories for:
  - worlds
  - agents
  - skills
- Each category **MUST** support an explicit empty state when no importable entries are available.
- The catalog **MUST** load without requiring the user to clone or locally download the repository.
- The catalog **SHOULD** support search by name and description.
- The catalog **SHOULD** support filtering or grouping by tags when tag metadata is available.

### REQ-2: Marketplace Entry Metadata

Each marketplace entry **MUST** display enough metadata for a user to decide whether to import it.

Required displayed metadata:

- artifact type
- name
- description
- source path or source URL

When available, the marketplace **SHOULD** also display:

- tags
- author or repository owner
- last updated timestamp
- version or commit reference

If optional metadata is missing for an otherwise valid entry, the marketplace **MUST NOT** fail the entire catalog load.

### REQ-3: Approved Source and Catalog Parsing

- The marketplace **MUST** treat `yysun/awesome-agent-world` as the approved source of truth for this catalog experience.
- The marketplace **MUST** resolve the catalog from remote repository content and metadata without requiring local git tooling.
- The marketplace **MUST** tolerate partially populated categories and partially populated metadata.
- The marketplace **MUST** ignore or reject malformed catalog entries without blocking valid entries from appearing.
- The marketplace **SHOULD** surface a non-fatal warning or diagnostics signal when entries are skipped due to invalid metadata.

### REQ-4: World Import from Marketplace

- A world entry imported from the marketplace **MUST** use the current world import pipeline and validation rules.
- Marketplace world import **MUST** preserve existing conflict handling and overwrite safeguards.
- Marketplace world import **MUST** preserve current world semantics, including imported agents, chats, and related world data when those are already part of standard world import behavior.
- Marketplace world import **MUST NOT** introduce a second world schema or bypass existing import validation.
- Existing manual world import methods, including local-folder import and GitHub shorthand import, **MUST** continue to work unchanged.

### REQ-5: Agent Import from Marketplace

- The marketplace **MUST** support importing standalone agent entries into an existing target world.
- If the user has not selected a target world, the import flow **MUST** require an explicit world selection before completing the import.
- Imported agents **MUST** go through the same validation and conflict checks as other agent creation or import paths.
- Importing an agent **MUST NOT** silently overwrite an existing agent with the same identity.
- Importing an agent **MUST NOT** create or replay chats as a side effect.
- Importing an agent **MUST NOT** change the selected chat unless the user explicitly performs a later action to do so.

### REQ-6: Skill Import from Marketplace

- The marketplace **MUST** support importing standalone skills from the catalog.
- The import flow **MUST** let the user choose an allowed destination consistent with existing skill scope rules, such as global and project-scoped skills where supported.
- Imported skills **MUST** appear in the skill registry after a successful import.
- Skill import **MUST** preserve current skill trust boundaries: importing a skill stores it, but does not execute its content as part of the import action.
- Skill import **MUST NOT** silently overwrite an existing skill with the same identity.
- Imported skill content **MUST** be handled as untrusted input and validated by existing registry or content rules.

### REQ-7: Unified Import UX and Feedback

- Every marketplace entry **MUST** provide a clear import action.
- The import flow **MUST** report actionable success and failure states to the user.
- On success, the UI **MUST** identify what was imported and from which marketplace entry.
- On failure, the UI **MUST** provide a clear reason, including whether the failure was caused by fetch, validation, conflict, or permission/scope selection.
- The marketplace **SHOULD** provide a detail or preview view before import when richer metadata is available.

### REQ-8: Traceability and Source Metadata

- Imported artifacts **MUST** retain source traceability metadata sufficient to identify the remote origin.
- Traceability metadata **MUST** include, when available:
  - repository (`owner/repo`)
  - branch or ref
  - artifact path
  - resolved commit SHA or equivalent immutable reference
- Success responses and diagnostics **SHOULD** expose this metadata in a user-readable way.

### REQ-9: Security and Trust Boundaries

- The marketplace **MUST** restrict this catalog experience to the approved repository unless a future requirement explicitly expands repository support.
- Remote catalog and import content **MUST** be treated as untrusted input.
- Import flows **MUST NOT** execute fetched scripts or arbitrary code during catalog discovery or import.
- Import flows **MUST** reject path traversal, absolute-path escapes, and unsupported symbolic-link materialization.
- Import flows **MUST** enforce bounded resource limits for remote fetch and staging.
- Failures caused by trust-boundary enforcement or resource limits **MUST** fail safely and explicitly.

## Non-Functional Requirements

### Compatibility

- Existing local import behavior **MUST** remain unchanged.
- Existing GitHub shorthand world import behavior **MUST** remain unchanged.
- Existing skill registry and world management flows **MUST** remain behaviorally compatible after marketplace introduction.

### Reliability

- Catalog load failures **MUST** fail gracefully and preserve the rest of the app.
- Partial catalog failures **MUST NOT** prevent valid entries from being displayed.
- Import failures **MUST NOT** leave partially installed artifacts in a misleading success state.

### Performance

- The marketplace **SHOULD** load within a reasonable interactive time for a normal repository catalog.
- The marketplace **SHOULD** avoid refetching unchanged catalog data excessively within a single user session.

## Scope

### In Scope

- In-app catalog browsing for worlds, agents, and skills from `yysun/awesome-agent-world`.
- Searchable marketplace discovery.
- Import actions for marketplace worlds, agents, and skills.
- Source traceability and user-facing feedback for imported artifacts.
- Empty-state handling for categories with no current entries.

### Out of Scope

- Publishing or uploading artifacts back to `awesome-agent-world` from the app.
- Arbitrary third-party repository marketplaces.
- Ratings, reviews, comments, downloads analytics, or monetization.
- Automatic background updates of previously imported artifacts.
- Generic dependency resolution across imported artifacts unless defined by a later requirement.

## Acceptance Criteria

- [ ] Users can open a marketplace catalog sourced from `yysun/awesome-agent-world`.
- [ ] The marketplace shows separate categories for worlds, agents, and skills.
- [ ] Empty categories render explicit empty states instead of failing the view.
- [ ] Each visible marketplace entry shows artifact type, name, description, and source path or URL.
- [ ] Users can import a world from the marketplace through the existing world import semantics.
- [ ] Users can import an agent from the marketplace into a selected world without affecting chats.
- [ ] Users can import a skill from the marketplace into an allowed skill scope without executing it during import.
- [ ] Import conflicts do not silently overwrite existing artifacts.
- [ ] Import success and failure states identify the artifact and source.
- [ ] Existing local and shorthand world import flows continue to work unchanged.

## User Stories

### Story 1: Browse and import a world
**As a** user  
**I want to** browse worlds from `awesome-agent-world` in a marketplace  
**So that** I can import a world without typing repository paths manually.

### Story 2: Add a reusable agent to a world
**As a** user  
**I want to** import a standalone marketplace agent into my current world  
**So that** I can expand a team without rebuilding the agent by hand.

### Story 3: Install a shared skill safely
**As a** user  
**I want to** import a marketplace skill into an allowed skill scope  
**So that** I can use shared skills without manually copying files.

### Story 4: Understand source and trust
**As a** user  
**I want to** see where an imported artifact came from  
**So that** I can trust and troubleshoot what I installed.

## Assumptions and Notes

- The initial catalog may legitimately contain zero entries for one or more artifact categories; that does not block the marketplace feature.
- If standalone marketplace metadata for agents or skills requires a new manifest convention, that convention will be defined during planning and implementation without changing the user-facing requirement that these artifact types be discoverable and importable.
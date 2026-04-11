# Requirement: Canonical Agent World Skill Roots

**Date**: 2026-04-11
**Type**: Behavior and configuration standardization
**Component**: skill discovery, skill install/import flows, docs, and skill-path presentation

## Summary

Agent World must standardize on one canonical project skill root and one canonical global skill root.

- Canonical project skill root: `<project folder>/.agent-world/skills` (displayed as `./.agent-world/skills` when shown relative to the active project)
- Canonical global skill root: `~/.agent-world/skills`

These two roots must become the only supported locations used by product behavior, generated examples, documentation, and user-visible path references.

## Problem Statement

The current product and documentation surface still reference multiple competing skill roots.

That ambiguity creates avoidable drift across discovery, install/import UX, tests, examples, and tool-generated path instructions. A user cannot reliably predict where a newly created or imported skill belongs, and the system cannot present one stable answer for "where do Agent World skills live?"

## Goals

- Define one canonical project skill root for Agent World project scope.
- Define one canonical global skill root for Agent World user scope.
- Make all default behavior and user-facing references align with those canonical roots.
- Preserve deterministic behavior for duplicate skills across project and global scope.

## Non-Goals

- Redesigning the skill editor UI.
- Changing the SKILL.md file format.
- Changing skill execution semantics beyond path-source standardization.
- Supporting legacy skill-root locations.

## Requirements

### R1: Canonical project root

The canonical project skill root for Agent World must resolve to `<project folder>/.agent-world/skills`.

For project-local behavior, absolute project skill paths must resolve to the active Agent World project folder plus `/.agent-world/skills`.

### R2: Canonical global root

The canonical global skill root must be `~/.agent-world/skills`.

User-scope skill install, import, create, and example flows must treat `~/.agent-world/skills` as the default global destination.

### R3: Canonical roots are the default for new writes

Any product flow that creates, imports, installs, scaffolds, or saves a skill by default must target the canonical root for the selected scope unless the user explicitly overrides the destination.

### R4: Canonical roots are the primary discovery defaults

Skill discovery defaults must use the canonical project and global roots as the primary roots for Agent World.

No non-canonical roots should remain in default or fallback discovery once this story is implemented.

### R5: User-facing references must use canonical roots

Documentation, generated examples, visible install hints, runtime guidance, and skill-management UX must present the canonical roots as the standard locations for Agent World skills.

The product must stop advertising any non-canonical skill roots.

### R6: Non-canonical roots are unsupported

Non-canonical roots must not be read, written, or presented as supported defaults.

### R7: Canonical paths define collision behavior

Existing project-scope-over-global-scope precedence must remain unchanged.

### R8: Only canonical roots are discovered and written

If a user wants skills available to Agent World after this change, those skills must exist under the canonical roots.

### R9: Canonical path language must stay consistent across scopes

When the product refers to project-scope versus global-scope skill placement, it must use consistent terminology and examples that map directly to:

- project: `<project folder>/.agent-world/skills` (or `./.agent-world/skills` when written relative to the active project)
- global: `~/.agent-world/skills`

The same scope labels must be used consistently in docs and interactive UX.

### R10: Downstream skill-path instructions must remain coherent

Any downstream instruction surface that references a skill root, skill-relative script path, artifact path, or installation location must remain coherent with the canonical root contract.

This story must not leave Agent World describing one root in the UI while later runtime instructions, prompts, or examples use a different default root for the same skill.

## Acceptance Criteria

1. A new project-scope skill created with default settings is placed under `<project folder>/.agent-world/skills`.
2. A new global-scope skill created with default settings is placed under `~/.agent-world/skills`.
3. Agent World documentation and user-facing install hints describe `<project folder>/.agent-world/skills` and `~/.agent-world/skills` as the standard roots.
4. Agent World does not discover or write skills under non-canonical roots.
5. Project-scope-over-global-scope collision precedence continues to behave as it does today.

## Notes

- This REQ defines the canonical root contract only. It does not prescribe whether implementation uses migration, compatibility scanning, aliases, or staged deprecation.
- A follow-up AP may define whether a separate migration helper is needed for legacy skill directories.

## Architecture Review (AR)

**Review Date**: 2026-04-11
**Reviewer**: AI Assistant
**Result**: Approved for planning

### Findings

- The canonical roots should be real on-disk defaults, not just display aliases.
- Project-scope storage must move to the dot-prefixed project directory rather than the legacy workspace `skills/` location.
- Non-canonical roots should be removed from discovery and import logic instead of being kept as compatibility inputs.

### AR Decision

Treat `<project folder>/.agent-world/skills` and `~/.agent-world/skills` as the canonical on-disk roots for project and global skill storage.

Non-canonical roots are out of scope once the canonical migration lands.
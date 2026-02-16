# Requirement: Built-in File Navigation Tools
## Overview
Add three built-in tools so agents can inspect workspace contents and identify relevant destination files without requiring external MCP servers.

## Goals
- Provide reliable built-in file context gathering.
- Provide built-in directory listing for file discovery.
- Provide built-in content search for destination lookup.

## Functional Requirements
1. The world toolset must include a built-in tool named `read_file`.
2. The world toolset must include a built-in tool named `list_files`.
3. The world toolset must include a built-in tool named `grep`.
4. `read_file` must return readable file contents from a provided file path with optional pagination controls.
5. `list_files` must return directory entries for a provided directory path.
6. `grep` must return search matches based on a query and optional file filtering options.
7. Existing built-in tools (`shell_cmd`, `load_skill`) must remain available.
8. New tools must be discoverable through `getMCPToolsForWorld` for worlds with and without MCP config.
9. Backward compatibility must be preserved for existing `grep_search` tool-call naming by exposing it as an alias to `grep`.
10. Relative path resolution must be deterministic and documented against runtime working-directory behavior.

## Non-Functional Requirements
- Tool execution must be deterministic and return clear error messages on invalid inputs.
- Tool behavior should be consistent with existing tool wrapping/validation behavior.
- Existing world startup and MCP tool-loading behavior must remain backward compatible.

## Constraints
- Keep implementation aligned with project conventions (function-based architecture, minimal scope changes).
- Avoid introducing unrelated refactors.

## Assumptions (AR Validation)
- Tool execution context may omit explicit working directory in some call paths; runtime fallback behavior must be deterministic.
- Existing tests and prompts may still refer to `grep_search` even when canonical tool name is `grep`.
- Callers expect built-in tools to be available regardless of MCP server configuration state.

## Alternatives Considered (AR)
- **Alias strategy (selected):** expose both `grep` and `grep_search` to maximize compatibility with minimal migration risk.
- **Rename-only strategy (rejected):** expose only `grep`; simpler surface but high regression risk for existing prompts/tests.
- **Dedicated compatibility translator (deferred):** map old names at runtime; flexible but adds unnecessary indirection for this scope.

## Acceptance Criteria
- [ ] `getMCPToolsForWorld(worldId)` returns `read_file`, `list_files`, and `grep` for a world with no MCP config.
- [ ] `getMCPToolsForWorld(worldId)` continues returning `shell_cmd` and `load_skill` along with the new tools.
- [ ] `getMCPToolsForWorld(worldId)` exposes `grep_search` as a compatibility alias to `grep`.
- [ ] `read_file` executes successfully for valid file paths and fails gracefully for invalid paths.
- [ ] `list_files` executes successfully for valid directories and fails gracefully for invalid paths.
- [ ] `grep` executes successfully for valid queries and supports optional filtering.
- [ ] Integration tests account for runtime working-directory path resolution so JSON-result assertions are stable.
- [ ] Existing tests remain green or are updated minimally for intended behavior changes.

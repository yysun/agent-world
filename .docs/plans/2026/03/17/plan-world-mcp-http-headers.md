# Plan: World MCP HTTP Headers

## Scope

Implement end-to-end support expectations for world MCP config JSON headers by tightening validation and adding regression coverage for runtime header propagation and config persistence.

## Assumptions

- Remote MCP transports already accept `headers` in runtime connection setup and should not be reworked unless tests show a gap.
- Server status routes already avoid exposing raw header values and should remain unchanged unless tests reveal leakage.
- The highest-value implementation work is validating header-bearing config shapes and locking behavior with focused tests.

## Tasks

- [x] Strengthen MCP config validation in `core/mcp-server-registry.ts` so remote server `headers` must be a string-to-string map and invalid shapes are rejected.
- [x] Align validation defaults with the parser so `url`-only server definitions are treated as remote `streamable-http` configs instead of invalid `stdio` entries.
- [x] Add core registry tests covering:
  - valid `headers` parsing for world MCP JSON
  - invalid header shapes rejection
  - connection transport options receiving configured headers
  - distinct registry identities for same URL with different headers
- [x] Add storage regression coverage proving header-bearing `mcpConfig` survives save/load round-trip unchanged.
- [x] Run targeted unit tests and `npm run integration` because the change touches MCP runtime/config behavior.
- [x] Update this plan with completion state and note any residual risks.

## Risks

- Tightened validation could reject previously tolerated malformed configs; tests should confirm valid existing shapes still pass.
- Registry identity behavior must continue to prevent credential mixing across worlds that share a remote URL.

## Outcome

- Implemented the root fix in validation: world MCP config entries that provide `url` without an explicit transport now validate as remote `streamable-http`, matching runtime parsing behavior and the intended user-facing JSON contract.
- Added regression coverage for header-bearing remote configs, malformed header rejection, per-header connection isolation, and storage round-tripping.
- No server route changes were needed because MCP status responses already omit raw configuration details.

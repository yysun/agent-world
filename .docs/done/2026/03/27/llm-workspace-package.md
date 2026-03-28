# Done: LLM Workspace Package

**Date:** 2026-03-27
**Status:** Completed
**Related:** [REQ](../../reqs/2026/03/27/req-llm-workspace-package.md), [Plan](../../plans/2026/03/27/plan-llm-workspace-package.md), [Test Spec](../../tests/test-llm-workspace-package.md)

## Summary

Completed the `packages/llm` workspace extraction into the publishable `@agent-world/llm` package, including package-owned provider configuration, provider adapters, built-in tool ownership and execution, executable MCP support, skill loading, and a real terminal showcase runner that uses Google Gemini from repo `.env`.

## Delivered

1. **Publishable `@agent-world/llm` workspace**
   - Added `packages/llm` as a root workspace and package entrypoint.
   - Exposed the package from the repo root as `agent-world/llm`.
   - Added package-local build/check scripts and public exports.

2. **Package-owned runtime surface**
   - `createLLMRuntime(...)` now owns provider config, MCP registry, skill registry, tool registry, and runtime dispatch.
   - Runtime instances keep provider configuration isolated from each other.
   - Per-call tool injection cannot override reserved built-in names.

3. **Package-owned provider layer**
   - Added package-native provider adapters for OpenAI-compatible, Anthropic, and Google.
   - Added package-native request/response/message/tool-call types.
   - `generate(...)` and `stream(...)` now dispatch through package-owned provider modules.

4. **Package-owned built-ins**
   - Moved canonical built-in definitions and executors into the package for:
     - `shell_cmd`
     - `load_skill`
     - `human_intervention_request`
     - `web_fetch`
     - `read_file`
     - `write_file`
     - `list_files`
     - `grep`
   - Constructor-time built-in enablement is the default policy, with per-call narrowing only.
   - `human_intervention_request` returns a deterministic pending artifact owned by the package.

5. **Executable MCP support**
   - MCP config parsing moved into the package.
   - MCP servers now connect through the package-owned client layer.
   - MCP tools are resolved into package-native executable tools and merged with built-ins during runtime resolution.
   - Runtime shutdown now closes MCP client resources.

6. **Package-owned skill support**
   - Added ordered skill-root discovery and loading in the package.
   - `load_skill` executes through the package skill registry.
   - Duplicate skill IDs follow ordered-root precedence.

7. **Real Gemini showcase runner**
   - Added `npm run test:llm-showcase` as a real end-to-end package showcase.
   - The showcase loads provider config from repo `.env`, uses Google Gemini only, spins up a local stdio MCP server, and exercises:
     - `read_file`
     - `load_skill`
     - MCP tool discovery/execution
     - streaming with built-ins and MCP together
   - The old mocked package suite remains available as `npm run test:llm`.

## Code Review Outcome

- Completed CR on the delivered package runtime and showcase changes.
- No blocking correctness, architecture, or maintainability findings remain in the shipped diff.

## Verification

Executed and passed:

- `npm run test:llm`
- `npm run test:llm-showcase`

Observed live showcase outputs:

- `REPO_TOKEN=alpha-repo-token`
- `SKILL_TOKEN=skill-beacon-77`
- `MCP_TOKEN=beta-signal-842`
- `STREAM_FILE_TOKEN=stream-marker-21`
- `STREAM_MCP_TOKEN=gamma-signal-173`

## Files Delivered

- `package.json`
- `packages/llm/package.json`
- `packages/llm/src/index.ts`
- `packages/llm/src/types.ts`
- `packages/llm/src/runtime.ts`
- `packages/llm/src/llm-config.ts`
- `packages/llm/src/builtins.ts`
- `packages/llm/src/builtin-executors.ts`
- `packages/llm/src/mcp.ts`
- `packages/llm/src/skills.ts`
- `packages/llm/src/tools.ts`
- `packages/llm/src/tool-validation.ts`
- `packages/llm/src/openai-direct.ts`
- `packages/llm/src/anthropic-direct.ts`
- `packages/llm/src/google-direct.ts`
- `tests/llm/runtime.test.ts`
- `tests/llm/runtime-provider.test.ts`
- `tests/llm/openai-direct.test.ts`
- `tests/llm/mcp-runtime.test.ts`
- `tests/llm/showcase.test.ts`
- `tests/llm/showcase-config.test.ts`
- `tests/e2e/llm-package-showcase.ts`
- `tests/e2e/support/llm-package-showcase-support.ts`
- `tests/e2e/support/llm-showcase-mcp-server.mjs`
- `.docs/plans/2026/03/27/plan-llm-workspace-package.md`
- `.docs/tests/test-llm-workspace-package.md`
- `.docs/done/2026/03/27/llm-workspace-package.md`

## Remaining Work

- `core` still has migration cleanup left if the repo wants all legacy provider imports and compatibility shims removed.
- `npm run integration` was not run in this completion pass.

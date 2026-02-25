# Architecture: Code Isolation & Organization

## Reorganization Summary (2026-02-19)

This document mirrors the old branch code-isolation writeup, updated for the current `agent-world.latest` structure and conventions.

### Changes Made

#### 1. Opik Runtime Isolation
**Before (mixed placement):**
- Optional tracer runtime was named generically and lived under `core/opik/`.

**After:**
- `core/optional-tracers/opik-runtime.ts`

**Rationale:**
- Makes scope explicit: this runtime is Opik-specific and part of optional tracer infrastructure.
- Leaves room for future tracer backends without conflating core runtime logic.

#### 2. Opik Scripts Naming Convention
**Before:**
- `scripts/eval-robustness.ts`
- `scripts/export-world-storage.ts`

**After:**
- `tests/opik/eval-robustness.ts`
- `scripts/opik-export-world-storage.ts`

**Rationale:**
- Opik-specific tooling is explicitly labeled.
- Avoids ambiguity with non-Opik core scripts.

#### 3. User Agent Setup in Data Directory
**Before:**
- `scripts/setup-infinite-etude.ts`
- Root script alias in `package.json` for demo setup

**After:**
- `data/worlds/infinite-etude/setup-agents.ts`
- No demo setup command in root `package.json`

**Rationale:**
- User-agent world setup belongs with user-agent world data.
- Keeps root package scripts focused on product/runtime operations.

#### 4. User Agent Data Organization
**Current location:**
- `data/worlds/infinite-etude/config.json`
- `data/worlds/infinite-etude/prompts/*.md`
- `data/worlds/infinite-etude/setup-agents.ts`

**Rationale:**
- Declarative world/agent setup colocated in `data/worlds/{world}`.
- Consistent with default-world and file-storage patterns.

### Remaining Global Scripts (Intentional)

Kept under `scripts/` because they are Opik integration/support tooling:
- `opik-eval-robustness.ts`
- `opik-export-world-storage.ts`

### Architecture Principles

```text
agent-world.latest/
├── core/                               # Core business logic (agent/world/LLM)
│   └── optional-tracers/               # Optional tracer runtime adapters
│       └── opik-runtime.ts
├── packages/opik/                      # Opik package (isolated integration surface)
├── data/
│   └── worlds/{world-name}/            # User-agent world configuration
│       ├── config.json                 # Declarative world/agent setup
│       ├── prompts/                    # Prompt files (*.md)
│       └── setup-agents.ts             # Setup script colocated with world data
├── scripts/                            # Core and integration support scripts
│   ├── launch-electron.js
│   ├── opik-eval-robustness.ts
│   └── opik-export-world-storage.ts
└── web/src/components/                 # Product UI components (no demo migration in this pass)
```

### Migration Notes

- ✅ Opik runtime path is now explicit: `core/optional-tracers/opik-runtime.ts`
- ✅ Infinite Étude setup runs from: `npx tsx data/worlds/infinite-etude/setup-agents.ts`
- ✅ Old `scripts/setup-infinite-etude.ts` removed
- ✅ Opik script names now prefixed with `opik-`
- ✅ Demo setup command removed from root `package.json`

### Benefits

1. **Clear Boundaries:** Opik runtime, Opik scripts, and user-agent data are clearly separated.
2. **Lower Coupling:** User-agent demo setup is no longer exposed as a root package command.
3. **Naming Clarity:** Opik-specific scripts are easy to identify.
4. **Scalability:** Additional worlds can follow the same `data/worlds/{world}` pattern.
5. **Maintainability:** Directory intent is explicit and discoverable.

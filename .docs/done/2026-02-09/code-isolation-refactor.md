# Architecture: Code Isolation & Organization

## Reorganization Summary (2026-02-09)

This document tracks the reorganization to improve isolation between Agent World core, Opik observability, and user-specific agents.

### Changes Made

#### 1. Opik Scripts → `packages/opik/scripts/`
**Before:**
- `scripts/verify-opik-web.ts`

**After:**
- `packages/opik/scripts/verify-web-integration.ts`
- `packages/opik/scripts/README.md`

**Rationale:** Opik-specific test/verification scripts belong with the opik package, not in global scripts directory.

#### 2. User Agent Data → `data/worlds/{world-name}/`
**Before:**
- `scripts/setup-infinite-etude.ts` (hardcoded prompts)
- `data/infinite-etude/setup-agents.ts`

**After:**
- `data/worlds/infinite-etude/config.json` (agent configuration)
- `data/worlds/infinite-etude/prompts/*.md` (individual prompt files)
- `data/worlds/infinite-etude/setup-agents.ts` (reads from config)
- `data/worlds/infinite-etude/README.md`

**Rationale:** 
- Follows same pattern as `data/worlds/default-world/`
- Separates domain-specific prompts from core logic
- Makes agents declarative and easier to modify

#### 3. Demo Components → `web/src/components/demos/`
**Before:**
- `web/src/components/sheet-music.tsx` (mixed with core components)
- `data/infinite-etude/sheet-music.tsx` (wrong location)

**After:**
- `web/src/components/demos/sheet-music.tsx`
- `web/src/components/demos/README.md`

**Rationale:**
- Demo/domain-specific UI should be isolated from core UI
- TSX files belong in web structure, not data directory
- Clear separation between reusable core and specific demos

### Remaining Global Scripts

Scripts that stayed in `scripts/` directory:
- `setup-infinite-etude.ts` - **DEPRECATED** (use `data/worlds/infinite-etude/setup-agents.ts`)

Scripts moved to `tests/opik/`:
- `eval-robustness.ts` - Opik safety regression testing (Phase 2 & 3)

### Architecture Principles

```
agent-world.opik/
├── core/                          # Business logic (agent, world, LLM)
├── packages/opik/                 # Observability (isolated package)
│   └── scripts/                   # Opik-specific test scripts
├── data/
│   └── worlds/{world-name}/       # User agent configurations
│       ├── config.json            # Declarative agent setup
│       ├── prompts/               # Prompt files (*.md)
│       └── setup-agents.ts        # Setup script (reads config)
├── web/src/components/
│   ├── *.tsx                      # Core UI components
│   └── demos/                     # Domain-specific demos
└── scripts/                       # Core test/setup scripts only
```

### Migration Notes

- ✅ Opik verification script now runs from: `npx tsx packages/opik/scripts/verify-web-integration.ts`
- ✅ Infinite Étude setup now runs from: `npx tsx data/worlds/infinite-etude/setup-agents.ts`
- ⚠️ Old `scripts/setup-infinite-etude.ts` should be removed after confirming new setup works
- ✅ Import path updated: `import SheetMusic from './demos/sheet-music'`

### Benefits

1. **Clear Boundaries:** Each subsystem has its own directory
2. **Easier Testing:** Opik can be tested in isolation
3. **Declarative Agents:** Prompts are files, not hardcoded strings
4. **Scalability:** Easy to add new worlds without polluting core
5. **Maintainability:** Related files are colocated

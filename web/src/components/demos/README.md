# Demo Components

This directory contains demo/example UI components for specific use cases.

## Purpose

Demo components are:
- **Domain-specific**: Tied to particular agent worlds or features
- **Isolated**: Not part of core Agent World functionality
- **Examples**: Show how to integrate custom UI with Agent World

## Current Demos

### sheet-music.tsx
VexFlow integration for "The Infinite Étude" music generation world.

**Related:**
- World: `data/worlds/infinite-etude/`
- Agents: Maestro Composer, Madame Pedagogue, Monsieur Engraver

## Storage Migration for Demos

When recording demos, you may want to use **file-based storage** instead of SQLite for better visibility and version control.

### Migrate to File Storage

```bash
# Set storage type to file and run migration
AGENT_WORLD_STORAGE_TYPE=file npx tsx scripts/migrate-storage.ts "The Infinite Étude" replace
```

**Modes:**
- `replace` - Clean migration (deletes destination before copying)
- `merge` - Preserves existing destination data, adds only new items

### Migrate Back to SQLite

```bash
# Switch back to database after demo recording
AGENT_WORLD_STORAGE_TYPE=sqlite npx tsx scripts/migrate-storage.ts "The Infinite Étude" replace
```

### Run Server with File Storage

```bash
# Start development server using file-based storage
AGENT_WORLD_STORAGE_TYPE=file npm run server:dev
```

**What Gets Migrated:**
- World configuration
- Agent definitions (with memory)
- Chat history
- Memory entries

**Location:** File storage creates JSON files at `data/worlds/{world-name}/`

## Architecture Principles

Following Agent World's isolation guidelines:
- Core agent logic → `core/`
- Observability → `packages/opik/`
- Domain prompts/data → `data/worlds/{world-name}/`
- Demo UI → `web/src/components/demos/` (here)

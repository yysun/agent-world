# Demo Components

React versions of Agent World demo components.

## Purpose

Demo components showcase specific agent worlds with custom UI integrations.

## Current Demos

### SheetMusic.tsx
VexFlow integration for "The Infinite Étude" music generation world.

**Related:**
- World: `data/worlds/infinite-etude/`
- Agents: Maestro Composer, Madame Pedagogue, Monsieur Engraver
- AppRun version: `web/src/components/demos/sheet-music.tsx`

## Architecture

Following Agent World's isolation guidelines:
- Core agent logic → `core/`
- Observability → `packages/opik/`
- Domain prompts/data → `data/worlds/{world-name}/`
- AppRun demos → `web/src/components/demos/`
- React demos → `react/src/demos/` (here)

# Agent World - Copilot Instructions

## Project Context

**Tech Stack:** TypeScript, Node.js, vitest, ESLint, Prettier  
**Monorepo packages:** `core/` (business logic), `server/` (REST API), `cli/`, `web/` (AppRun frontend)
**Frontend Reference:** Use `prompts/apprun.prompt.md` for `web/src` patterns
**Storage:** Default SQLite database is located at `~/.agent-world/database.db`

## CRITICAL RULES - MUST FOLLOW

### Unit Test Creation Rules (MANDATORY)
- **ALWAYS use in-memory storage for unit tests** - NEVER use file system or real database
- **ALWAYS mock LLM calls in tests** - NEVER make real API calls to LLM

### Code Style Rules (MANDATORY)
- **ALWAYS use function-based approach** - NEVER use classes unless absolutely required
- **ALWAYS add/update comment blocks at top of files** - Describe purpose, features, changes
- Add or update documentation in `.docs/` when you introduce significant features or changes.  


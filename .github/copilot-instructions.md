## File Comment Blocks
- Add/update comment blocks at the top of each source file summarizing features, implementation, and changes
- Create before editing, if missing update after changes

## Command Keywords
- **AA**: Create a detailed functional implementation plan (no optimization) as check list → save the list to `docs/plan/plan-{name}.md` → wait for confirmation
- **AP**: Review requirements → think hard ensure no flaw → provide suggestions → wait for confirmation
- **AS**: Execute plan → implement step-by-step → mark done → git stage changed and commit
- **CC**: Consolidate code and comments block → remove redundant
- **OO**: Present options → wait for confirmation before proceeding
- **SS**: Step-by-step with approval → implement from plan, wait for confirmation each step
- **GG**: Document features → create/update markdown in `docs/` (use mermaid if needed)
- **!!**: Save requirements → focus on `what`, not `how`, no plan → save to `docs/requirements/req-{name}.md` → wait for confirmation
- **!!!**: Update the requirements and plan, and implement

## Planning Rules
- Large changes or "AA" → always create plan first, get confirmation
- Focus on functionality/logic, not optimizations
- Break into smaller, actionable steps with context/dependencies

## Interaction Guidelines
- When you are done or need my input → play sound :`afplay /System/Library/Sounds/Glass.aiff`

## Project Instructions
- use function based approach instead of class based
- do not use dynamic module imports
- use `npx tsx` for TypeScript execution
- `npm run dev` - Start the dev
- `npm test` - Run tests
- when creating unit tests - only mock file io and LLM, do not mock world, event bus or agent
- write debug code and use `tsx` for debugging if needed


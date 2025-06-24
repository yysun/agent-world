## File Comment Blocks
- Add/update comment blocks at the top of each source file summarizing features, implementation, and changes
- Create before editing if missing; update after changes

## Command Keywords
- **AA**: Create a detailed functional implementation plan (no optimization) as check list → save the list to `docs/plan/`;
- **AP**: Review plan with steps → think hard ensure no flaw → provide suggestions → wait for confirmation;
- **AS**: Execute plan → implement step-by-step → mark done → git stage changed and commit;
- **CC**: Consolidate comments block → remove redundant;
- **OO**: Present options → wait for confirmation before proceeding;
- **SS**: Step-by-step with approval → implement from plan, wait for confirmation each step;
- **GG**: Document features → create/update markdown in `docs/` (use mermaid if needed);
- **!!**: Save my requirements a file to `docs/requirements`, no plan;
- **!!!**: Update the requirements, plan, and code to implement;
## Planning Rules
- Large changes or "AA" → always create plan first, get confirmation
- Focus on functionality/logic, not optimizations
- Break into smaller, actionable steps with context/dependencies

## Project Instructions
- `npm run dev` - Start the CLI
- `npm test` - Run tests
- use `tsx` for TypeScript execution
- use function based approach instead of class based

## Interaction Guidelines
- When you are done or need my input → play sound :`afplay /System/Library/Sounds/Glass.aiff`
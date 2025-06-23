## File Comment Blocks
- Add/update comment blocks at the top of each source file summarizing features, logic, and changes
- Create before editing if missing; update after changes
- Ensure clarity, accuracy, and completeness

## Command Keywords
- **AA**: Create a detailed functional implementation plan (no optimization) → save check list to `docs/plan/`;
- **AS**: Execute plan → implement step-by-step → update docs → git stage changed and commit;
- **CC**: Present options → wait for confirmation before proceeding;  
- **SS**: Step-by-step with approval → implement from plan, wait for confirmation each step;
- **GG**: Document features → create/update markdown in `docs/` (use mermaid if needed);
- **!!**: Save my requirements a file to `docs/requirements`, no plan;
- **!!!**: Update the requirements, plan, and code to implement;
## Planning Rules
- Large changes or "AA" → always create plan first, get confirmation
- Focus on functionality/logic, not optimizations
- Break into smaller, actionable steps with context/dependencies

## Commands
- `npm run dev` - Start the CLI
- `npm test` - Run tests
- use `tsx` for TypeScript execution
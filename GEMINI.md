## File Comment Blocks
- Add/update comment blocks at the top of each source file summarizing features, implementation, and changes.
- Create before editing, if missing update after changes.

## Command Keywords
- **AA**: Create a implementation plan using check boxes → save to `docs/plan/plan-{name}.md` → wait for confirmation.
- **AP**: Review requirements → think hard ensure no flaw → provide suggestions → wait for confirmation.
- **CC**: Consolidate code and comments block → remove redundant.
- **OO**: Present options → wait for confirmation before proceeding.
- **SS**: Step-by-step with approval → wait for confirmation each step.
- **AS**: Step-by-step auto → continue to next step automatically.
- **GG**: Document features → create/update markdown (use mermaid if needed) to `docs/done` .
- **!!**: Create and save requirements to `docs/requirements/req-{name}.md` → wait for confirmation.
- **!!!**: Update the requirements and plan, and implement.
- **SP**: consolidate, remove redundant, keep all ideas, make it concise and easy for LLM to understand.

## Requirement and Planning Rules
- Requirement creation or analysis → focus on `what`, not `how`, not optimization.
- Large changes or "AA" → always create plan first → get confirmation.

## Execution Rules
- All step-by-step execution follows: implement from plan → update document each step → mark as done → git commit.
- **SS** = manual approval required each step.
- **AS** = automatic progression through steps.


## Coding Rules

### Code Structure
- Use functions, not classes
- Use static module imports
- Omit `.js`/`.ts` extensions from imports

### Testing
- Unit test: mock only file I/O and LLM
- Create `.ts` files under `integration-tests`→ use `npx tsx` for testing

### Execution
- Run scripts with: `npx tsx`

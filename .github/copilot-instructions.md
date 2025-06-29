## File Comment Blocks
- Add/update comment blocks at the top of each source file summarizing features, implementation, and changes.
- Create before editing, if missing update after changes.

## Command Keywords
- **AA**: Create a implementation plan → save to `docs/plan/plan-{name}.md` → wait for confirmation.
- **AP**: Review requirements → think hard ensure no flaw → provide suggestions → wait for confirmation.
- **CC**: Consolidate code and comments block → remove redundant.
- **OO**: Present options → wait for confirmation before proceeding.
- **SS**: Step-by-step with approval → wait for confirmation each step.
- **AS**: Step-by-step auto → continue to next step automatically.
- **GG**: Document features → create/update markdown (use mermaid if needed) to `docs/done` .
- **!!**: Save requirements → focus on `what`, not `how`, no plan → save to `docs/requirements/req-{name}.md` → wait for confirmation.
- **!!!**: Update the requirements and plan, and implement.
- **SP**: consolidate, remove redundant, keep all ideas, make it concise and easy for LLM to understand.

## Planning Rules
- Large changes or "AA" → always create plan first → get confirmation.
- Requirement analysis or plan → focus on functionality/logic, not optimizations.
- Order the phases sequentially from basic to advanced.
- Use checkboxes for each step in the plan.
- Add go/no-go checkpoints after each phase.

## Execution Rules
- All step-by-step execution follows: implement from plan → update document each step → mark as done → git commit.
- **SS** = manual approval required each step.
- **AS** = automatic progression through steps.


## Development Instructions
- use function based approach instead of class based.
- use static module imports
- remove `.js` and `.ts` extension from imports
- when creating unit tests - only mock file io and LLM, do not mock world, event bus or agent.
- execute script: use `npx tsx` 
## File Comment Blocks
- Add/update comment blocks at the top of each source file summarizing features, implementation, and changes.
- Create before editing, if missing update after changes.

## Command Keywords
- **AA**: Create a detailed functional implementation plan (no optimization) as check list → wait for confirmation.
- **AP**: Review requirements → think hard ensure no flaw → provide suggestions → wait for confirmation.
- **CC**: Consolidate code and comments block → remove redundant.
- **OO**: Present options → wait for confirmation before proceeding.
- **SS**: Step-by-step with approval → implement from plan, wait for confirmation each step.
- **GG**: Document features → create/update markdown (use mermaid if needed).
- **!!**: Save requirements → focus on `what`, not `how`, no plan → wait for confirmation.
- **!!!**: Update the requirements and plan, and implement.
- **SP**: consolidate, remove redundant, keep all ideas, make it concise and easy for LLM to understand.

## Planning Rules
- Large changes or "AA" → always create plan first, get confirmation.
- Focus on functionality/logic, not optimizations.
- Break into smaller, actionable steps with context/dependencies.

## Development Instructions
- use function based approach instead of class based.
- do not use dynamic module imports.
- when creating unit tests - only mock file io and LLM, do not mock world, event bus or agent.
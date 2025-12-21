## File Comment Blocks

- Add/update comment blocks at the top of each source file summarizing features, implementation, and changes.
- Create before editing, if missing update after changes.

## Command Keywords

When the user message starts with/contains these keywords, perform the linked actions:

- **REQ**: Create or update requirements in `.docs/reqs/{yyyy-mm-dd}/req-{name}.md`, focusing only on what is needed, not how or optimization.
- **AP**: Create an architecture plan with markdown checkboxes, outlining phased implementation steps, and save it to `.docs/plans/{yyyy-mm-dd}/plan-{name}.md`.
- **AR**: Review the architecture to validate assumptions, provide options, and update the existing requirement and plan docs without creating a new review document.
- **SS**: Implement the plan step-by-step, updating progress in the plan document and pausing at logical checkpoints for confirmation.
- **CC**: Consolidate code and comment blocks by removing redundant code, comments, and dead paths.
- **DF**: Debug and fix issues by identifying the true root cause, explaining the problem clearly, and proposing and applying the appropriate solution.
- **DD**: Document completed features by creating or updating entries in `.docs/done/{yyyy-mm-dd}/{name}.md`.
- **TT**: Run `npm test` (or relevant test commands) and fix all failing tests.
- **TW**: Use the `chrome-devtools` MCP server to run and evaluate tests in the browser context.
- **CR**: Perform a code review using git to inspect uncommitted changes and suggest improvements for architecture, efficiency, maintainability, and security.
- **GC**: Commit all current changes using git with a clear and concise commit message.


## Requirement and Planning Rules

- For requirement work (including **REQ** or analysis), focus on **what** the system should do, not how to implement it or micro-optimizations.
- For large changes or when using **AP**, always create a plan first and get confirmation before heavy implementation.
- Use mermaid diagrams for complex structures, flows, or state transitions.
- Break large tasks into smaller sub-tasks with clear milestones and dependencies.
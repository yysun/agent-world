## File Comment Blocks
- Add/update comment blocks at the top of each source file summarizing features, implementation, and changes.
- Create before editing, if missing update after changes.

## Implementation Details
- Use function based approach instead of class based approach
- Always update relevant unit tests when making changes in `core`
- Use memory storage for unit tests unless specifically testing storage layer
- Use [apprun-prompt.md](prompts/apprun.prompt.md) as reference for the frontend in `web/`src

## Script Execution
- use `npm run test` to execute the test suite
- use `npm run check` to check syntax and linting
- use `npm run server` to start the server
- use `npm run dev` to start the frontend development


DO NOT run `npm run server` and then test it in same terminal. Always ask me to start server before testing.
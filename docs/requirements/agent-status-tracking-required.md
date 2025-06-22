# Agent Status Tracking Required for CLI

## Requirement
Agent status tracking is required for the CLI functionality, specifically for the `/use` and `/stop` commands.

## Details
- **CLI commands `/use` and `/stop`** depend on agent status tracking
- **Agent status** must be persisted and maintained across sessions
- **Status tracking in storage.ts** is required functionality, not unused
- **Agent activation/deactivation** must be tracked for proper CLI operation

## CLI Integration
From `cli/index.ts`, the system uses:
- `/use` command to activate agents
- `/stop` command to deactivate agents
- Status tracking determines which agents respond to messages

## Current CLI Usage Pattern
```typescript
// From cli/index.ts - commands use agent status
'/use and /stop commands now use agent.start() and agent.stop() methods'
```

## Impact on Simplification Plan
- **Step 6** must be modified to preserve agent status tracking
- **Do NOT remove** agent status tracking in storage
- **Keep** agent activation/deactivation functionality
- **Maintain** status persistence across CLI sessions

## Required Features to Preserve
- Agent status field in agent configuration
- Status persistence in storage operations
- Agent start/stop functionality
- CLI command integration with status tracking
- Status-based message filtering (active agents only)

## Rationale
- Essential for CLI user experience
- Allows selective agent activation/deactivation
- Prevents inactive agents from responding to messages
- Required for proper agent lifecycle management

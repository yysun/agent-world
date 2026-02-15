# Shell Command Tool (`shell_cmd`)

The `shell_cmd` tool lets agents execute shell commands with real-time streaming, lifecycle tracking, and strict working-directory safety.

## Parameters

`shell_cmd` accepts this payload shape:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `command` | `string` | Yes | Command name (for example `ls`, `cat`, `grep`) |
| `parameters` | `string[]` | No | Command arguments |
| `directory` | `string` | No | Optional model-provided target directory, validated against trusted world scope |
| `timeout` | `number` | No | Milliseconds, default `600000` (10 minutes) |

## Runtime Behavior

- Executes via shell process with stdout/stderr capture
- Publishes streaming chunks as `tool-stream` events (`stdout` / `stderr`)
- Returns structured result data including command, parameters, exit code, signal, error, timestamps, and duration
- Tracks lifecycle: `queued`, `starting`, `running`, `completed`, `failed`, `canceled`, `timed_out`
- Supports session/chat-scoped cancellation used by Web, Electron, and CLI stop flows

## Safety Model

`shell_cmd` is restricted to trusted runtime context:

- Working directory is resolved from trusted world/tool context (`working_directory` in world variables when set)
- If world `working_directory` is unset, runtime falls back to core default working directory (user home by default)
- Model-supplied `directory` is allowed only if it resolves inside trusted world scope; mismatches are rejected
- Command/path tokens are validated to block out-of-scope traversal patterns
- Inline eval modes (`sh -c`, `node -e`, `python -c`, `powershell -Command`) are rejected for safety

This keeps execution within world boundaries and prevents path-bypass patterns.

## Example Payloads

Simple listing:

```json
{
  "command": "ls",
  "parameters": ["-la", "./"]
}
```

With explicit timeout:

```json
{
  "command": "npm",
  "parameters": ["test", "--", "tests/core/events/"],
  "timeout": 900000
}
```

With model-provided directory (must match trusted scope):

```json
{
  "command": "pwd",
  "directory": "./"
}
```

## AI Command Behavior

For supported AI commands (`codex`, `gemini`, `copilot`):

- Successful runs can publish clean assistant output directly
- Failed runs include formatted error context
- Tool results are still preserved in tool-role history for traceability

## Common Rejection Cases

- Requested `directory` is outside trusted `working_directory`
- Path arguments resolve outside trusted scope
- Inline script/eval command patterns are used

Typical error shape includes a mismatch message that references trusted world working directory.

## See Also

- [HITL Approval Flow](hitl-approval-flow.md)
- [Electron Desktop App](electron-desktop.md)
- [Core npm Usage](core-npm-usage.md)

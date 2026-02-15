# Shell Command Tool (`shell_cmd`)

The `shell_cmd` tool lets agents execute user-requested shell commands with real-time streaming, lifecycle tracking, and strict working-directory safety.

## Parameters

`shell_cmd` accepts this payload shape:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `command` | `string` | Yes | Command name (for example `ls`, `cat`, `grep`) |
| `parameters` | `string[]` | No | Command arguments (one token per argument) |
| `directory` | `string` | No | Optional model-provided target directory, validated against trusted world scope |
| `timeout` | `number` | No | Milliseconds, default `600000` (10 minutes) |
| `output_format` | `"markdown" \| "json"` | No | Result format. Defaults to `markdown` |
| `output_detail` | `"minimal" \| "full"` | No | Detail level. Defaults to `minimal` |
| `artifact_paths` | `string[]` | No | Optional file paths (inside trusted scope) to include with hash metadata |

## Runtime Behavior

- Executes via shell process with stdout/stderr capture
- Executes in OS shell mode (`shell: true`) for command resolution and shell features
- Enforces single-command contract: `command` is executable-only, arguments go in `parameters`
- Publishes streaming chunks as `tool-stream` events (`stdout` / `stderr`)
- Returns minimum-necessary output by default (`output_detail: "minimal"`)
- Use `output_detail: "full"` only when full stdout/stderr content is explicitly needed
- Returns markdown output by default; `output_format: "json"` returns machine-readable schema
- Tracks lifecycle: `queued`, `starting`, `running`, `completed`, `failed`, `canceled`, `timed_out`
- Supports session/chat-scoped cancellation used by Web, Electron, and CLI stop flows

## Structured JSON Output

When `output_format` is set to `json`, the tool returns JSON like:

```json
{
  "exit_code": 0,
  "stdout": "...",
  "stderr": "...",
  "timed_out": false,
  "duration_ms": 1200,
  "artifacts": [
    {"path": "dist/app.js", "sha256": "...", "bytes": 12345}
  ]
}
```

`artifact_paths` values are resolved relative to trusted working directory unless absolute, and all are scope-validated before hashing.
In `minimal` mode, `stdout` and `stderr` fields contain bounded previews; `full` mode returns complete content.

## Safety Model

`shell_cmd` is restricted to trusted runtime context:

- Intended for explicit command execution requests from users (not general conversation)
- Working directory is resolved from trusted world/tool context (`working_directory` in world variables when set)
- If world `working_directory` is unset, runtime falls back to core default working directory (user home by default)
- Model-supplied `directory` is allowed only if it resolves inside trusted world scope; mismatches are rejected
- Command/path tokens are validated to block out-of-scope traversal patterns
- Shell control syntax is blocked (`&&`, `||`, pipes, redirects, command substitution, backgrounding)
- Inline eval modes (`sh -c`, `node -e`, `python -c`, `powershell -Command`) are rejected for safety
- Because commands run through a shell, untrusted command text must not be executed

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

Structured output with artifact metadata:

```json
{
  "command": "npm",
  "parameters": ["run", "build"],
  "output_format": "json",
  "output_detail": "minimal",
  "artifact_paths": ["dist/app.js"]
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
- Chaining/redirection/substitution/background operators are present
- Inline script/eval command patterns are used

Typical error shape includes a mismatch message that references trusted world working directory.

## See Also

- [HITL Approval Flow](hitl-approval-flow.md)
- [Electron Desktop App](electron-desktop.md)
- [Core npm Usage](core-npm-usage.md)

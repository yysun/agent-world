# Shell Command Tool (shell_cmd)

The `shell_cmd` tool is a built-in LLM tool that allows agents to execute shell commands with full output capture and execution history tracking.

## Features

- **Command Execution**: Execute any shell command with parameters
- **Output Capture**: Captures both stdout and stderr
- **Real-time Streaming**: Stream output in real-time as it's produced (optional)
- **Error Handling**: Gracefully handles command errors, timeouts, and exceptions
- **Execution History**: Maintains history of all command executions
- **Persistence**: Stores command, parameters, results, and exceptions
- **LLM Integration**: MCP-compatible interface for seamless LLM usage
- **Security**: No shell expansion for better security
- **Timeout Support**: Configurable timeouts to prevent hanging processes
- **Working Directory**: Execute commands in specific directories
- **Event System Integration**: Streaming events published to world event system for CLI/UI display
- **Backwards Compatible**: Streaming is optional and doesn't affect existing functionality

## Availability

The `shell_cmd` tool is automatically available to **all worlds** in Agent World. No MCP server configuration is required.

## Usage from LLM

When an LLM wants to execute a shell command, it can call the `shell_cmd` tool with the following parameters:

### Parameters

- **command** (required, string): The shell command to execute
  - Examples: `"ls"`, `"echo"`, `"cat"`, `"grep"`, `"pwd"`
  
- **parameters** (optional, array of strings): Arguments for the command
  - Examples: `["-la", "/tmp"]`, `["hello world"]`, `["-n", "3"]`
  
- **timeout** (optional, number): Timeout in milliseconds (default: 30000)
  - Example: `5000` (5 seconds)
  
- **cwd** (optional, string): Working directory for execution
  - Example: `"/tmp"`, `"/home/user/project"`

### Example LLM Tool Calls

```json
{
  "tool": "shell_cmd",
  "parameters": {
    "command": "ls",
    "parameters": ["-la", "/tmp"]
  }
}
```

```json
{
  "tool": "shell_cmd",
  "parameters": {
    "command": "echo",
    "parameters": ["Hello, World!"]
  }
}
```

```json
{
  "tool": "shell_cmd",
  "parameters": {
    "command": "find",
    "parameters": [".", "-name", "*.ts"],
    "timeout": 10000,
    "cwd": "/home/runner/project"
  }
}
```

## Output Format

The tool returns a formatted string containing:
- Command executed with parameters
- Execution timestamp
- Duration in milliseconds
- Exit code (or error message)
- Standard output
- Standard error (if any)

### Example Output

```
Command: ls -la /tmp
Executed at: 2025-11-03T14:20:00.000Z
Duration: 45ms
Exit code: 0

Standard Output:
total 20
drwxrwxrwt  5 root root 4096 Nov  3 14:19 .
drwxr-xr-x 20 root root 4096 Nov  3 10:00 ..
-rw-r--r--  1 user user  100 Nov  3 14:15 test.txt
```

### Error Output Example

```
Command: ls /nonexistent-directory
Executed at: 2025-11-03T14:20:00.000Z
Duration: 12ms
Error: Command exited with code 2

Standard Error:
ls: cannot access '/nonexistent-directory': No such file or directory
```

## Direct Usage (Programmatic)

### TypeScript/JavaScript

```typescript
// Import from agent-world package
import { executeShellCommand, getExecutionHistory } from 'agent-world';

// Or from core subpackage
// import { executeShellCommand, getExecutionHistory } from 'agent-world/core';

// Execute a command
const result = await executeShellCommand('ls', ['-la', '/tmp'], './');
console.log(result.stdout);
console.log(result.exitCode);

// Execute with options
const result2 = await executeShellCommand('pwd', [], './', {
  timeout: 5000
});

// Execute with streaming callbacks for real-time output
const result3 = await executeShellCommand('npm', ['install'], './', {
  onStdout: (chunk) => {
    // Display stdout in real-time
    process.stdout.write(chunk);
  },
  onStderr: (chunk) => {
    // Display stderr in real-time
    process.stderr.write(chunk);
  }
});

// Get execution history
const history = getExecutionHistory(10); // Get last 10 executions
for (const exec of history) {
  console.log(`${exec.command} - Exit code: ${exec.exitCode}`);
}
```

## Real-time Streaming Output

The shell command tool supports real-time streaming of command output through optional callbacks. This is useful for long-running commands where you want to see output as it's produced.

### Streaming Callbacks

When executing commands programmatically, you can provide callbacks to receive output in real-time:

```typescript
import { executeShellCommand } from 'agent-world';

await executeShellCommand('npm', ['test'], './', {
  onStdout: (chunk) => {
    // Called for each stdout chunk
    console.log('STDOUT:', chunk);
  },
  onStderr: (chunk) => {
    // Called for each stderr chunk
    console.error('STDERR:', chunk);
  }
});
```

**Key Features:**
- Callbacks are **optional** - existing code works without changes
- Complete output is still accumulated and returned in `CommandExecutionResult`
- Callbacks receive output chunks as they arrive from the child process
- Callback errors are caught and logged (won't break command execution)
- Full backwards compatibility with existing code

### World Event System Integration

When executed within a world context (e.g., by an LLM agent), streaming output is automatically published to the world event system using SSE events:

```typescript
{
  type: 'tool-stream',
  toolName: 'shell_cmd',
  content: 'output chunk',
  stream: 'stdout',  // or 'stderr'
  messageId: 'tool-call-id',
  agentName: 'shell_cmd'
}
```

### CLI Streaming Display

The CLI automatically displays streaming output in real-time when commands are executed:

- **stdout**: Displayed in gray
- **stderr**: Displayed in red
- Output appears immediately as it's produced by the command
- No need to wait for command completion to see output

This provides immediate feedback for long-running commands like builds, tests, or package installations.

## Execution History

All command executions are automatically persisted in memory. The system maintains:
- Command and parameters
- stdout and stderr output
- Exit code and signal
- Execution timestamp
- Duration
- Any errors or exceptions

### Retrieving History

```typescript
// Import from agent-world package
import { getExecutionHistory, clearExecutionHistory } from 'agent-world';

// Get last 50 executions
const history = getExecutionHistory(50);

// Clear history (useful for testing or memory management)
const clearedCount = clearExecutionHistory();
console.log(`Cleared ${clearedCount} entries`);
```

## Security Considerations

1. **No Shell Expansion**: Commands are executed without shell expansion for better security
2. **Timeout Protection**: Default 30-second timeout prevents hanging processes
3. **Resource Cleanup**: Processes are properly cleaned up on completion
4. **Error Isolation**: Errors are captured and returned, not thrown

## Best Practices

1. **Use Specific Commands**: Prefer specific commands like `ls` over `bash -c "ls"`
2. **Set Timeouts**: For long-running commands, set appropriate timeouts
3. **Check Exit Codes**: Always check the exit code to verify success
4. **Handle Errors**: Be prepared to handle command failures gracefully
5. **Limit Parameters**: Keep parameter lists reasonable for maintainability

## Common Use Cases

### Listing Files
```json
{
  "command": "ls",
  "parameters": ["-la"]
}
```

### Reading Files
```json
{
  "command": "cat",
  "parameters": ["/path/to/file.txt"]
}
```

### Searching Files
```json
{
  "command": "grep",
  "parameters": ["-r", "pattern", "/path/to/search"]
}
```

### Getting Current Directory
```json
{
  "command": "pwd",
  "parameters": []
}
```

### Creating Directories
```json
{
  "command": "mkdir",
  "parameters": ["-p", "/path/to/new/directory"]
}
```

## Limitations

1. **In-Memory Storage**: History is stored in memory and limited to 1000 entries
2. **No Interactive Commands**: Interactive commands that require user input are not supported
3. **Platform-Specific**: Command availability depends on the host system
4. **No Shell Features**: Piping, redirection, and other shell features must be implemented using explicit commands

## Testing

The tool includes comprehensive tests covering:
- Successful command execution
- Error handling
- Timeout behavior
- Parameter passing
- History management
- Integration scenarios

Run tests with:
```bash
npm test -- shell-cmd-tool.test.ts
```

## Implementation Details

- **Location**: `core/shell-cmd-tool.ts`
- **Tests**: `tests/core/shell-cmd-tool.test.ts`
- **Integration**: Automatically registered via `core/mcp-server-registry.ts`
- **Exports**: Available via `core/index.ts`

## Support

For issues or questions about the shell_cmd tool, please refer to the main Agent World documentation or open an issue on GitHub.

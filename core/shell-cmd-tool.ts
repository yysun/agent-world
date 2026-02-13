/**
 * Shell Command Tool Module - Built-in LLM tool for executing shell commands
 *
 * Features:
 * - Execute shell commands in child processes with parameter support
 * - Capture stdout and stderr output
 * - Persist command execution history (command, parameters, results, exceptions)
 * - Return results to LLM for further processing (except AI commands)
 * - AI command special handling (gemini, copilot, codex):
 *   * Full tool result saved as 'tool' role message
 *   * Exit code 0: Only stdout saved as 'assistant' message (clean output)
 *   * Exit code != 0: Full formatted result saved as 'assistant' message (includes stderr, errors)
 *   * No additional LLM call to process the output
 * - Error handling and exception tracking
 * - Long-running command support with 10-minute default timeout
 * - Required directory parameter for explicit working directory control
 * - LLM guidance to ask user for directory if not provided
 * - Graceful error handling for invalid tool calls
 * - Universal parameter validation for consistent execution
 * - Explicit execution safety configuration using structured metadata
 *
 * Implementation Details:
 * - Uses Node.js child_process.spawn for command execution
 * - Executes commands through shell for PATH resolution and shell features
 * - Stores execution history in-memory (can be extended to persistent storage)
 * - Provides MCP-compatible tool interface for LLM integration
 * - Timeout support to prevent hanging processes (default: 10 minutes)
 * - Resource cleanup on process completion
 * - Requires explicit directory parameter for security and clarity
 * - Tool description instructs LLM to ask user for directory if missing
 * - Returns error results instead of throwing to prevent agent crashes
 * - Uses universal validation framework for consistent parameter checking
 *
 * Recent Changes:
 * - 2026-02-13: Added explicit command-cancellation detection and AbortError propagation in tool execution to prevent post-stop continuation.
 * - 2026-02-13: Added chat-scoped shell process tracking and stop controls for Electron stop-message support.
 * - 2026-02-08: Added streaming callback support for real-time output
 *   * Added onStdout and onStderr callbacks to executeShellCommand options
 *   * Callbacks invoked in real-time as data arrives from child process
 *   * Maintains backwards compatibility - callbacks are optional
 *   * Full output still accumulated and returned in CommandExecutionResult
 * - 2026-02-06: Removed legacy manual tool-decision metadata
 * - 2025-11-11: CRITICAL FIX - Quote parameters for shell execution
 *   * Parameters with spaces/tabs/newlines now properly quoted before spawn
 *   * Prevents shell from splitting multi-word parameters
 *   * Fixes "unrecognized subcommand" errors with commands like "codex exec 'review the last commit'"
 *   * Applied to both execution AND display formatting
 * - 2025-11-11: AI commands (gemini, copilot, codex) bypass LLM:
 *   * Save full tool result as 'tool' message
 *   * Exit code 0: Save only stdout as 'assistant' message (clean output)
 *   * Exit code != 0: Save full formatted result as 'assistant' message (with errors)
 *   * Skip LLM processing entirely
 *   * Improved markdown formatting with headers, code blocks, and status icons
 * - 2025-11-10: Fixed shell execution - enabled shell: true to support PATH resolution and installed commands
 * - Integrated universal parameter validation for consistent tool execution
 * - Enhanced validation to check required parameters and auto-correct types
 * - Replaced custom validation with standardized validation framework
 * - Added graceful error handling for empty commands to prevent agent crashes
 * - Changed validation to return error results instead of throwing exceptions
 * - Updated tests to expect error results rather than thrown errors
 * - Added LLM guidance to ask user for directory when not provided
 * - Made directory parameter required for shell command execution
 * - Increased default timeout from 30s to 10 minutes (600000ms) for long-running commands
 * - Initial implementation for shell_cmd LLM tool
 */

import { spawn, type ChildProcess } from 'child_process';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { createCategoryLogger } from './logger.js';
import { validateToolParameters } from './tool-utils.js';
import { publishSSE } from './events/index.js';

const logger = createCategoryLogger('shell-cmd');

/**
 * Resolve directory path, handling tilde expansion and relative paths
 */
function resolveDirectory(directory: string): string {
  if (directory.startsWith('~/')) {
    return join(homedir(), directory.slice(2));
  }
  if (directory === '~') {
    return homedir();
  }
  return resolve(directory);
}

/**
 * Command execution result
 */
export interface CommandExecutionResult {
  command: string;
  parameters: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  error?: string;
  canceled?: boolean;
  executedAt: Date;
  duration: number; // milliseconds
}

/**
 * In-memory storage for command execution history
 * Can be extended to use persistent storage in the future
 */
const executionHistory: CommandExecutionResult[] = [];
const MAX_HISTORY_SIZE = 1000; // Limit history size to prevent memory issues
const activeProcessesByChat = new Map<string, Set<ChildProcess>>();

function toChatProcessKey(worldId: string, chatId: string): string {
  return `${worldId}::${chatId}`;
}

function registerActiveProcess(worldId: string, chatId: string, process: ChildProcess): () => void {
  const key = toChatProcessKey(worldId, chatId);
  const existing = activeProcessesByChat.get(key) ?? new Set<ChildProcess>();
  existing.add(process);
  activeProcessesByChat.set(key, existing);

  return () => {
    const processes = activeProcessesByChat.get(key);
    if (!processes) return;
    processes.delete(process);
    if (processes.size === 0) {
      activeProcessesByChat.delete(key);
    }
  };
}

export function stopShellCommandsForChat(worldId: string, chatId: string): { killed: number } {
  const key = toChatProcessKey(worldId, chatId);
  const processes = activeProcessesByChat.get(key);
  if (!processes || processes.size === 0) {
    return { killed: 0 };
  }

  let killed = 0;
  for (const process of processes) {
    if (process.killed) continue;
    try {
      process.kill('SIGTERM');
      killed += 1;
    } catch (error) {
      logger.warn('Failed to stop shell process', {
        worldId,
        chatId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { killed };
}

export function isCommandExecutionCanceled(result: CommandExecutionResult): boolean {
  if (result.canceled) return true;
  return result.error === 'Command execution canceled by user';
}

/**
 * Execute a shell command with parameters and capture output
 * 
 * @param command - The shell command to execute (e.g., 'ls', 'echo', 'cat')
 * @param parameters - Array of parameters for the command (e.g., ['-la', '/tmp'])
 * @param directory - Working directory for command execution (required)
 * @param options - Execution options
 * @returns Promise<CommandExecutionResult> - Execution result with output and metadata
 */
export async function executeShellCommand(
  command: string,
  parameters: string[] = [],
  directory: string,
  options: {
    timeout?: number; // Timeout in milliseconds (default: 600000 = 10 minutes)
    onStdout?: (data: string) => void; // Real-time stdout callback
    onStderr?: (data: string) => void; // Real-time stderr callback
    abortSignal?: AbortSignal;
    worldId?: string;
    chatId?: string;
  } = {}
): Promise<CommandExecutionResult> {
  const startTime = Date.now();
  const timeout = options.timeout || 600000; // Default 10 minute timeout for long-running commands
  const resolvedDirectory = resolveDirectory(directory);

  logger.debug('Executing shell command', {
    command,
    parameters,
    timeout,
    directory,
    resolvedDirectory
  });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let processExited = false;
    let unregisterProcess: (() => void) | null = null;

    const result: CommandExecutionResult = {
      command,
      parameters,
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: null,
      executedAt: new Date(),
      duration: 0
    };

    try {
      // Quote parameters that contain spaces, tabs, or newlines for shell execution
      const quotedParams = parameters.map(param => {
        if (param.includes(' ') || param.includes('\t') || param.includes('\n') || param.includes('"')) {
          // Escape existing quotes and wrap in quotes
          return `"${param.replace(/"/g, '\\"')}"`;
        }
        return param;
      });

      // Spawn the child process
      const childProcess = spawn(command, quotedParams, {
        cwd: resolvedDirectory,
        shell: true, // Use shell to enable PATH resolution and shell features
        timeout: timeout
      });

      if (options.worldId && options.chatId) {
        unregisterProcess = registerActiveProcess(options.worldId, options.chatId, childProcess);
      }

      // Set up timeout handler
      const timeoutHandle = setTimeout(() => {
        if (!processExited) {
          timedOut = true;
          childProcess.kill('SIGTERM');
          logger.warn('Command execution timeout', { command, parameters, timeout, directory });
        }
      }, timeout);

      const abortHandler = () => {
        if (processExited) return;
        aborted = true;
        childProcess.kill('SIGTERM');
        logger.info('Shell command aborted by request', {
          command,
          parameters,
          directory,
          worldId: options.worldId || null,
          chatId: options.chatId || null
        });
      };
      options.abortSignal?.addEventListener('abort', abortHandler, { once: true });

      // Capture stdout with optional streaming
      childProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        // Call streaming callback if provided (with error handling)
        if (options.onStdout) {
          try {
            options.onStdout(chunk);
          } catch (error) {
            logger.warn('Error in stdout streaming callback', {
              error: error instanceof Error ? error.message : error
            });
          }
        }
      });

      // Capture stderr with optional streaming
      childProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        
        // Call streaming callback if provided (with error handling)
        if (options.onStderr) {
          try {
            options.onStderr(chunk);
          } catch (error) {
            logger.warn('Error in stderr streaming callback', {
              error: error instanceof Error ? error.message : error
            });
          }
        }
      });

      // Handle process exit
      childProcess.on('close', (code, signal) => {
        processExited = true;
        clearTimeout(timeoutHandle);
        options.abortSignal?.removeEventListener('abort', abortHandler);
        unregisterProcess?.();
        unregisterProcess = null;

        const duration = Date.now() - startTime;

        result.stdout = stdout;
        result.stderr = stderr;
        result.exitCode = code;
        result.signal = signal;
        result.duration = duration;

        if (timedOut) {
          result.error = `Command execution timed out after ${timeout}ms`;
        } else if (aborted) {
          result.error = 'Command execution canceled by user';
          result.canceled = true;
        } else if (code !== 0) {
          result.error = `Command exited with code ${code}`;
        }

        // Persist to history
        persistExecutionResult(result);

        logger.debug('Command execution completed', {
          command,
          parameters,
          directory,
          exitCode: code,
          signal,
          duration,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
          error: result.error
        });

        resolve(result);
      });

      // Handle process errors
      childProcess.on('error', (error) => {
        processExited = true;
        clearTimeout(timeoutHandle);
        options.abortSignal?.removeEventListener('abort', abortHandler);
        unregisterProcess?.();
        unregisterProcess = null;

        const duration = Date.now() - startTime;

        result.stdout = stdout;
        result.stderr = stderr;
        result.duration = duration;
        result.error = error.message;

        // Persist to history
        persistExecutionResult(result);

        logger.warn('Command execution error', {
          command,
          parameters,
          directory,
          error: error.message,
          duration: Date.now() - startTime
        }); resolve(result);
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      unregisterProcess?.();
      unregisterProcess = null;

      result.duration = duration;
      result.error = error instanceof Error ? error.message : String(error);

      // Persist to history
      persistExecutionResult(result);

      logger.warn('Failed to spawn command', {
        command,
        parameters,
        directory,
        error: result.error,
        duration
      });

      resolve(result);
    }
  });
}

/**
 * Persist command execution result to history
 * Maintains a maximum history size to prevent memory issues
 * 
 * @param result - Command execution result to persist
 */
function persistExecutionResult(result: CommandExecutionResult): void {
  executionHistory.push(result);

  // Trim history if it exceeds max size
  if (executionHistory.length > MAX_HISTORY_SIZE) {
    const removeCount = executionHistory.length - MAX_HISTORY_SIZE;
    executionHistory.splice(0, removeCount);
    logger.debug('Trimmed execution history', {
      removedCount: removeCount,
      currentSize: executionHistory.length
    });
  }

  logger.trace('Persisted execution result', {
    command: result.command,
    parameters: result.parameters,
    historySize: executionHistory.length
  });
}

/**
 * Get command execution history
 * 
 * @param limit - Maximum number of results to return (default: 100)
 * @returns Array of command execution results, most recent first
 */
export function getExecutionHistory(limit: number = 100): CommandExecutionResult[] {
  const limitedHistory = executionHistory.slice(-limit).reverse();
  logger.debug('Retrieved execution history', {
    requestedLimit: limit,
    returnedCount: limitedHistory.length,
    totalHistorySize: executionHistory.length
  });
  return limitedHistory;
}

/**
 * Clear execution history
 * Useful for testing or memory management
 * 
 * @returns Number of entries cleared
 */
export function clearExecutionHistory(): number {
  const count = executionHistory.length;
  executionHistory.length = 0;
  logger.info('Cleared execution history', { clearedCount: count });
  return count;
}

/**
 * Format command execution result for LLM consumption
 * Provides a human-readable summary of the execution with improved markdown formatting
 * 
 * @param result - Command execution result
 * @returns Formatted markdown string suitable for LLM and display
 */
export function formatResultForLLM(result: CommandExecutionResult): string {
  const parts: string[] = [];

  // Command info section
  parts.push('### Command Execution');
  parts.push('');
  // Quote parameters that contain spaces or special characters
  const quotedParams = result.parameters.map(param => {
    if (param.includes(' ') || param.includes('\t') || param.includes('\n')) {
      return `"${param.replace(/"/g, '\\"')}"`;
    }
    return param;
  });
  parts.push(`**Command:** \`${result.command} ${quotedParams.join(' ')}\``);
  parts.push(`**Duration:** ${result.duration}ms`);
  parts.push(`**Executed at:** ${result.executedAt.toISOString()}`);

  if (result.error) {
    parts.push(`**Status:** ❌ Error`);
    parts.push(`**Error:** ${result.error}`);
  } else {
    parts.push(`**Status:** ${result.exitCode === 0 ? '✅' : '⚠️'} Exit code ${result.exitCode}`);
  }

  // Standard output section
  if (result.stdout) {
    parts.push('');
    parts.push('### Standard Output');
    parts.push('');
    parts.push('```');
    parts.push(result.stdout);
    parts.push('```');
  }

  // Standard error section (only show if there's content)
  if (result.stderr) {
    parts.push('');
    parts.push('### Standard Error');
    parts.push('');
    parts.push('```');
    parts.push(result.stderr);
    parts.push('```');
  }

  // No output case
  if (!result.stdout && !result.stderr && !result.error) {
    parts.push('');
    parts.push('*(No output)*');
  }

  return parts.join('\n');
}

/**
 * Create MCP-compatible tool definition for shell_cmd
 * This tool can be registered with the MCP system for LLM use
 * 
 * @returns MCP tool definition object
 */
export function createShellCmdToolDefinition() {
  return {
    description: 'Execute a shell command with parameters and capture output. Use this tool to run system commands, scripts, or utilities. The command output, errors, and execution metadata are persisted for tracking. CRITICAL: This tool REQUIRES a "directory" parameter. If user says "current directory" or "here", use "./". If user specifies a path, use that. Only ask for clarification if the location is truly ambiguous.',

    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute (e.g., "ls", "echo", "cat", "grep")'
        },
        parameters: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of parameters/arguments for the command (e.g., ["-la", "/tmp"])'
        },
        directory: {
          type: 'string',
          description: 'REQUIRED: Working directory where the command should be executed. Use "./" for current directory when user says "current", "here", or "this directory". Use "~/" for home directory. Use specified path if provided. Only ask for clarification if truly ambiguous. Examples: "./", "~/", "/tmp", "./src"'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 600000 = 10 minutes). Command will be terminated if it exceeds this time.'
        }
      },
      required: ['command', 'directory'],
      additionalProperties: false
    },
    execute: async (args: any, sequenceId?: string, parentToolCall?: string, context?: any) => {
      // Universal parameter validation
      const toolSchema = {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute (e.g., "ls", "echo", "cat", "grep")'
          },
          parameters: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of parameters/arguments for the command (e.g., ["-la", "/tmp"])'
          },
          directory: {
            type: 'string',
            description: 'REQUIRED: Working directory where the command should be executed. Use "./" for current directory when user says "current", "here", or "this directory". Use "~/" for home directory. Use specified path if provided. Only ask for clarification if truly ambiguous. Examples: "./", "~/", "/tmp", "./src"'
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 600000 = 10 minutes). Command will be terminated if it exceeds this time.'
          }
        },
        required: ['command', 'directory']
      };

      const validation = validateToolParameters(args, toolSchema, 'shell_cmd');
      if (!validation.valid) {
        return formatResultForLLM({
          command: args?.command || '<invalid>',
          parameters: [],
          exitCode: 1,
          signal: null,
          error: validation.error,
          stdout: '',
          stderr: '',
          executedAt: new Date(),
          duration: 0
        });
      }

      const { command, parameters = [], directory, timeout } = validation.correctedArgs;

      // Ensure parameters is always an array
      const validParameters = Array.isArray(parameters) ?
        parameters.filter((p: any) => typeof p === 'string') :
        [];

      // Extract world and messageId from context for streaming
      const world = context?.world;
      const currentMessageId = context?.toolCallId;
      const chatId = context?.chatId ? String(context.chatId) : undefined;
      const abortSignal = context?.abortSignal as AbortSignal | undefined;

      // Execute command with streaming callbacks if world is available
      const result = await executeShellCommand(command, validParameters, directory, {
        timeout,
        abortSignal,
        worldId: world?.id,
        chatId,
        onStdout: world ? (chunk) => {
          // Publish streaming events to world event system
          publishSSE(world, {
            type: 'tool-stream',
            toolName: 'shell_cmd',
            content: chunk,
            stream: 'stdout',
            messageId: currentMessageId,
            agentName: 'shell_cmd'
          });
        } : undefined,
        onStderr: world ? (chunk) => {
          // Publish streaming events to world event system
          publishSSE(world, {
            type: 'tool-stream',
            toolName: 'shell_cmd',
            content: chunk,
            stream: 'stderr',
            messageId: currentMessageId,
            agentName: 'shell_cmd'
          });
        } : undefined
      });

      if (isCommandExecutionCanceled(result)) {
        throw new DOMException('Shell command execution canceled by user', 'AbortError');
      }

      // Return formatted result for LLM
      return formatResultForLLM(result);
    }
  };
}

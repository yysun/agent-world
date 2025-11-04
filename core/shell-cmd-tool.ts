/**
 * Shell Command Tool Module - Built-in LLM tool for executing shell commands
 *
 * Features:
 * - Execute shell commands in child processes with parameter support
 * - Capture stdout and stderr output
 * - Persist command execution history (command, parameters, results, exceptions)
 * - Return results to LLM for further processing
 * - Error handling and exception tracking
 * - Long-running command support with 10-minute default timeout
 * - Required directory parameter for explicit working directory control
 * - LLM guidance to ask user for directory if not provided
 * - Graceful error handling for invalid tool calls
 * - Universal parameter validation for consistent execution
 *
 * Implementation Details:
 * - Uses Node.js child_process.spawn for command execution
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

import { spawn } from 'child_process';
import { createCategoryLogger } from './logger.js';
import { validateToolParameters } from './tool-utils.js';

const logger = createCategoryLogger('shell-cmd');

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
  executedAt: Date;
  duration: number; // milliseconds
}

/**
 * In-memory storage for command execution history
 * Can be extended to use persistent storage in the future
 */
const executionHistory: CommandExecutionResult[] = [];
const MAX_HISTORY_SIZE = 1000; // Limit history size to prevent memory issues

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
  } = {}
): Promise<CommandExecutionResult> {
  const startTime = Date.now();
  const timeout = options.timeout || 600000; // Default 10 minute timeout for long-running commands

  logger.debug('Executing shell command', {
    command,
    parameters,
    timeout,
    directory
  });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let processExited = false;

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
      // Spawn the child process
      const childProcess = spawn(command, parameters, {
        cwd: directory,
        shell: false, // Don't use shell for better security
        timeout: timeout
      });

      // Set up timeout handler
      const timeoutHandle = setTimeout(() => {
        if (!processExited) {
          timedOut = true;
          childProcess.kill('SIGTERM');
          logger.warn('Command execution timeout', { command, parameters, timeout });
        }
      }, timeout);

      // Capture stdout
      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Capture stderr
      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process exit
      childProcess.on('close', (code, signal) => {
        processExited = true;
        clearTimeout(timeoutHandle);

        const duration = Date.now() - startTime;

        result.stdout = stdout;
        result.stderr = stderr;
        result.exitCode = code;
        result.signal = signal;
        result.duration = duration;

        if (timedOut) {
          result.error = `Command execution timed out after ${timeout}ms`;
        } else if (code !== 0) {
          result.error = `Command exited with code ${code}`;
        }

        // Persist to history
        persistExecutionResult(result);

        logger.debug('Command execution completed', {
          command,
          parameters,
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

        const duration = Date.now() - startTime;

        result.stdout = stdout;
        result.stderr = stderr;
        result.duration = duration;
        result.error = error.message;

        // Persist to history
        persistExecutionResult(result);

        logger.error('Command execution error', {
          command,
          parameters,
          error: error.message,
          duration
        });

        resolve(result);
      });

    } catch (error) {
      const duration = Date.now() - startTime;

      result.duration = duration;
      result.error = error instanceof Error ? error.message : String(error);

      // Persist to history
      persistExecutionResult(result);

      logger.error('Failed to spawn command', {
        command,
        parameters,
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
 * Provides a human-readable summary of the execution
 * 
 * @param result - Command execution result
 * @returns Formatted string suitable for LLM
 */
export function formatResultForLLM(result: CommandExecutionResult): string {
  const parts: string[] = [];

  parts.push(`Command: ${result.command} ${result.parameters.join(' ')}`);
  parts.push(`Executed at: ${result.executedAt.toISOString()}`);
  parts.push(`Duration: ${result.duration}ms`);

  if (result.error) {
    parts.push(`Error: ${result.error}`);
  } else {
    parts.push(`Exit code: ${result.exitCode}`);
  }

  if (result.stdout) {
    parts.push(`\nStandard Output:\n${result.stdout}`);
  }

  if (result.stderr) {
    parts.push(`\nStandard Error:\n${result.stderr}`);
  }

  if (!result.stdout && !result.stderr && !result.error) {
    parts.push(`\n(No output)`);
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
    execute: async (args: any) => {
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

      // Execute command
      const result = await executeShellCommand(command, validParameters, directory, {
        timeout
      });

      // Return formatted result for LLM
      return formatResultForLLM(result);
    }
  };
}

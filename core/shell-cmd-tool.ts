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
 * - Trusted working-directory enforcement from world/tool context
 * - Explicit rejection when LLM-supplied directory conflicts with trusted working directory
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
 * - Resolves command cwd from trusted world/tool context, not LLM args
 * - Rejects directory mismatch instead of silently overriding requested path
 * - Returns error results instead of throwing to prevent agent crashes
 * - Uses universal validation framework for consistent parameter checking
 *
 * Recent Changes:
 * - 2026-02-14: Default trusted cwd now falls back to shared core default working directory (user home by default) instead of `./` when world variable is unset.
 * - 2026-02-14: Added inline-script execution guard (e.g. `sh -c`, `node -e`) to prevent embedded path bypass outside trusted cwd.
 * - 2026-02-14: Hardened cwd containment checks by canonicalizing absolute paths and validating additional path argument forms (`./`, `../`, and `--flag=/path`).
 * - 2026-02-13: Updated directory-request validation to allow requested folders inside world working_directory and reject only outside paths.
 * - 2026-02-13: Added command/parameter path scope validation so shell_cmd rejects path targets outside trusted world working_directory.
 * - 2026-02-13: Added strict directory-mismatch guard for shell_cmd; mismatched LLM directory requests now fail with explicit error.
 * - 2026-02-13: Fixed validation error result typing by including `executionId` when formatting failed shell_cmd calls.
 * - 2026-02-13: Stopped trusting LLM-provided `directory`; shell commands now resolve working directory from trusted world/tool context only.
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
import { realpathSync } from 'fs';
import { createCategoryLogger } from './logger.js';
import { validateToolParameters } from './tool-utils.js';
import { publishSSE } from './events/index.js';
import { getDefaultWorkingDirectory, getEnvValueFromText } from './utils.js';
import {
  createShellProcessExecution,
  transitionShellProcessExecution,
  attachShellProcessHandle,
  markShellProcessCancelRequested,
  listShellProcessExecutions,
  getShellProcessExecution,
  cancelShellProcessExecution,
  deleteShellProcessExecution,
  stopShellProcessesForChatScope,
  subscribeShellProcessStatus,
  clearShellProcessRegistryForTests,
  type ShellProcessExecutionRecord,
  type ShellProcessStatusEvent,
  type ListShellProcessExecutionsOptions,
  type CancelShellProcessResult,
  type DeleteShellProcessResult
} from './shell-process-registry.js';

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
  executionId: string;
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

export function resolveTrustedShellWorkingDirectory(context?: {
  world?: { variables?: string };
  workingDirectory?: string;
}): string {
  const contextDirectory = typeof context?.workingDirectory === 'string'
    ? context.workingDirectory.trim()
    : '';
  if (contextDirectory) {
    return contextDirectory;
  }

  const worldDirectory = getEnvValueFromText(context?.world?.variables, 'working_directory');
  const trimmedWorldDirectory = typeof worldDirectory === 'string' ? worldDirectory.trim() : '';
  return trimmedWorldDirectory || getDefaultWorkingDirectory();
}

export function validateShellDirectoryRequest(
  requestedDirectory: unknown,
  trustedWorkingDirectory: string
): { valid: true } | { valid: false; error: string } {
  if (typeof requestedDirectory !== 'string') {
    return { valid: true };
  }

  const requested = requestedDirectory.trim();
  if (!requested) {
    return { valid: true };
  }

  const trusted = String(trustedWorkingDirectory || '').trim() || getDefaultWorkingDirectory();
  if (isPathWithinTrustedDirectory(requested, trusted)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Working directory mismatch: requested directory "${requested}" is outside world working directory "${trusted}". Update world working_directory first.`
  };
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function trimTrailingSeparators(pathValue: string): string {
  const root = getPathRoot(pathValue);
  if (!root || pathValue === root) {
    return pathValue;
  }

  let trimmed = pathValue;
  while (trimmed.endsWith('/') || trimmed.endsWith('\\')) {
    trimmed = trimmed.slice(0, -1);
    if (trimmed === root) {
      return trimmed;
    }
  }

  return trimmed;
}

function getPathRoot(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/');
  const driveMatch = normalized.match(/^[A-Za-z]:\//);
  if (driveMatch) {
    return driveMatch[0];
  }
  if (normalized.startsWith('/')) {
    return '/';
  }
  return '';
}

function collapseDotSegments(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/');
  const root = getPathRoot(normalized);
  const segments = normalized.slice(root.length).split('/');
  const collapsed: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (collapsed.length > 0 && collapsed[collapsed.length - 1] !== '..') {
        collapsed.pop();
      } else if (!root) {
        collapsed.push('..');
      }
      continue;
    }
    collapsed.push(segment);
  }

  const joined = collapsed.join('/');
  if (root) {
    return `${root}${joined}` || root;
  }
  return joined || '.';
}

function canonicalizePath(pathValue: string): string {
  const absolute = resolveDirectory(pathValue);
  try {
    const canonical = realpathSync.native ? realpathSync.native(absolute) : realpathSync(absolute);
    return trimTrailingSeparators(collapseDotSegments(canonical));
  } catch {
    return trimTrailingSeparators(collapseDotSegments(absolute));
  }
}

function normalizeForPlatformComparison(pathValue: string): string {
  return process.platform === 'win32' ? pathValue.toLowerCase() : pathValue;
}

function isPathWithinTrustedDirectory(candidatePath: string, trustedWorkingDirectory: string): boolean {
  const normalizedCandidate = normalizeForPlatformComparison(canonicalizePath(candidatePath));
  const normalizedTrusted = normalizeForPlatformComparison(canonicalizePath(trustedWorkingDirectory));
  const trustedRoot = normalizeForPlatformComparison(getPathRoot(normalizedTrusted));

  if (normalizedTrusted === trustedRoot) {
    return normalizedCandidate.startsWith(normalizedTrusted);
  }

  return normalizedCandidate === normalizedTrusted ||
    normalizedCandidate.startsWith(`${normalizedTrusted}/`);
}

function looksLikePathToken(token: string): boolean {
  if (!token) return false;
  return token === '~' ||
    token === '.' ||
    token.startsWith('~/') ||
    token.startsWith('~\\') ||
    token.startsWith('/') ||
    token.startsWith('\\') ||
    token.startsWith('./') ||
    token.startsWith('.\\') ||
    token === '..' ||
    token.startsWith('../') ||
    token.startsWith('..\\') ||
    token.includes('/') ||
    token.includes('\\');
}

function resolveTokenPath(token: string, trustedWorkingDirectory: string): string {
  if (token.startsWith('~')) {
    return resolveDirectory(token);
  }
  if (token.startsWith('/')) {
    return resolveDirectory(token);
  }
  return resolveDirectory(resolve(trustedWorkingDirectory, token));
}

function extractPathTokenFromOptionPrefix(token: string): string | null {
  if (!token.startsWith('-') || token.includes('=')) {
    return null;
  }

  const pathStart = token.search(/(~|\/|\\|\.|[A-Za-z]:[\\/])/);
  if (pathStart <= 1) {
    return null;
  }

  const optionPart = token.slice(0, pathStart);
  const candidate = token.slice(pathStart);
  if (!/^-{1,2}[A-Za-z][A-Za-z0-9_-]*$/.test(optionPart)) {
    return null;
  }
  if (!looksLikePathToken(candidate)) {
    return null;
  }
  return candidate;
}

function extractPathTokenFromOptionAssignment(token: string): string | null {
  if (!token.startsWith('-')) {
    return null;
  }

  const equalsIndex = token.indexOf('=');
  if (equalsIndex <= 0) {
    return null;
  }

  const assignedValue = stripWrappingQuotes(token.slice(equalsIndex + 1));
  if (!assignedValue || !looksLikePathToken(assignedValue)) {
    return null;
  }

  return assignedValue;
}

function extractPathToken(rawToken: string): string | null {
  const token = stripWrappingQuotes(rawToken);
  if (!token) {
    return null;
  }

  const fromAssignment = extractPathTokenFromOptionAssignment(token);
  if (fromAssignment) {
    return fromAssignment;
  }
  const fromOptionPrefix = extractPathTokenFromOptionPrefix(token);
  if (fromOptionPrefix) {
    return fromOptionPrefix;
  }

  if (token.startsWith('-')) {
    return null;
  }

  return looksLikePathToken(token) ? token : null;
}

function tokenizeInlineCommandArgs(command: string): string[] {
  const tokens = command.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\s]+/g) ?? [];
  if (tokens.length <= 1) return [];
  return tokens.slice(1);
}

function tokenizeCommand(command: string): string[] {
  return command.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\s]+/g) ?? [];
}

function getExecutableName(command: string): string {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) return '';
  const executable = stripWrappingQuotes(tokens[0]).replace(/\\/g, '/');
  const parts = executable.split('/').filter(Boolean);
  return String(parts[parts.length - 1] || executable).toLowerCase();
}

function getInterpreterInlineScriptFlags(executable: string): Set<string> {
  if (['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'cmd', 'cmd.exe'].includes(executable)) {
    return new Set(['-c', '/c', '/k']);
  }
  if (['powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'].includes(executable)) {
    return new Set(['-c', '-command']);
  }
  if (['node', 'node.exe', 'deno', 'python', 'python3', 'python.exe', 'python3.exe'].includes(executable)) {
    return new Set(['-c', '-e', '--eval']);
  }
  if (['perl', 'ruby', 'php'].includes(executable)) {
    return new Set(['-e', '-r']);
  }
  return new Set();
}

function findInlineScriptExecutionFlag(
  command: unknown,
  parameters: unknown
): { executable: string; flag: string } | null {
  if (typeof command !== 'string' || !command.trim()) {
    return null;
  }

  const commandTokens = tokenizeCommand(command).map(stripWrappingQuotes).filter(Boolean);
  const commandArgs = commandTokens.slice(1);
  const parameterArgs = Array.isArray(parameters)
    ? parameters.filter((p): p is string => typeof p === 'string').map(stripWrappingQuotes).filter(Boolean)
    : [];

  const directExecutable = getExecutableName(command);
  let executable = directExecutable;
  let args = [...commandArgs, ...parameterArgs];

  // Handle wrappers like `env bash -c ...`
  if (directExecutable === 'env') {
    const envArgs = [...args];
    while (envArgs.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(envArgs[0])) {
      envArgs.shift();
    }
    if (envArgs.length > 0) {
      executable = getExecutableName(envArgs[0]);
      args = envArgs.slice(1);
    }
  }

  const scriptFlags = getInterpreterInlineScriptFlags(executable);
  if (scriptFlags.size === 0) {
    return null;
  }

  for (const rawArg of args) {
    const arg = rawArg.toLowerCase();
    if (scriptFlags.has(arg)) {
      return { executable, flag: rawArg };
    }
    for (const scriptFlag of scriptFlags) {
      if ((scriptFlag.startsWith('-') || scriptFlag.startsWith('/')) &&
          arg.startsWith(scriptFlag) &&
          arg.length > scriptFlag.length) {
        return { executable, flag: rawArg };
      }
    }
  }

  return null;
}

export function validateShellCommandScope(
  command: unknown,
  parameters: unknown,
  trustedWorkingDirectory: string
): { valid: true } | { valid: false; error: string } {
  const inlineScriptUsage = findInlineScriptExecutionFlag(command, parameters);
  if (inlineScriptUsage) {
    return {
      valid: false,
      error: `Working directory mismatch: inline script execution "${inlineScriptUsage.executable} ${inlineScriptUsage.flag}" is not allowed. Use direct command + parameters inside world working directory "${trustedWorkingDirectory}".`
    };
  }

  const tokens: string[] = [];

  if (typeof command === 'string' && command.trim()) {
    tokens.push(...tokenizeInlineCommandArgs(command));
  }

  if (Array.isArray(parameters)) {
    for (const parameter of parameters) {
      if (typeof parameter === 'string') {
        tokens.push(parameter);
      }
    }
  }

  for (const rawToken of tokens) {
    const token = extractPathToken(rawToken);
    if (!token) continue;

    const resolvedPath = resolveTokenPath(token, trustedWorkingDirectory);
    if (!isPathWithinTrustedDirectory(resolvedPath, trustedWorkingDirectory)) {
      return {
        valid: false,
        error: `Working directory mismatch: path "${token}" is outside world working directory "${trustedWorkingDirectory}".`
      };
    }
  }

  return { valid: true };
}

export function stopShellCommandsForChat(worldId: string, chatId: string): { killed: number } {
  return stopShellProcessesForChatScope(worldId, chatId);
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
    onStatusChange?: (event: ShellProcessStatusEvent) => void;
  } = {}
): Promise<CommandExecutionResult> {
  const startTime = Date.now();
  const timeout = options.timeout || 600000; // Default 10 minute timeout for long-running commands
  const resolvedDirectory = resolveDirectory(directory);
  const executionRecord = createShellProcessExecution({
    command,
    parameters,
    directory: resolvedDirectory,
    worldId: options.worldId,
    chatId: options.chatId
  });
  const executionId = executionRecord.executionId;
  options.onStatusChange?.({
    executionId,
    status: executionRecord.status,
    record: executionRecord
  });

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
    let unsubscribeStatusListener: (() => void) | null = null;

    const result: CommandExecutionResult = {
      executionId,
      command,
      parameters,
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: null,
      executedAt: new Date(),
      duration: 0
    };

    if (options.onStatusChange) {
      unsubscribeStatusListener = subscribeShellProcessStatus((event) => {
        if (event.executionId !== executionId) return;
        options.onStatusChange?.(event);
      });
    }

    try {
      // Quote parameters that contain spaces, tabs, or newlines for shell execution
      const quotedParams = parameters.map(param => {
        if (param.includes(' ') || param.includes('\t') || param.includes('\n') || param.includes('"')) {
          // Escape existing quotes and wrap in quotes
          return `"${param.replace(/"/g, '\\"')}"`;
        }
        return param;
      });

      transitionShellProcessExecution(executionId, 'starting', {
        startedAt: new Date().toISOString()
      });

      // Spawn the child process
      const childProcess = spawn(command, quotedParams, {
        cwd: resolvedDirectory,
        shell: true, // Use shell to enable PATH resolution and shell features
        timeout: timeout
      });
      attachShellProcessHandle(executionId, childProcess);
      transitionShellProcessExecution(executionId, 'running', {
        startedAt: new Date().toISOString()
      });

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
        markShellProcessCancelRequested(executionId);
        childProcess.kill('SIGTERM');
        logger.info('Shell command aborted by request', {
          executionId,
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
        unsubscribeStatusListener?.();
        unsubscribeStatusListener = null;

        const duration = Date.now() - startTime;

        result.stdout = stdout;
        result.stderr = stderr;
        result.exitCode = code;
        result.signal = signal;
        result.duration = duration;

        const latestRecord = getShellProcessExecution(executionId);
        const canceledByControlRequest = Boolean(latestRecord?.cancelRequested);

        if (timedOut) {
          result.error = `Command execution timed out after ${timeout}ms`;
          transitionShellProcessExecution(executionId, 'timed_out', {
            finishedAt: new Date().toISOString(),
            exitCode: code,
            signal,
            stdoutLength: stdout.length,
            stderrLength: stderr.length,
            error: result.error,
            durationMs: duration
          });
        } else if (aborted || canceledByControlRequest) {
          result.error = 'Command execution canceled by user';
          result.canceled = true;
          transitionShellProcessExecution(executionId, 'canceled', {
            finishedAt: new Date().toISOString(),
            exitCode: code,
            signal,
            stdoutLength: stdout.length,
            stderrLength: stderr.length,
            error: result.error,
            durationMs: duration
          });
        } else if (code !== 0) {
          result.error = `Command exited with code ${code}`;
          transitionShellProcessExecution(executionId, 'failed', {
            finishedAt: new Date().toISOString(),
            exitCode: code,
            signal,
            stdoutLength: stdout.length,
            stderrLength: stderr.length,
            error: result.error,
            durationMs: duration
          });
        } else {
          transitionShellProcessExecution(executionId, 'completed', {
            finishedAt: new Date().toISOString(),
            exitCode: code,
            signal,
            stdoutLength: stdout.length,
            stderrLength: stderr.length,
            durationMs: duration,
            error: null
          });
        }

        // Persist to history
        persistExecutionResult(result);

        logger.debug('Command execution completed', {
          command,
          executionId,
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
        unsubscribeStatusListener?.();
        unsubscribeStatusListener = null;

        const duration = Date.now() - startTime;

        result.stdout = stdout;
        result.stderr = stderr;
        result.duration = duration;
        result.error = error.message;

        transitionShellProcessExecution(executionId, 'failed', {
          finishedAt: new Date().toISOString(),
          exitCode: null,
          signal: null,
          stdoutLength: stdout.length,
          stderrLength: stderr.length,
          error: result.error,
          durationMs: duration
        });

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
      unsubscribeStatusListener?.();
      unsubscribeStatusListener = null;

      result.duration = duration;
      result.error = error instanceof Error ? error.message : String(error);

      transitionShellProcessExecution(executionId, 'failed', {
        finishedAt: new Date().toISOString(),
        exitCode: null,
        signal: null,
        stdoutLength: stdout.length,
        stderrLength: stderr.length,
        error: result.error,
        durationMs: duration
      });

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

export interface DeleteExecutionHistoryResult {
  executionId: string;
  outcome: DeleteShellProcessResult['outcome'];
  removedHistoryEntries: number;
}

export function getProcessExecution(executionId: string): ShellProcessExecutionRecord | null {
  return getShellProcessExecution(executionId);
}

export function listProcessExecutions(
  options: ListShellProcessExecutionsOptions = {}
): ShellProcessExecutionRecord[] {
  return listShellProcessExecutions(options);
}

export function cancelProcessExecution(executionId: string): CancelShellProcessResult {
  return cancelShellProcessExecution(executionId);
}

export function deleteProcessExecution(executionId: string): DeleteExecutionHistoryResult {
  const deleteResult = deleteShellProcessExecution(executionId);
  if (deleteResult.outcome !== 'deleted') {
    return {
      executionId,
      outcome: deleteResult.outcome,
      removedHistoryEntries: 0
    };
  }

  let removedHistoryEntries = 0;
  for (let index = executionHistory.length - 1; index >= 0; index -= 1) {
    if (executionHistory[index]?.executionId !== executionId) continue;
    executionHistory.splice(index, 1);
    removedHistoryEntries += 1;
  }

  return {
    executionId,
    outcome: 'deleted',
    removedHistoryEntries
  };
}

export function subscribeProcessExecutionStatus(
  listener: (event: ShellProcessStatusEvent) => void
): () => void {
  return subscribeShellProcessStatus(listener);
}

export function clearProcessExecutionStateForTests(): {
  historyCleared: number;
  registryExecutionCount: number;
  registryActiveCount: number;
} {
  const historyCleared = clearExecutionHistory();
  const registry = clearShellProcessRegistryForTests();
  return {
    historyCleared,
    registryExecutionCount: registry.executionCount,
    registryActiveCount: registry.activeCount
  };
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
    description: 'Execute a shell command with parameters and capture output. Use this tool to run system commands, scripts, or utilities. Working directory is controlled by trusted world context (`working_directory`) and defaults to the user home directory when unset. If the model provides a different `directory`, execution is rejected with an error. When the user asks to run in a different folder, put that folder in `directory` (not in command/parameters paths).',

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
          description: 'Optional model-provided directory. Runtime only allows this when it resolves to the same path as trusted world `working_directory`; mismatches are rejected. If user asks for a target folder, set it here.'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 600000 = 10 minutes). Command will be terminated if it exceeds this time.'
        }
      },
      required: ['command'],
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
            description: 'Optional model-provided directory. Runtime only allows this when it resolves to the same path as trusted world `working_directory`; mismatches are rejected. If user asks for a target folder, set it here.'
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 600000 = 10 minutes). Command will be terminated if it exceeds this time.'
          }
        },
        required: ['command']
      };

      const validation = validateToolParameters(args, toolSchema, 'shell_cmd');
      if (!validation.valid) {
        return formatResultForLLM({
          executionId: 'validation-error',
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

      const { command, parameters = [], timeout } = validation.correctedArgs;

      // Ensure parameters is always an array
      const validParameters = Array.isArray(parameters) ?
        parameters.filter((p: any) => typeof p === 'string') :
        [];

      // Extract world and messageId from context for streaming
      const world = context?.world;
      const currentMessageId = context?.toolCallId;
      const chatId = context?.chatId ? String(context.chatId) : undefined;
      const abortSignal = context?.abortSignal as AbortSignal | undefined;
      const resolvedDirectory = resolveTrustedShellWorkingDirectory(context);
      const directoryValidation = validateShellDirectoryRequest(
        validation.correctedArgs.directory,
        resolvedDirectory
      );
      if (!directoryValidation.valid) {
        throw new Error(directoryValidation.error);
      }
      const scopeValidation = validateShellCommandScope(
        command,
        validParameters,
        resolvedDirectory
      );
      if (!scopeValidation.valid) {
        throw new Error(scopeValidation.error);
      }

      // Execute command with streaming callbacks if world is available
      const result = await executeShellCommand(command, validParameters, resolvedDirectory, {
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

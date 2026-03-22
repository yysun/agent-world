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
 * - 2026-03-22: Increased the bounded LLM continuation preview cap from 1200 to 4096 characters so structured shell outputs keep more complete result sets before truncation.
 * - 2026-03-22: Resolved skill-relative executable paths like `./scripts/foo.sh` against the active skill root before shell execution, so skill scripts no longer depend on the repo working directory.
 * - 2026-03-12: Shared tool approval flow now persists durable approval prompt/resolution messages for replay-safe shell approval history.
 * - 2026-03-12: Added `toolPermission` enforcement: 'read' level blocks execution with an error result; 'ask' level forces every invocation through HITL approval regardless of risk tier.
 * - 2026-03-06: Added explicit canonical failure reasons for shell validation/policy failures so approval denials and validation errors no longer masquerade as non-zero exits.
 * - 2026-03-06: Unified shell continuation output on one bounded-preview result contract, removed `smart`-mode branching, and stopped persisting a synthetic assistant stdout mirror message after shell completion.
 * - 2026-03-06: Added canonical shell error-result formatting helper so upstream tool persistence can normalize shell failures without falling back to ad hoc error strings.
 * - 2026-03-05: Hardened timeout termination to target process groups/process trees (SIGTERM + SIGKILL fallback) and removed child-process builtin timeout to keep timeout outcomes deterministic in the tool layer.
 * - 2026-03-05: Switched shell timeout grace config to shared reliability config helper.
 * - 2026-03-01: Prevented `./` and `../` parameter tokens from being misclassified as `<skill-id>/<path>` so non-skill shell paths remain unchanged.
 * - 2026-02-28: Generalized skill-relative path fallback to work with any folder prefix, removing `scripts/`-specific behavior.
 * - 2026-02-28: Added skill-aware script path resolution so `<skill-id>/scripts/<file>` parameters are auto-resolved to absolute paths under the skill root directory.
 * - 2026-02-28: Added deterministic shell risk tiering (`allow`/`hitl_required`/`block`) with per-call HITL approve/deny gating via shared `requestToolApproval` helper for high-risk in-scope commands.
 * - 2026-02-24: Required explicit chatId context for stdout/stderr streaming event emission to preserve chat isolation under strict frontend filtering.
 * - 2026-02-21: Streamed stderr via legacy `tool-stream` events while streaming stdout as assistant SSE; persisted only finalized stdout assistant message after execution completes.
 * - 2026-02-21: Added assistant-style SSE start/chunk/end streaming for shell runtime output so command chunks are delivered as assistant stream events instead of `tool-stream` messages.
 * - 2026-02-21: Added minimal LLM shell-result mode (`status` + `exit_code` semantics) for tool-call continuations, excluding stdout/stderr transcript bodies.
 * - 2026-02-15: Moved core cwd-boundary enforcement into `executeShellCommand` via optional `trustedWorkingDirectory` execution option.
 * - 2026-02-15: Added optional `output_format=json` for machine-readable command results.
 * - 2026-02-15: Added optional `artifact_paths` support with SHA-256 hashing and byte-size metadata for files within trusted scope.
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
 *   * Applied to both execution AND display formatting
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
import { resolve, join, relative, dirname } from 'path';
import { createHash } from 'crypto';
import { homedir } from 'os';
import { existsSync, readdirSync, realpathSync, promises as fsPromises } from 'fs';
import { createCategoryLogger } from './logger.js';
import { getShellTimeoutKillGraceMs } from './reliability-config.js';
import { validateToolParameters } from './tool-utils.js';
import { requestToolApproval } from './tool-approval.js';
import { publishSSE } from './events/publishers.js';
import { getDefaultWorkingDirectory, getEnvValueFromText } from './utils.js';
import { getSkillSourcePath, getSkills } from './skill-registry.js';
import {
  buildToolArtifactPreviewUrl,
  classifyDirectDisplayContent,
  createArtifactToolPreview,
  createTextToolPreview,
  parseToolExecutionEnvelopeContent,
  serializeToolExecutionEnvelope,
  type ToolExecutionEnvelope,
} from './tool-execution-envelope.js';
import { type AgentMessage } from './types.js';
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
const SHELL_RISK_APPROVE_OPTION = 'approve';
const SHELL_RISK_DENY_OPTION = 'deny';
const DEFAULT_HUMAN_PREVIEW_OUTPUT_CHARS = 400;

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
  failureReason?: ShellFailureReason;
  canceled?: boolean;
  timedOut?: boolean;
  executedAt: Date;
  duration: number; // milliseconds
}

export interface CommandExecutionArtifact {
  path: string;
  sha256: string;
  bytes: number;
}

export interface StructuredCommandExecutionResult {
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  duration_ms: number;
  artifacts: CommandExecutionArtifact[];
  stdout_truncated?: boolean;
  stderr_truncated?: boolean;
}

export type ShellFailureReason =
  | 'timeout'
  | 'canceled'
  | 'non_zero_exit'
  | 'execution_error'
  | 'validation_error'
  | 'approval_denied';

export interface MinimalShellLLMResult {
  status: 'success' | 'failed';
  exit_code: number | null;
  timed_out: boolean;
  canceled: boolean;
  reason?: ShellFailureReason;
}

export interface PreviewShellLLMResult extends MinimalShellLLMResult {
  stdout_preview?: string;
  stderr_preview?: string;
  stdout_truncated?: boolean;
  stderr_truncated?: boolean;
  stdout_redacted?: boolean;
  stderr_redacted?: boolean;
}

export type ShellCommandRiskTier = 'allow' | 'hitl_required' | 'block';

export interface ShellCommandRiskAssessment {
  tier: ShellCommandRiskTier;
  reason: string;
  tags: string[];
}

interface OutputSnippet {
  text: string;
  truncated: boolean;
}

interface OutputFormattingOptions {
  detail?: 'minimal' | 'full';
  maxOutputChars?: number;
}

interface ShellToolReturnOptions {
  llmResultMode: 'minimal' | 'verbose';
  outputFormat: 'markdown' | 'json';
  outputDetail: 'minimal' | 'full';
  toolCallId?: string;
  persistToolEnvelope?: boolean;
  artifacts?: CommandExecutionArtifact[];
  worldId?: string;
}

const DEFAULT_MIN_OUTPUT_CHARS = DEFAULT_HUMAN_PREVIEW_OUTPUT_CHARS;
const DEFAULT_LLM_PREVIEW_OUTPUT_CHARS = 4096;

function inferShellFailureReason(errorMessage: string): ShellFailureReason | undefined {
  const normalized = String(errorMessage || '').trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (
    normalized.includes('approval required')
    || normalized.includes('request was not approved')
    || normalized.includes('command not executed:')
  ) {
    return 'approval_denied';
  }

  if (
    normalized.includes('invalid command')
    || normalized.includes('invalid json in tool arguments')
    || normalized.includes('invalid tool call payload')
    || normalized.includes('working directory mismatch')
    || normalized.includes('outside world working directory')
    || normalized.includes('blocked dangerous operation')
    || normalized.includes('cannot be executed')
  ) {
    return 'validation_error';
  }

  return undefined;
}

function buildOutputSnippet(content: string, maxOutputChars: number): OutputSnippet {
  if (!content) {
    return { text: '', truncated: false };
  }
  if (maxOutputChars <= 0 || content.length <= maxOutputChars) {
    return { text: content, truncated: false };
  }
  return {
    text: content.slice(0, maxOutputChars),
    truncated: true
  };
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
  trustedWorkingDirectory: string,
  additionalTrustedRoots?: string[],
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

  const trustedRoots = Array.isArray(additionalTrustedRoots)
    ? additionalTrustedRoots.map((root) => String(root || '').trim()).filter(Boolean)
    : [];
  if (trustedRoots.some((root) => isPathWithinTrustedDirectory(requested, root))) {
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

function normalizeExecutable(command: string): string {
  const executable = getExecutableName(command).toLowerCase();
  return executable.endsWith('.exe') ? executable.slice(0, -4) : executable;
}

function normalizeParameterTokens(parameters: unknown): string[] {
  if (!Array.isArray(parameters)) {
    return [];
  }
  return parameters
    .filter((parameter): parameter is string => typeof parameter === 'string')
    .map((parameter) => stripWrappingQuotes(parameter).trim())
    .filter(Boolean);
}

function hasFlag(parameters: string[], aliases: string[]): boolean {
  const aliasSet = new Set(aliases.map((alias) => alias.toLowerCase()));
  return parameters.some((parameter) => {
    const lowered = parameter.toLowerCase();
    if (aliasSet.has(lowered)) return true;
    if (lowered.startsWith('--')) {
      return false;
    }
    if (lowered.startsWith('-') && lowered.length > 2) {
      const shortFlags = lowered.slice(1).split('');
      for (const shortFlag of shortFlags) {
        if (aliasSet.has(`-${shortFlag}`)) {
          return true;
        }
      }
    }
    return false;
  });
}

function isSystemCriticalPath(token: string): boolean {
  const normalized = token.trim().replace(/\\/g, '/').toLowerCase();
  if (!normalized) return false;

  if (normalized === '/' || normalized === '~' || normalized === '/root') {
    return true;
  }

  if (/^[a-z]:\/$/.test(normalized)) {
    return true;
  }

  const criticalPrefixes = [
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/lib',
    '/opt',
    '/var',
    '/system',
    '/library',
    '/private',
    '/proc',
    '/sys',
    '/dev'
  ];

  return criticalPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function hasWildcardTarget(parameters: string[]): boolean {
  return parameters.some((token) => token.includes('*') || token.includes('?'));
}

function assessRmRisk(parameters: string[]): ShellCommandRiskAssessment {
  const hasRecursive = hasFlag(parameters, ['-r', '-R', '--recursive']);
  const hasForce = hasFlag(parameters, ['-f', '--force']);
  const hasNoPreserveRoot = hasFlag(parameters, ['--no-preserve-root']);
  const pathTargets = parameters
    .map((token) => extractPathToken(token) ?? token)
    .map((token) => stripWrappingQuotes(token));
  const hasCriticalTarget = pathTargets.some((token) => isSystemCriticalPath(token));

  if (hasNoPreserveRoot || (hasRecursive && hasForce && hasCriticalTarget)) {
    return {
      tier: 'block',
      reason: 'catastrophic_delete_target',
      tags: ['risk:destructive', 'risk:delete', 'risk:critical-target']
    };
  }

  return {
    tier: 'hitl_required',
    reason: hasWildcardTarget(parameters) ? 'destructive_delete_wildcard' : 'destructive_delete',
    tags: ['risk:destructive', 'risk:delete']
  };
}

export function classifyShellCommandRisk(
  command: unknown,
  parameters: unknown
): ShellCommandRiskAssessment {
  if (typeof command !== 'string' || !command.trim()) {
    return {
      tier: 'allow',
      reason: 'invalid_or_empty_command',
      tags: ['risk:none']
    };
  }

  const executable = normalizeExecutable(command);
  const parameterTokens = normalizeParameterTokens(parameters);
  const hasUrl = parameterTokens.some((token) => /^https?:\/\//i.test(token));

  if (['rm', 'rmdir', 'unlink', 'del', 'erase'].includes(executable)) {
    return assessRmRisk(parameterTokens);
  }

  if (['mkfs', 'mkfs.ext4', 'mkfs.xfs', 'mkfs.btrfs', 'fdisk', 'sfdisk', 'parted'].includes(executable)) {
    return {
      tier: 'block',
      reason: 'catastrophic_disk_operation',
      tags: ['risk:destructive', 'risk:disk']
    };
  }

  if (executable === 'dd' && parameterTokens.some((token) => token.toLowerCase().startsWith('of=/dev/'))) {
    return {
      tier: 'block',
      reason: 'catastrophic_disk_write',
      tags: ['risk:destructive', 'risk:disk']
    };
  }

  if (['chmod', 'chown', 'chgrp'].includes(executable) && hasFlag(parameterTokens, ['-r', '-R', '--recursive'])) {
    return {
      tier: 'hitl_required',
      reason: 'recursive_permission_change',
      tags: ['risk:permissions', 'risk:recursive']
    };
  }

  if (executable === 'git' && parameterTokens[0]?.toLowerCase() === 'clean' && hasFlag(parameterTokens, ['-f', '-d', '-x'])) {
    return {
      tier: 'hitl_required',
      reason: 'destructive_git_clean',
      tags: ['risk:destructive', 'risk:git']
    };
  }

  if (['curl', 'wget'].includes(executable) && hasUrl && hasFlag(parameterTokens, ['-o', '-O', '--output-document'])) {
    return {
      tier: 'hitl_required',
      reason: 'remote_download',
      tags: ['risk:network', 'risk:download']
    };
  }

  return {
    tier: 'allow',
    reason: 'low_risk_command',
    tags: ['risk:none']
  };
}

async function requestShellCommandRiskApproval(options: {
  world: any;
  chatId: string | null;
  command: string;
  parameters: string[];
  resolvedDirectory: string;
  risk: ShellCommandRiskAssessment;
  toolCallId?: string;
  agentName?: string | null;
  messages?: AgentMessage[];
}): Promise<{ approved: boolean; reason: 'approved' | 'user_denied' | 'timeout' }> {
  const approval = await requestToolApproval({
    world: options.world,
    chatId: options.chatId,
    toolCallId: options.toolCallId,
    title: 'Approve risky shell command?',
    message: [
      `Command: ${options.command} ${options.parameters.join(' ')}`.trim(),
      `Risk: ${options.risk.reason}`,
      `Trusted directory: ${options.resolvedDirectory}`,
      'Proceed with this command?',
    ].join('\n'),
    defaultOptionId: SHELL_RISK_DENY_OPTION,
    options: [
      { id: SHELL_RISK_APPROVE_OPTION, label: 'Approve', description: 'Run this command once.' },
      { id: SHELL_RISK_DENY_OPTION, label: 'Deny', description: 'Do not run this command.' },
    ],
    approvedOptionIds: [SHELL_RISK_APPROVE_OPTION],
    metadata: {
      tool: 'shell_cmd',
      riskTier: options.risk.tier,
      riskReason: options.risk.reason,
      riskTags: options.risk.tags,
      command: options.command,
      parameters: options.parameters,
      cwd: options.resolvedDirectory,
      ...(options.toolCallId ? { toolCallId: options.toolCallId } : {}),
    },
    agentName: options.agentName || null,
    messages: options.messages,
  });

  return {
    approved: approval.approved,
    reason: approval.reason,
  };
}

function hasDisallowedShellSyntax(value: string): boolean {
  if (!value) return false;

  return value.includes('&&') ||
    value.includes('||') ||
    value.includes('|') ||
    value.includes(';') ||
    value.includes('>') ||
    value.includes('<') ||
    value.includes('$(') ||
    value.includes('`') ||
    value.includes('&') ||
    value.includes('\n') ||
    value.includes('\r');
}

function validateSingleCommandContract(command: unknown): { valid: true; executable: string } | { valid: false; error: string } {
  if (typeof command !== 'string' || !command.trim()) {
    return {
      valid: false,
      error: 'Invalid command: command must be a non-empty string.'
    };
  }

  if (hasDisallowedShellSyntax(command)) {
    return {
      valid: false,
      error: 'Invalid command: shell control syntax is not allowed (`&&`, `||`, `|`, `;`, redirects, command substitution, backgrounding). Provide a single executable in `command` and pass arguments via `parameters`.'
    };
  }

  const commandTokens = tokenizeCommand(command).map(stripWrappingQuotes).filter(Boolean);
  if (commandTokens.length !== 1) {
    return {
      valid: false,
      error: 'Invalid command format: provide a single executable in `command` and pass all arguments as separate `parameters` tokens.'
    };
  }

  const executable = commandTokens[0];
  if (!executable || /\s/.test(executable)) {
    return {
      valid: false,
      error: 'Invalid command executable: `command` must be a single token without whitespace.'
    };
  }

  return { valid: true, executable };
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
  trustedWorkingDirectory: string,
  additionalTrustedRoots?: string[]
): { valid: true } | { valid: false; error: string } {
  const singleCommandValidation = validateSingleCommandContract(command);
  if (!singleCommandValidation.valid) {
    return singleCommandValidation;
  }

  if (Array.isArray(parameters)) {
    for (const parameter of parameters) {
      if (typeof parameter !== 'string') {
        continue;
      }

      if (hasDisallowedShellSyntax(parameter)) {
        return {
          valid: false,
          error: `Invalid parameter: shell control syntax is not allowed in parameters (received "${parameter}").`
        };
      }
    }
  }

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
      const withinAdditionalRoot = (additionalTrustedRoots || []).some(
        (root) => isPathWithinTrustedDirectory(resolvedPath, root)
      );
      if (!withinAdditionalRoot) {
        return {
          valid: false,
          error: `Working directory mismatch: path "${token}" is outside world working directory "${trustedWorkingDirectory}".`
        };
      }
    }
  }

  return { valid: true };
}

const SKILL_DIR_PREFIXES = ['.agents/skills/', 'skills/'];

function extractSkillIdAndRemainder(param: string): { skillId: string; remainder: string } | null {
  for (const prefix of SKILL_DIR_PREFIXES) {
    if (param.startsWith(prefix)) {
      const afterPrefix = param.slice(prefix.length);
      const slashIndex = afterPrefix.indexOf('/');
      if (slashIndex <= 0) continue;
      const skillId = afterPrefix.slice(0, slashIndex);
      const remainder = afterPrefix.slice(slashIndex + 1);
      if (skillId && remainder) return { skillId, remainder };
    }
  }

  const slashIndex = param.indexOf('/');
  if (slashIndex <= 0) return null;
  const skillId = param.slice(0, slashIndex);
  if (skillId === '.' || skillId === '..' || skillId.startsWith('.') || skillId.startsWith('-')) {
    return null;
  }
  const remainder = param.slice(slashIndex + 1);
  if (!remainder) return null;
  return { skillId, remainder };
}

function resolveWithPrefixFallback(
  skillRoot: string,
  relativePath: string,
  requireExisting: boolean = true,
): string | null {
  const directCandidate = join(skillRoot, relativePath);
  if (!requireExisting || existsSync(directCandidate)) {
    return directCandidate;
  }

  const slashIndex = relativePath.indexOf('/');
  if (slashIndex <= 0) {
    return null;
  }

  const withoutFirstSegment = relativePath.slice(slashIndex + 1);
  if (!withoutFirstSegment) {
    return null;
  }

  const fallbackCandidate = join(skillRoot, withoutFirstSegment);
  if (!requireExisting || existsSync(fallbackCandidate)) {
    return fallbackCandidate;
  }

  return null;
}

function resolveFromRuntimeSkillsRoot(
  param: string,
  runtimeSkillsRoot: string | undefined,
): { absolutePath: string; skillRoot: string } | null {
  if (!runtimeSkillsRoot) return null;
  if (!param.includes('/')) return null;
  if (!existsSync(runtimeSkillsRoot)) return null;

  let entries: Array<{
    name: string;
    isDirectory: () => boolean;
    isSymbolicLink?: () => boolean;
  }> = [];
  try {
    entries = readdirSync(runtimeSkillsRoot, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const isDirectory = entry.isDirectory();
    const isSymlink = typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink();
    if (!isDirectory && !isSymlink) continue;
    const skillRoot = join(runtimeSkillsRoot, entry.name);
    const candidatePath = resolveWithPrefixFallback(skillRoot, param);
    if (candidatePath) {
      return { absolutePath: candidatePath, skillRoot };
    }
  }

  return null;
}

function resolveBareSkillPath(
  param: string,
  runtimeSkillsRoot: string | undefined,
  activeSkillContexts: Array<{ skillId?: string; skillRoot?: string }> = [],
): { absolutePath: string; skillRoot: string } | null {
  if (!param.includes('/')) return null;

  for (const context of activeSkillContexts) {
    const skillRoot = String(context.skillRoot || '').trim();
    if (!skillRoot) continue;

    const candidatePath = resolveWithPrefixFallback(skillRoot, param);
    if (candidatePath && isPathWithinTrustedDirectory(candidatePath, skillRoot)) {
      return { absolutePath: candidatePath, skillRoot };
    }
  }

  const runtimeMatch = resolveFromRuntimeSkillsRoot(param, runtimeSkillsRoot);
  if (runtimeMatch) {
    return runtimeMatch;
  }

  const skills = getSkills();
  for (const skill of skills) {
    const sourcePath = getSkillSourcePath(skill.skill_id);
    if (!sourcePath) continue;
    const skillRoot = dirname(sourcePath);
    const candidatePath = resolveWithPrefixFallback(skillRoot, param);
    if (candidatePath) {
      return { absolutePath: candidatePath, skillRoot };
    }
  }
  return null;
}

function decodeSkillContextXmlValue(value: string): string {
  return value
    .replace(/&apos;/g, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function parseActiveSkillContextMetadata(content: string): { skillId?: string; skillRoot?: string } | null {
  const envelope = parseToolExecutionEnvelopeContent(content);
  if (!envelope || envelope.tool !== 'load_skill' || envelope.status !== 'completed') {
    return null;
  }

  const payload = typeof envelope.result === 'string' ? envelope.result : '';
  const normalizedPayload = String(payload || '');
  if (!normalizedPayload.includes('<skill_context') || /<error>/i.test(normalizedPayload)) {
    return null;
  }

  const skillIdMatch = normalizedPayload.match(/<skill_context\s+id="([^"]+)"/);
  const skillRootMatch = normalizedPayload.match(/<skill_root>([\s\S]*?)<\/skill_root>/);
  const skillId = skillIdMatch?.[1] ? decodeSkillContextXmlValue(skillIdMatch[1]).trim() : '';
  const skillRoot = skillRootMatch?.[1] ? decodeSkillContextXmlValue(skillRootMatch[1]).trim() : '';
  if (!skillId || !skillRoot) {
    return null;
  }

  const sourcePath = getSkillSourcePath(skillId);
  if (!sourcePath) {
    return null;
  }

  const registrySkillRoot = dirname(sourcePath);
  const normalizedRegistrySkillRoot = normalizeForPlatformComparison(canonicalizePath(registrySkillRoot));
  const normalizedParsedSkillRoot = normalizeForPlatformComparison(canonicalizePath(skillRoot));
  if (normalizedRegistrySkillRoot !== normalizedParsedSkillRoot) {
    return null;
  }

  return {
    skillId,
    skillRoot: registrySkillRoot,
  };
}

function getActiveSkillContexts(
  messages: unknown,
  chatId: string | undefined,
): Array<{ skillId?: string; skillRoot?: string }> {
  if (!Array.isArray(messages)) {
    return [];
  }

  const contexts: Array<{ skillId?: string; skillRoot?: string }> = [];
  const seen = new Set<string>();

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as any;
    if (!message || typeof message !== 'object') {
      continue;
    }

    const messageChatId = typeof message.chatId === 'string' ? message.chatId.trim() : '';
    if (chatId && messageChatId && messageChatId !== chatId) {
      continue;
    }

    if (message.role !== 'tool') {
      continue;
    }

    const content = typeof message.content === 'string' ? message.content : '';
    const contextMetadata = parseActiveSkillContextMetadata(content);
    if (!contextMetadata) {
      continue;
    }

    const dedupeKey = `${contextMetadata.skillId || ''}::${contextMetadata.skillRoot || ''}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    contexts.push(contextMetadata);
  }

  return contexts;
}

function hasParentDirectorySegments(pathValue: string): boolean {
  const normalized = stripWrappingQuotes(pathValue).trim().replace(/\\/g, '/');
  if (!normalized) {
    return false;
  }

  return normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('/../')
    || normalized.endsWith('/..');
}

function shouldAttemptSkillRelativeCommandResolution(command: string): boolean {
  const normalized = stripWrappingQuotes(command).trim().replace(/\\/g, '/');
  if (!normalized || normalized === '.' || normalized === '..') {
    return false;
  }

  if (
    normalized === '~'
    || normalized.startsWith('~/')
    || normalized.startsWith('/')
    || normalized.startsWith('\\')
    || /^[A-Za-z]:\//.test(normalized)
    || hasParentDirectorySegments(normalized)
  ) {
    return false;
  }

  return normalized.startsWith('./')
    || normalized.startsWith('.agents/skills/')
    || normalized.startsWith('skills/')
    || normalized.includes('/');
}

function shouldValidateRelativeCommandPath(command: string): boolean {
  const normalized = stripWrappingQuotes(command).trim().replace(/\\/g, '/');
  if (!normalized) {
    return false;
  }

  if (
    normalized === '~'
    || normalized.startsWith('~/')
    || normalized.startsWith('/')
    || normalized.startsWith('\\')
    || /^[A-Za-z]:\//.test(normalized)
  ) {
    return false;
  }

  return normalized.startsWith('./')
    || normalized.startsWith('../')
    || normalized.includes('/');
}

export function resolveSkillScriptParameters(
  parameters: string[],
  runtimeSkillsRoot?: string,
  options?: {
    allowBareScriptsResolution?: boolean;
    activeSkillContexts?: Array<{ skillId?: string; skillRoot?: string }>;
  },
): { resolvedParameters: string[]; skillRoots: string[] } {
  const skillRootsSet = new Set<string>();
  const allowBareScriptsResolution = options?.allowBareScriptsResolution === true;
  const activeSkillContexts = Array.isArray(options?.activeSkillContexts)
    ? options.activeSkillContexts.filter((context) => {
      const skillId = String(context?.skillId || '').trim();
      const skillRoot = String(context?.skillRoot || '').trim();
      return Boolean(skillId || skillRoot);
    })
    : [];
  const resolvedParameters = parameters.map((param) => {
    const parsed = extractSkillIdAndRemainder(param);
    if (parsed) {
      const hasExplicitSkillPrefix = SKILL_DIR_PREFIXES.some((prefix) => param.startsWith(prefix));
      const activeSkillRoot = activeSkillContexts.find((context) => context.skillId === parsed.skillId)?.skillRoot;
      const sourcePath = getSkillSourcePath(parsed.skillId);
      const hasRuntimeSkillDir = Boolean(runtimeSkillsRoot)
        && existsSync(join(runtimeSkillsRoot!, parsed.skillId));
      const shouldAttemptExplicitResolution = hasExplicitSkillPrefix || Boolean(activeSkillRoot) || Boolean(sourcePath) || hasRuntimeSkillDir;

      if (shouldAttemptExplicitResolution) {
        if (activeSkillRoot) {
          const absolutePath = resolveWithPrefixFallback(activeSkillRoot, parsed.remainder, false);
          if (absolutePath && isPathWithinTrustedDirectory(absolutePath, activeSkillRoot)) {
            skillRootsSet.add(activeSkillRoot);
            return absolutePath;
          }
        }

        if (sourcePath) {
          const skillRoot = dirname(sourcePath);
          const absolutePath = resolveWithPrefixFallback(skillRoot, parsed.remainder, false);
          if (absolutePath && isPathWithinTrustedDirectory(absolutePath, skillRoot)) {
            skillRootsSet.add(skillRoot);
            return absolutePath;
          }
        }

        if (runtimeSkillsRoot) {
          const candidateSkillRoot = join(runtimeSkillsRoot, parsed.skillId);
          const candidatePath = resolveWithPrefixFallback(candidateSkillRoot, parsed.remainder);
          if (candidatePath) {
            skillRootsSet.add(candidateSkillRoot);
            return candidatePath;
          }
        }

        if (hasExplicitSkillPrefix) {
          return param;
        }
      }
    }
    if (!allowBareScriptsResolution) {
      return param;
    }

    const bareMatch = resolveBareSkillPath(param, runtimeSkillsRoot, activeSkillContexts);
    if (bareMatch) {
      skillRootsSet.add(bareMatch.skillRoot);
      return bareMatch.absolutePath;
    }
    return param;
  });
  return { resolvedParameters, skillRoots: [...skillRootsSet] };
}

export function resolveSkillScriptCommand(
  command: string,
  runtimeSkillsRoot?: string,
  options?: {
    allowBareScriptsResolution?: boolean;
    activeSkillContexts?: Array<{ skillId?: string; skillRoot?: string }>;
  },
): { resolvedCommand: string; skillRoots: string[] } {
  const normalizedCommand = stripWrappingQuotes(command).trim();
  if (!shouldAttemptSkillRelativeCommandResolution(normalizedCommand)) {
    return { resolvedCommand: normalizedCommand, skillRoots: [] };
  }

  const { resolvedParameters, skillRoots } = resolveSkillScriptParameters(
    [normalizedCommand],
    runtimeSkillsRoot,
    options,
  );

  return {
    resolvedCommand: resolvedParameters[0] || normalizedCommand,
    skillRoots,
  };
}

function validateResolvedCommandExecutableScope(
  resolvedCommand: string,
  originalCommand: string,
  trustedWorkingDirectory: string,
  additionalTrustedRoots?: string[],
): { valid: true } | { valid: false; error: string } {
  if (!shouldValidateRelativeCommandPath(originalCommand)) {
    return { valid: true };
  }

  const resolvedPath = resolveTokenPath(stripWrappingQuotes(resolvedCommand), trustedWorkingDirectory);
  if (isPathWithinTrustedDirectory(resolvedPath, trustedWorkingDirectory)) {
    return { valid: true };
  }

  const trustedRoots = Array.isArray(additionalTrustedRoots)
    ? additionalTrustedRoots.map((root) => String(root || '').trim()).filter(Boolean)
    : [];
  if (trustedRoots.some((root) => isPathWithinTrustedDirectory(resolvedPath, root))) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Working directory mismatch: command "${stripWrappingQuotes(originalCommand)}" is outside world working directory "${trustedWorkingDirectory}".`
  };
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
    trustedWorkingDirectory?: string;
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
    resolvedDirectory,
    trustedWorkingDirectory: options.trustedWorkingDirectory || null
  });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let processExited = false;
    let timeoutForceKillHandle: NodeJS.Timeout | null = null;
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
      const trustedWorkingDirectory = String(options.trustedWorkingDirectory || '').trim();
      if (trustedWorkingDirectory && !isPathWithinTrustedDirectory(resolvedDirectory, trustedWorkingDirectory)) {
        throw new Error(
          `Working directory mismatch: execution directory "${resolvedDirectory}" is outside trusted working directory "${trustedWorkingDirectory}".`
        );
      }

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
        detached: process.platform !== 'win32',
      });
      attachShellProcessHandle(executionId, childProcess);
      transitionShellProcessExecution(executionId, 'running', {
        startedAt: new Date().toISOString()
      });

      const sendTerminationSignal = (signal: NodeJS.Signals): void => {
        const pid = childProcess.pid;
        // On Unix-like systems, detached child uses its own process group;
        // signaling negative PID targets the full group/tree.
        if (pid && process.platform !== 'win32') {
          try {
            process.kill(-pid, signal);
            return;
          } catch {
            // Fall back to direct child signal below.
          }
        }

        if (process.platform === 'win32') {
          // Best effort process-tree termination on Windows.
          try {
            const taskkill = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
              stdio: 'ignore',
              windowsHide: true,
            });
            taskkill.unref();
            return;
          } catch {
            // Fall back to direct child signal below.
          }
        }

        try {
          childProcess.kill(signal);
        } catch {
          // ignore if process already exited
        }
      };

      const requestTermination = (source: 'timeout' | 'abort') => {
        if (processExited) return;
        sendTerminationSignal('SIGTERM');

        if (source === 'timeout') {
          const graceMs = getShellTimeoutKillGraceMs();
          if (graceMs > 0) {
            timeoutForceKillHandle = setTimeout(() => {
              if (processExited) return;
              sendTerminationSignal('SIGKILL');
            }, graceMs);
          }
        }
      };

      // Set up timeout handler
      const timeoutHandle = setTimeout(() => {
        if (!processExited) {
          timedOut = true;
          requestTermination('timeout');
          logger.warn('Command execution timeout', { command, parameters, timeout, directory });
        }
      }, timeout);

      const abortHandler = () => {
        if (processExited) return;
        aborted = true;
        markShellProcessCancelRequested(executionId);
        requestTermination('abort');
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
        if (timeoutForceKillHandle) {
          clearTimeout(timeoutForceKillHandle);
          timeoutForceKillHandle = null;
        }
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
          result.timedOut = true;
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
        if (timeoutForceKillHandle) {
          clearTimeout(timeoutForceKillHandle);
          timeoutForceKillHandle = null;
        }
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

async function collectCommandArtifacts(
  artifactPaths: string[],
  trustedWorkingDirectory: string
): Promise<CommandExecutionArtifact[]> {
  if (!Array.isArray(artifactPaths) || artifactPaths.length === 0) {
    return [];
  }

  const trustedCanonical = canonicalizePath(trustedWorkingDirectory);
  const artifacts: CommandExecutionArtifact[] = [];

  for (const rawPath of artifactPaths) {
    if (typeof rawPath !== 'string') {
      continue;
    }

    const candidate = stripWrappingQuotes(rawPath);
    if (!candidate) {
      continue;
    }

    const resolvedPath = resolveTokenPath(candidate, trustedWorkingDirectory);
    if (!isPathWithinTrustedDirectory(resolvedPath, trustedWorkingDirectory)) {
      throw new Error(`Working directory mismatch: artifact path "${candidate}" is outside world working directory "${trustedWorkingDirectory}".`);
    }

    const statFn = (fsPromises as any).stat;
    if (typeof statFn === 'function') {
      let stat;
      try {
        stat = await statFn(resolvedPath);
      } catch {
        throw new Error(`Artifact not found: "${candidate}"`);
      }

      if (typeof stat?.isFile === 'function' && !stat.isFile()) {
        throw new Error(`Artifact path is not a file: "${candidate}"`);
      }
    }

    const readFileFn = (fsPromises as any).readFile;
    let fileBuffer: Buffer | string = '';
    if (typeof readFileFn === 'function') {
      try {
        const readResult = await readFileFn(resolvedPath);
        fileBuffer = (readResult ?? '') as Buffer | string;
      } catch {
        throw new Error(`Artifact not found: "${candidate}"`);
      }
    }

    const sha256 = createHash('sha256').update(fileBuffer).digest('hex');
    const bytes = Buffer.isBuffer(fileBuffer)
      ? fileBuffer.byteLength
      : Buffer.byteLength(fileBuffer);
    const canonicalArtifactPath = canonicalizePath(resolvedPath);
    const relativePath = relative(trustedCanonical, canonicalArtifactPath).replace(/\\/g, '/');
    const isOutsideTrusted = relativePath.startsWith('..') || !relativePath;

    artifacts.push({
      path: isOutsideTrusted ? candidate : relativePath,
      sha256,
      bytes
    });
  }

  return artifacts;
}

export function formatStructuredResult(
  result: CommandExecutionResult,
  artifacts: CommandExecutionArtifact[] = [],
  options: OutputFormattingOptions = {}
): StructuredCommandExecutionResult {
  const detail = options.detail ?? 'minimal';
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MIN_OUTPUT_CHARS;
  const stdoutSnippet = detail === 'full'
    ? { text: result.stdout, truncated: false }
    : buildOutputSnippet(result.stdout, maxOutputChars);
  const stderrSnippet = detail === 'full'
    ? { text: result.stderr, truncated: false }
    : buildOutputSnippet(result.stderr, maxOutputChars);

  return {
    exit_code: result.exitCode,
    stdout: stdoutSnippet.text,
    stderr: stderrSnippet.text,
    timed_out: Boolean(result.timedOut || result.error?.includes('timed out')),
    duration_ms: result.duration,
    artifacts,
    ...(stdoutSnippet.truncated ? { stdout_truncated: true } : {}),
    ...(stderrSnippet.truncated ? { stderr_truncated: true } : {})
  };
}

export function formatMinimalShellResult(
  result: CommandExecutionResult
): MinimalShellLLMResult {
  const timedOut = Boolean(result.timedOut || result.error?.includes('timed out'));
  const canceled = Boolean(result.canceled || result.error?.toLowerCase().includes('canceled'));
  const inferredFailureReason = result.failureReason || inferShellFailureReason(String(result.error || ''));
  const failed = timedOut || canceled || result.exitCode !== 0 || Boolean(result.error) || Boolean(inferredFailureReason);

  let reason: ShellFailureReason | undefined;
  if (timedOut) {
    reason = 'timeout';
  } else if (canceled) {
    reason = 'canceled';
  } else if (inferredFailureReason) {
    reason = inferredFailureReason;
  } else if (result.exitCode !== null && result.exitCode !== 0) {
    reason = 'non_zero_exit';
  } else if (result.error) {
    reason = 'execution_error';
  }

  return {
    status: failed ? 'failed' : 'success',
    exit_code: result.exitCode,
    timed_out: timedOut,
    canceled,
    ...(reason ? { reason } : {})
  };
}

export function formatMinimalShellResultForLLM(result: CommandExecutionResult): string {
  return formatPreviewShellResultForLLM(result);
}

function containsImageDataUri(text: string): boolean {
  return /data:image\/[a-z0-9.+-]+;base64,/i.test(String(text || ''));
}

/**
 * Strip ANSI escape sequences and terminal control characters from shell output
 * before sending to the LLM. Raw terminal output often contains spinner animations
 * (◒◐◓◑), cursor-control codes (\x1b[?25l, \x1b[999D\x1b[J), and ANSI color codes
 * that confuse LLMs into thinking a process is still running when it has already
 * completed successfully (exit_code: 0).
 *
 * Strips:
 *  - CSI sequences: \x1b[ ... final-byte  (colors, cursor movement, erase, etc.)
 *  - OSC sequences: \x1b] ... \x07 or \x1b\  (terminal title/hyperlinks)
 *  - DCS/SOS/PM/APC sequences: \x1bP/\x1bX/\x1b^/\x1b_ ... \x1b\
 *  - Single-char Fe escapes: \x1b followed by non-[ byte
 *  - Bare carriage returns used by spinner overwrites
 */
export function stripAnsiFromShellOutput(text: string): string {
  // CSI sequences: ESC [ ... (any intermediate+final byte)
  let stripped = text.replace(/\x1b\[[0-9;?!#]*[a-zA-Z@`]/g, '');
  // OSC sequences: ESC ] ... BEL or ESC\
  stripped = stripped.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
  // DCS/SOS/PM/APC: ESC [P X ^ _] ... ESC\
  stripped = stripped.replace(/\x1b[PX\^_].*?\x1b\\/gs, '');
  // Remaining single-char Fe escapes (ESC followed by one non-[ char)
  stripped = stripped.replace(/\x1b[^[]/g, '');
  // Carriage returns used by spinner-overwrite pattern (keep newlines)
  stripped = stripped.replace(/\r(?!\n)/g, '\n');
  // Collapse multiple blank lines from the cleanup
  stripped = stripped.replace(/\n{3,}/g, '\n\n');
  return stripped;
}

function buildLLMPreviewField(content: string, maxOutputChars: number): {
  text: string;
  truncated: boolean;
  redacted: boolean;
} {
  const normalized = String(content || '');
  if (!normalized) {
    return { text: '', truncated: false, redacted: false };
  }

  if (containsImageDataUri(normalized)) {
    return {
      text: `omitted from LLM context (contains image data URI output; ${normalized.length} chars).`,
      truncated: false,
      redacted: true,
    };
  }

  // Strip ANSI sequences before truncating so the LLM receives clean text.
  // Without this, spinner animations and cursor-control codes in raw terminal
  // output make the LLM think a completed process (exit_code: 0) is still running.
  const clean = stripAnsiFromShellOutput(normalized);
  const snippet = buildOutputSnippet(clean, maxOutputChars);
  return {
    text: snippet.text,
    truncated: snippet.truncated,
    redacted: false,
  };
}

export function formatPreviewShellResult(
  result: CommandExecutionResult,
  options: { maxOutputChars?: number } = {}
): PreviewShellLLMResult {
  const minimal = formatMinimalShellResult(result);
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_LLM_PREVIEW_OUTPUT_CHARS;
  const stderrSource = String(result.stderr || result.error || '');
  const stdoutPreview = buildLLMPreviewField(result.stdout, maxOutputChars);
  const stderrPreview = buildLLMPreviewField(stderrSource, maxOutputChars);

  return {
    ...minimal,
    ...(stdoutPreview.text ? { stdout_preview: stdoutPreview.text } : {}),
    ...(stderrPreview.text ? { stderr_preview: stderrPreview.text } : {}),
    ...(stdoutPreview.truncated ? { stdout_truncated: true } : {}),
    ...(stderrPreview.truncated ? { stderr_truncated: true } : {}),
    ...(stdoutPreview.redacted ? { stdout_redacted: true } : {}),
    ...(stderrPreview.redacted ? { stderr_redacted: true } : {}),
  };
}

export function formatPreviewShellResultForLLM(
  result: CommandExecutionResult,
  options: { maxOutputChars?: number } = {}
): string {
  const preview = formatPreviewShellResult(result, options);
  const lines = [
    `status: ${preview.status}`,
    `exit_code: ${preview.exit_code === null ? 'null' : String(preview.exit_code)}`,
    `timed_out: ${preview.timed_out ? 'true' : 'false'}`,
    `canceled: ${preview.canceled ? 'true' : 'false'}`
  ];

  if (preview.reason) {
    lines.push(`reason: ${preview.reason}`);
  }
  if (preview.stdout_preview) {
    lines.push('stdout_preview:');
    lines.push(preview.stdout_preview);
  }
  if (preview.stdout_truncated) {
    lines.push('stdout_truncated: true');
  }
  if (preview.stdout_redacted) {
    lines.push('stdout_redacted: true');
  }
  if (preview.stderr_preview) {
    lines.push('stderr_preview:');
    lines.push(preview.stderr_preview);
  }
  if (preview.stderr_truncated) {
    lines.push('stderr_truncated: true');
  }
  if (preview.stderr_redacted) {
    lines.push('stderr_redacted: true');
  }

  return lines.join('\n');
}

export function formatShellToolErrorResultForLLM(options: {
  command?: unknown;
  parameters?: unknown;
  error: unknown;
  failureReason?: ShellFailureReason;
}): string {
  const errorMessage = options.error instanceof Error ? options.error.message : String(options.error);
  const parameters = Array.isArray(options.parameters)
    ? options.parameters.map((parameter) => String(parameter))
    : [];

  return formatPreviewShellResultForLLM({
    executionId: 'shell-tool-error',
    command: typeof options.command === 'string' && options.command.trim()
      ? options.command
      : '<shell_cmd>',
    parameters,
    stdout: '',
    stderr: errorMessage,
    exitCode: null,
    signal: null,
    error: errorMessage,
    failureReason: options.failureReason || inferShellFailureReason(errorMessage) || 'execution_error',
    executedAt: new Date(),
    duration: 0,
  });
}

function buildShellToolResultContent(
  result: CommandExecutionResult,
  options: Omit<ShellToolReturnOptions, 'persistToolEnvelope' | 'toolCallId'>
): string {
  if (options.llmResultMode === 'minimal') {
    if (options.outputFormat === 'json') {
      return JSON.stringify(formatPreviewShellResult(result), null, 2);
    }
    return formatPreviewShellResultForLLM(result);
  }

  if (options.outputFormat === 'json') {
    return JSON.stringify(
      formatStructuredResult(result, options.artifacts || [], { detail: options.outputDetail }),
      null,
      2,
    );
  }

  return formatResultForLLM(result, { detail: options.outputDetail });
}

function buildHumanShellPreviewContent(
  result: CommandExecutionResult,
  options: Pick<ShellToolReturnOptions, 'outputFormat' | 'outputDetail' | 'artifacts'>,
): string {
  if (options.outputFormat === 'json') {
    return JSON.stringify(
      formatStructuredResult(result, options.artifacts || [], {
        detail: options.outputDetail,
        maxOutputChars: DEFAULT_HUMAN_PREVIEW_OUTPUT_CHARS,
      }),
      null,
      2,
    );
  }

  return formatResultForLLM(result, {
    detail: options.outputDetail,
    maxOutputChars: DEFAULT_HUMAN_PREVIEW_OUTPUT_CHARS,
  });
}

function buildShellToolPreviewEnvelope(
  result: CommandExecutionResult,
  options: Omit<ShellToolReturnOptions, 'persistToolEnvelope'>,
): ToolExecutionEnvelope<string> {
  const resultContent = buildShellToolResultContent(result, {
    llmResultMode: options.llmResultMode,
    outputFormat: options.outputFormat,
    outputDetail: options.outputDetail,
    artifacts: options.artifacts,
  });
  const previewItems = [
    createTextToolPreview(
      buildHumanShellPreviewContent(result, {
        outputFormat: options.outputFormat,
        outputDetail: options.outputDetail,
        artifacts: options.artifacts,
      }),
      { markdown: options.outputFormat !== 'json', title: 'shell_cmd result' },
    ),
    ...(options.artifacts || []).map((artifact) =>
      createArtifactToolPreview({
        path: artifact.path,
        bytes: artifact.bytes,
        display_name: artifact.path,
        ...(options.worldId ? { url: buildToolArtifactPreviewUrl({ path: artifact.path, worldId: options.worldId }) } : {}),
      })
    ),
  ];
  const displayContent = getShellToolDisplayContent(result, options.outputFormat);

  return {
    __type: 'tool_execution_envelope',
    version: 1,
    tool: 'shell_cmd',
    ...(options.toolCallId ? { tool_call_id: options.toolCallId } : {}),
    status: result.exitCode === 0 && !result.error && !result.timedOut && !result.canceled ? 'completed' : 'failed',
    preview: previewItems,
    ...(displayContent ? { display_content: displayContent } : {}),
    result: resultContent,
  };
}

function getShellToolDisplayContent(
  result: CommandExecutionResult,
  outputFormat: ShellToolReturnOptions['outputFormat'],
): string {
  if (outputFormat === 'json') {
    return '';
  }

  const stdout = String(result.stdout || '').trim();
  if (!stdout) {
    return '';
  }

  return classifyDirectDisplayContent(stdout) ? stdout : '';
}

function formatShellToolReturnContent(
  result: CommandExecutionResult,
  options: ShellToolReturnOptions,
): string {
  if (!options.persistToolEnvelope) {
    return buildShellToolResultContent(result, {
      llmResultMode: options.llmResultMode,
      outputFormat: options.outputFormat,
      outputDetail: options.outputDetail,
      artifacts: options.artifacts,
    });
  }

  return serializeToolExecutionEnvelope(buildShellToolPreviewEnvelope(result, options));
}

export function formatShellToolErrorEnvelopeContent(options: {
  command?: unknown;
  parameters?: unknown;
  error: unknown;
  failureReason?: ShellFailureReason;
  toolCallId?: string;
}): string {
  const errorMessage = options.error instanceof Error ? options.error.message : String(options.error);
  const parameters = Array.isArray(options.parameters)
    ? options.parameters.map((parameter) => String(parameter))
    : [];

  const result: CommandExecutionResult = {
    executionId: 'shell-tool-error',
    command: typeof options.command === 'string' && options.command.trim()
      ? options.command
      : '<shell_cmd>',
    parameters,
    stdout: '',
    stderr: errorMessage,
    exitCode: null,
    signal: null,
    error: errorMessage,
    failureReason: options.failureReason || inferShellFailureReason(errorMessage) || 'execution_error',
    executedAt: new Date(),
    duration: 0,
  };

  return serializeToolExecutionEnvelope(buildShellToolPreviewEnvelope(result, {
    llmResultMode: 'minimal',
    outputFormat: 'markdown',
    outputDetail: 'minimal',
    toolCallId: options.toolCallId,
  }));
}

/**
 * Format command execution result for LLM consumption
 * Provides a human-readable summary of the execution with improved markdown formatting
 * 
 * @param result - Command execution result
 * @returns Formatted markdown string suitable for LLM and display
 */
export function formatResultForLLM(
  result: CommandExecutionResult,
  options: OutputFormattingOptions = {}
): string {
  const detail = options.detail ?? 'minimal';
  const maxOutputChars = options.maxOutputChars ?? DEFAULT_MIN_OUTPUT_CHARS;
  const stdoutSnippet = detail === 'full'
    ? { text: result.stdout, truncated: false }
    : buildOutputSnippet(result.stdout, maxOutputChars);
  const stderrSnippet = detail === 'full'
    ? { text: result.stderr, truncated: false }
    : buildOutputSnippet(result.stderr, maxOutputChars);
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
  if (detail === 'full') {
    parts.push(`**Executed at:** ${result.executedAt.toISOString()}`);
  }

  if (result.error) {
    parts.push(`**Status:** ❌ Error`);
    parts.push(`**Error:** ${result.error}`);
  } else {
    parts.push(`**Status:** ${result.exitCode === 0 ? '✅' : '⚠️'} Exit code ${result.exitCode}`);
  }

  // Standard output section
  if (stdoutSnippet.text) {
    parts.push('');
    parts.push(detail === 'full' ? '### Standard Output' : '### Standard Output (preview)');
    parts.push('');
    parts.push('```');
    parts.push(stdoutSnippet.text);
    parts.push('```');
    if (stdoutSnippet.truncated) {
      parts.push('*(Output truncated to minimum necessary preview. Use `output_detail: "full"` for full output.)*');
    }
  }

  // Standard error section (only show if there's content)
  if (stderrSnippet.text) {
    parts.push('');
    parts.push(detail === 'full' ? '### Standard Error' : '### Standard Error (preview)');
    parts.push('');
    parts.push('```');
    parts.push(stderrSnippet.text);
    parts.push('```');
    if (stderrSnippet.truncated) {
      parts.push('*(Error output truncated to minimum necessary preview. Use `output_detail: "full"` for full output.)*');
    }
  }

  // No output case
  if (!stdoutSnippet.text && !stderrSnippet.text && !result.error) {
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
    description: 'Execute a user-requested shell command and capture output. Use this only when the user explicitly asks to run a command. Contract: `command` must be a single executable token, and each argument must be a separate `parameters` token (no mini-scripts in `command`). Working directory is resolved from trusted world context (`working_directory`) and defaults to the core default working directory (user home by default) when unset. Optional `directory` is allowed only when it resolves inside trusted scope; outside-scope requests are rejected. Path-like command arguments are scope-validated. Shell control syntax is blocked (`&&`, `||`, pipes, redirects, command substitution, backgrounding), and inline eval modes (for example `sh -c`, `node -e`, `python -c`, `powershell -Command`) are blocked. Execution uses OS shell mode (`shell: true`), so do not pass untrusted text as command content. Optional `output_format` supports `markdown` (default) and `json`; `output_detail` defaults to `minimal` to return minimum necessary output and can be set to `full`; `artifact_paths` can include files to hash and report in output metadata.',

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
          description: 'Array of parameters/arguments for the command (e.g., ["-la", "./src"]). Pass each argument as a separate token.'
        },
        directory: {
          type: 'string',
          description: 'Optional model-provided target directory. Runtime allows this only when it resolves inside trusted world working-directory scope; outside-scope requests are rejected. If user asks for a target folder, set it here.'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 600000 = 10 minutes). Command will be terminated if it exceeds this time.'
        },
        output_format: {
          type: 'string',
          enum: ['markdown', 'json'],
          description: 'Output format for tool result. Use "markdown" (default) for human-readable output or "json" for structured output.'
        },
        output_detail: {
          type: 'string',
          enum: ['minimal', 'full'],
          description: 'Output detail level. `minimal` (default) returns bounded previews and essential metadata only; `full` returns complete stdout/stderr and timestamp fields.'
        },
        artifact_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional file paths (within trusted working-directory scope) to include as hashed artifacts in result output.'
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
            description: 'Array of parameters/arguments for the command (e.g., ["-la", "./src"]). Pass each argument as a separate token.'
          },
          directory: {
            type: 'string',
            description: 'Optional model-provided target directory. Runtime allows this only when it resolves inside trusted world working-directory scope; outside-scope requests are rejected. If user asks for a target folder, set it here.'
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 600000 = 10 minutes). Command will be terminated if it exceeds this time.'
          },
          output_format: {
            type: 'string',
            enum: ['markdown', 'json'],
            description: 'Output format for tool result. Use "markdown" (default) for human-readable output or "json" for structured output.'
          },
          output_detail: {
            type: 'string',
            enum: ['minimal', 'full'],
            description: 'Output detail level. `minimal` (default) returns bounded previews and essential metadata only; `full` returns complete stdout/stderr and timestamp fields.'
          },
          artifact_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional file paths (within trusted working-directory scope) to include as hashed artifacts in result output.'
          }
        },
        required: ['command']
      };

      const llmResultMode = typeof context?.llmResultMode === 'string'
        ? context.llmResultMode === 'verbose' ? 'verbose' : 'minimal'
        : 'verbose';
      const persistToolEnvelope = context?.persistToolEnvelope === true;

      const validation = validateToolParameters(args, toolSchema, 'shell_cmd');
      if (!validation.valid) {
        const validationResult: CommandExecutionResult = {
          executionId: 'validation-error',
          command: args?.command || '<invalid>',
          parameters: [],
          exitCode: null,
          signal: null,
          error: validation.error,
          failureReason: 'validation_error',
          stdout: '',
          stderr: '',
          executedAt: new Date(),
          duration: 0
        };
        const validationOutputFormat = validation.correctedArgs?.output_format === 'json' ? 'json' : 'markdown';
        return formatShellToolReturnContent(validationResult, {
          llmResultMode,
          outputFormat: validationOutputFormat,
          outputDetail: 'minimal',
          toolCallId: typeof context?.toolCallId === 'string' ? context.toolCallId : undefined,
          persistToolEnvelope,
          worldId: typeof context?.world?.id === 'string' ? context.world.id : undefined,
        });
      }

      const {
        command,
        parameters = [],
        timeout,
        output_format: outputFormat = 'markdown',
        output_detail: outputDetail = 'minimal',
        artifact_paths: artifactPaths = []
      } = validation.correctedArgs;

      // Ensure parameters is always an array
      const rawParameters = Array.isArray(parameters) ?
        parameters.filter((p: any) => typeof p === 'string') :
        [];

      const chatIdRaw = typeof context?.chatId === 'string' ? context.chatId.trim() : '';
      const chatId = chatIdRaw || undefined;

      // Resolve skill-relative script paths in both the executable and argv.
      const resolvedDirectory = resolveTrustedShellWorkingDirectory(context);
      const runtimeSkillsRoot = join(resolveDirectory(resolvedDirectory), '.agents', 'skills');
      const activeSkillContexts = getActiveSkillContexts(context?.messages, chatId);
      const skillOriginatedRequest = activeSkillContexts.length > 0;
      const skillResolutionOptions = {
        allowBareScriptsResolution: skillOriginatedRequest,
        activeSkillContexts,
      };
      const { resolvedCommand: validCommand, skillRoots: commandSkillRoots } = resolveSkillScriptCommand(
        command,
        runtimeSkillsRoot,
        skillResolutionOptions,
      );
      const { resolvedParameters: validParameters, skillRoots: parameterSkillRoots } = resolveSkillScriptParameters(
        rawParameters,
        runtimeSkillsRoot,
        skillResolutionOptions,
      );
      const skillRoots = [...new Set([...commandSkillRoots, ...parameterSkillRoots])];

      // Extract world and messageId from context for streaming
      const world = context?.world;
      const currentMessageId = context?.toolCallId;
      const abortSignal = context?.abortSignal as AbortSignal | undefined;
      const streamAgentName = typeof context?.agentName === 'string' && context.agentName.trim()
        ? context.agentName.trim()
        : 'assistant';
      const hasToolStreamContext = Boolean(
        world
        && chatId
        && typeof currentMessageId === 'string'
        && currentMessageId.trim()
      );
      const streamBaseMessageId = hasToolStreamContext ? String(currentMessageId).trim() : '';
      const stdoutMessageId = streamBaseMessageId ? `${streamBaseMessageId}-stdout` : '';
      const directoryValidation = validateShellDirectoryRequest(
        validation.correctedArgs.directory,
        resolvedDirectory,
        skillRoots,
      );
      if (!directoryValidation.valid) {
        throw new Error(directoryValidation.error);
      }
      const commandScopeValidation = validateResolvedCommandExecutableScope(
        validCommand,
        command,
        resolvedDirectory,
        skillRoots,
      );
      if (!commandScopeValidation.valid) {
        throw new Error(commandScopeValidation.error);
      }
      const scopeValidation = validateShellCommandScope(
        validCommand,
        validParameters,
        resolvedDirectory,
        skillRoots
      );
      if (!scopeValidation.valid) {
        throw new Error(scopeValidation.error);
      }

      const riskAssessment = classifyShellCommandRisk(validCommand, validParameters);
      if (riskAssessment.tier === 'block') {
        throw new Error(
          `Blocked dangerous operation: ${riskAssessment.reason}. This shell command cannot be executed.`
        );
      }

      // Check world-level tool permission
      const toolPermission = getEnvValueFromText(world?.variables, 'tool_permission') ?? 'auto';
      if (toolPermission === 'read') {
        const blockedResult: CommandExecutionResult = {
          executionId: 'permission-blocked',
          command: validCommand,
          parameters: validParameters,
          exitCode: null,
          signal: null,
          error: 'shell_cmd is blocked by the current permission level (read).',
          failureReason: 'validation_error',
          stdout: '',
          stderr: '',
          executedAt: new Date(),
          duration: 0,
        };
        return formatShellToolReturnContent(blockedResult, {
          llmResultMode,
          outputFormat: outputFormat === 'json' ? 'json' : 'markdown',
          outputDetail: 'minimal',
          toolCallId: typeof currentMessageId === 'string' ? currentMessageId : undefined,
          persistToolEnvelope,
          worldId: typeof world?.id === 'string' ? world.id : undefined,
        });
      }

      // At 'ask' level, every shell_cmd invocation requires HITL approval regardless of risk tier.
      if (toolPermission === 'ask' && riskAssessment.tier !== 'hitl_required') {
        if (!world) {
          throw new Error(
            'Approval required: world-level permission is "ask" but HITL approval context is unavailable.'
          );
        }
        const askApproval = await requestShellCommandRiskApproval({
          world,
          chatId: chatId ?? null,
          command: validCommand,
          parameters: validParameters,
          resolvedDirectory,
          risk: { tier: 'hitl_required', reason: 'world permission level is "ask"', tags: ['ask-permission'] },
          toolCallId: typeof currentMessageId === 'string' ? currentMessageId : undefined,
          agentName: streamAgentName,
          messages: Array.isArray(context?.messages) ? context.messages as AgentMessage[] : undefined,
        });
        if (!askApproval.approved) {
          throw new Error(
            `Command not executed: world permission is "ask" and the request was not approved (${askApproval.reason}).`
          );
        }
      }

      if (riskAssessment.tier === 'hitl_required') {
        if (!world) {
          throw new Error(
            `Approval required: command classified as ${riskAssessment.reason}. HITL approval context is unavailable.`
          );
        }

        const approval = await requestShellCommandRiskApproval({
          world,
          chatId: chatId ?? null,
          command: validCommand,
          parameters: validParameters,
          resolvedDirectory,
          risk: riskAssessment,
          toolCallId: typeof currentMessageId === 'string' ? currentMessageId : undefined,
          agentName: streamAgentName,
          messages: Array.isArray(context?.messages) ? context.messages as AgentMessage[] : undefined,
        });

        if (!approval.approved) {
          throw new Error(
            `Command not executed: approval required for ${riskAssessment.reason} and request was not approved (${approval.reason}).`
          );
        }
      }

      let stdoutStartEmitted = false;
      const emitStdoutToolStreamChunk = (chunk: string) => {
        if (!hasToolStreamContext) return;
        if (!chunk) return;
        if (!stdoutMessageId) return;
        if (!stdoutStartEmitted) {
          publishSSE(world, {
            type: 'start',
            toolName: 'shell_cmd',
            messageId: stdoutMessageId,
            agentName: streamAgentName,
            chatId
          });
          stdoutStartEmitted = true;
        }
        publishSSE(world, {
          type: 'chunk',
          toolName: 'shell_cmd',
          content: chunk,
          stream: 'stdout',
          messageId: stdoutMessageId,
          agentName: streamAgentName,
          chatId
        });
      };

      const emitStderrToolStreamChunk = (chunk: string) => {
        if (!world || !chatId || !chunk) return;
        publishSSE(world, {
          type: 'tool-stream',
          toolName: 'shell_cmd',
          content: chunk,
          stream: 'stderr',
          messageId: currentMessageId,
          agentName: 'shell_cmd',
          chatId
        });
      };

      // Execute command with tool-streaming callbacks when world context is available
      const result = await executeShellCommand(validCommand, validParameters, resolvedDirectory, {
        timeout,
        abortSignal,
        worldId: world?.id,
        chatId,
        trustedWorkingDirectory: resolvedDirectory,
        onStdout: hasToolStreamContext ? (chunk) => {
          emitStdoutToolStreamChunk(chunk);
        } : undefined,
        onStderr: world ? (chunk) => {
          emitStderrToolStreamChunk(chunk);
        } : undefined
      });

      if (isCommandExecutionCanceled(result)) {
        throw new DOMException('Shell command execution canceled by user', 'AbortError');
      }

      // Emit SSE end only. Durable completion state now comes from the final tool result.
      if (hasToolStreamContext && stdoutMessageId && stdoutStartEmitted) {
        publishSSE(world, {
          type: 'end',
          toolName: 'shell_cmd',
          messageId: stdoutMessageId,
          agentName: streamAgentName,
          chatId
        });
      }

      const validatedArtifactPaths = Array.isArray(artifactPaths)
        ? artifactPaths.filter((artifactPath: any) => typeof artifactPath === 'string')
        : [];
      const artifacts = llmResultMode === 'minimal'
        ? []
        : await collectCommandArtifacts(validatedArtifactPaths, resolvedDirectory);

      return formatShellToolReturnContent(result, {
        llmResultMode,
        outputFormat,
        outputDetail,
        toolCallId: typeof context?.toolCallId === 'string' ? context.toolCallId : undefined,
        persistToolEnvelope,
        artifacts,
        worldId: typeof context?.world?.id === 'string' ? context.world.id : undefined,
      });
    }
  };
}

/**
 * Load Skill Tool Module - Built-in tool for progressive skill instruction loading.
 *
 * Features:
 * - Exposes `load_skill` tool definition for model-visible tool catalogs
 * - Resolves skills by `skill_id` from core skill registry state
 * - Reads full SKILL.md content only on demand
 * - Enforces HITL approval before applying skill instructions in interactive runtimes
 * - Executes instruction-referenced skill scripts under validated scope checks
 * - Returns structured success, not-found, and read-error payloads
 *
 * Implementation Notes:
 * - Uses registry metadata as source of truth for lookup and skill name/description
 * - Reads file content from registry-provided source path (no directory rescans)
 * - Reuses shell tool safeguards (`validateShellCommandScope`) for script execution safety
 * - Uses generic HITL option requests for user approval (`yes_once`, `yes_in_session`, `no`)
 * - Session approvals are scoped by world/chat/skill to avoid accidental cross-session reuse
 * - Keeps payload format deterministic for stable downstream parsing
 *
 * Recent Changes:
 * - 2026-03-01: Removed minimal-check mode branch so `load_skill` always runs script/reference preflight consistently and keeps script-root execution guidance available.
 * - 2026-03-01: Relaxed execution-directive narration requirements to avoid mandatory pre-tool plan text and reduce token overhead.
 * - 2026-03-01: Added skill-description thread-through and acknowledgment-first execution directive requirements after successful `load_skill`, including unconditional pre-execution plan narration.
 * - 2026-02-28: Updated `<execution_directive>` to require concise tool-use intent text before tool calls and to allow mixed text + tool-call turns when supported by the provider.
 * - 2026-02-27: Run-scoped `load_skill` cache now stores only successful outcomes so declined/error/not-found paths remain retryable in the same run.
 * - 2026-02-27: Added run-scoped `load_skill` result caching keyed by latest user-turn marker so repeated same-skill calls are auto-suppressed across assistant/tool hops.
 * - 2026-02-27: Replaced `[load_skill:hitl]` console logs with structured category logger events (`load_skill.hitl`).
 * - 2026-02-27: Added same-turn `yes_once` approval reuse + in-flight approval dedupe so repeated/concurrent `load_skill` calls for the same skill do not spam duplicate HITL prompts.
 * - 2026-02-25: Added persisted synthetic HITL tool-call/response messages for `load_skill` approval so frontends can reconstruct prompts from memory without relying on transient event timing.
 * - 2026-02-24: Surface non-zero script exits as informational output instead of blocking errors (scripts may be CLI tools requiring args).
 * - 2026-02-24: Execute skill scripts with cwd set to trusted working directory when provided, otherwise use the skill root.
 * - 2026-02-14: Strip SKILL.md YAML front matter from injected `<instructions>` content.
 * - 2026-02-14: Omit `<active_resources>` from `load_skill` payloads when no instruction-referenced scripts are present.
 * - 2026-02-14: Added skill-level HITL gating so `load_skill` requires approval even when no script references are present.
 * - 2026-02-14: Added HITL-gated safe script execution and `<active_resources>` payload rendering.
 */

import { promises as fs, type Dirent } from 'fs';
import * as path from 'path';
import {
  getSkill,
  getSkillSourcePath,
  getSkillSourceScope,
  waitForInitialSkillSync,
} from './skill-registry.js';
import { createStorageWithWrappers } from './storage/storage-factory.js';
import {
  executeShellCommand,
  formatResultForLLM,
  validateShellCommandScope,
} from './shell-cmd-tool.js';
import {
  buildToolArtifactPreviewUrl,
  createArtifactToolPreview,
  createTextToolPreview,
  createUrlToolPreview,
  guessMediaTypeFromPath,
  parseToolExecutionEnvelopeContent,
  serializeToolExecutionEnvelope,
  type ToolPreview,
} from './tool-execution-envelope.js';
import { createCategoryLogger } from './logger.js';
import { parseSkillIdListFromEnv } from './skill-settings.js';
import { requestWorldOption, type HitlOptionResolution } from './hitl.js';
import { generateId } from './utils.js';
import { requestToolApproval } from './tool-approval.js';

const APPROVAL_OPTION_YES_ONCE = 'yes_once';
const APPROVAL_OPTION_YES_IN_SESSION = 'yes_in_session';
const APPROVAL_OPTION_NO = 'no';
const SCRIPT_TIMEOUT_MS = 120_000;
const LOAD_SKILL_RUN_RESULT_CACHE_LIMIT = 256;
const skillSessionApprovals = new Set<string>();
const skillTurnApprovals = new Set<string>();
const inFlightSkillApprovals = new Map<string, Promise<boolean>>();
const loadSkillRunResultCache = new Map<string, string>();
const inFlightLoadSkillRunResults = new Map<string, Promise<string>>();
const loggerLoadSkillHitl = createCategoryLogger('load_skill.hitl');

type LoadSkillToolContext = {
  world?: { id?: string; currentChatId?: string | null; eventEmitter?: unknown };
  chatId?: string | null;
  abortSignal?: AbortSignal;
  workingDirectory?: string;
  messages?: Array<Record<string, any>>;
  toolCallId?: string;
  agentName?: string;
  persistToolEnvelope?: boolean;
};

type LoadSkillExecutionOutcome = {
  result: string;
  cacheableForRun: boolean;
};

const LOAD_SKILL_PREVIEW_SCRIPT_OUTPUT_CHARS = 800;

class SkillScriptExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillScriptExecutionError';
  }
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildNotFoundResult(skillId: string): string {
  const escapedSkillId = escapeXmlText(skillId);
  return [
    `<skill_context id="${escapedSkillId}">`,
    '  <error>',
    `    Skill with id "${escapedSkillId}" was not found in the current registry.`,
    '  </error>',
    '</skill_context>',
  ].join('\n');
}

function buildReadErrorResult(skillId: string, message: string): string {
  const escapedSkillId = escapeXmlText(skillId);
  const escapedMessage = escapeXmlText(message);
  return [
    `<skill_context id="${escapedSkillId}">`,
    '  <error>',
    `    Failed to load SKILL.md for "${escapedSkillId}": ${escapedMessage}`,
    '  </error>',
    '</skill_context>',
  ].join('\n');
}

function buildDeclinedResult(skillId: string): string {
  const escapedSkillId = escapeXmlText(skillId);
  return [
    `<skill_context id="${escapedSkillId}">`,
    '  <error>',
    `    User declined HITL approval for skill "${escapedSkillId}". Skill instructions were not loaded.`,
    '  </error>',
    '</skill_context>',
  ].join('\n');
}

function buildDisabledBySettingsResult(skillId: string): string {
  const escapedSkillId = escapeXmlText(skillId);
  return [
    `<skill_context id="${escapedSkillId}">`,
    '  <error>',
    `    Skill "${escapedSkillId}" is disabled by current system settings and cannot be loaded.`,
    '  </error>',
    '</skill_context>',
  ].join('\n');
}

function truncatePreviewText(text: string, maxChars: number = LOAD_SKILL_PREVIEW_SCRIPT_OUTPUT_CHARS): string {
  const normalized = String(text || '').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars)}\n...[truncated ${normalized.length - maxChars} chars]`;
}

function isSkillEnabledBySettings(skillId: string): boolean {
  const includeGlobalSkills = String(process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS ?? 'true').toLowerCase() !== 'false';
  const includeProjectSkills = String(process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS ?? 'true').toLowerCase() !== 'false';
  const disabledGlobalSkillIds = parseSkillIdListFromEnv(process.env.AGENT_WORLD_DISABLED_GLOBAL_SKILLS);
  const disabledProjectSkillIds = parseSkillIdListFromEnv(process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS);

  const sourceScope = getSkillSourceScope(skillId);
  if (sourceScope === 'project') {
    if (!includeProjectSkills) return false;
    return !disabledProjectSkillIds.has(skillId);
  }

  if (!includeGlobalSkills) return false;
  return !disabledGlobalSkillIds.has(skillId);
}

function normalizeScriptPath(scriptPath: string): string {
  return scriptPath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function normalizeComparablePath(targetPath: string): string {
  const resolvedPath = path.resolve(targetPath).replace(/\\/g, '/');
  return process.platform === 'win32'
    ? resolvedPath.replace(/\/+/g, '/').replace(/\/$/, '')
    : resolvedPath.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function normalizeAbsoluteLocalPath(targetPath: string): string {
  return normalizeComparablePath(targetPath);
}

function toRootRelativePath(rootPath: string, targetPath: string): string {
  const normalizedRoot = normalizeComparablePath(rootPath);
  const normalizedTarget = normalizeComparablePath(targetPath);

  if (normalizedTarget === normalizedRoot) {
    return '';
  }

  if (normalizedTarget.startsWith(`${normalizedRoot}/`)) {
    return normalizedTarget.slice(normalizedRoot.length + 1);
  }

  return normalizedTarget.replace(/^\/+/, '');
}

function stripYamlFrontMatter(markdown: string): string {
  const frontMatterPattern = /^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/;
  return markdown.replace(frontMatterPattern, '');
}

function isPathWithinRoot(skillRoot: string, targetPath: string): boolean {
  const normalizedRoot = normalizeComparablePath(skillRoot);
  const normalizedTarget = normalizeComparablePath(targetPath);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function extractReferencedScriptPaths(markdown: string): string[] {
  const scriptSet = new Set<string>();
  const knownScriptExtensions = '(?:sh|bash|zsh|py|js|mjs|cjs|ts)';
  const scriptPathPattern = new RegExp(
    `(?:\\./)?scripts/[A-Za-z0-9_./-]+\\.${knownScriptExtensions}\\b`,
    'gi',
  );
  const commandReferencePattern = /(?:bash|sh|python3?|node)\s+([^\s'"`]+)/gi;

  for (const match of markdown.matchAll(scriptPathPattern)) {
    const scriptPath = normalizeScriptPath(match[0] || '');
    if (scriptPath) {
      scriptSet.add(scriptPath);
    }
  }

  for (const match of markdown.matchAll(commandReferencePattern)) {
    const rawPath = normalizeScriptPath(match[1] || '');
    if (!rawPath) {
      continue;
    }
    if (!new RegExp(`\\.${knownScriptExtensions}$`, 'i').test(rawPath)) {
      continue;
    }
    if (rawPath.startsWith('scripts/')) {
      scriptSet.add(rawPath);
    }
  }

  return [...scriptSet].sort((left, right) => left.localeCompare(right));
}

async function collectReferenceFiles(skillRoot: string, markdown: string): Promise<string[]> {
  const collected = new Set<string>();
  const queue: string[] = [];
  for (const folderName of ['references', 'assets']) {
    queue.push(path.join(skillRoot, folderName));
  }

  const localMarkdownPathPattern = /\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(localMarkdownPathPattern)) {
    const linkedPath = String(match[1] || '').trim();
    if (!linkedPath || linkedPath.startsWith('http://') || linkedPath.startsWith('https://')) {
      continue;
    }
    if (linkedPath.startsWith('#')) {
      continue;
    }
    const absolutePath = normalizeAbsoluteLocalPath(path.resolve(skillRoot, linkedPath));
    if (!isPathWithinRoot(skillRoot, absolutePath)) {
      continue;
    }
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isFile()) {
        collected.add(toRootRelativePath(skillRoot, absolutePath));
      }
    } catch {
      // Ignore missing links.
    }
  }

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) {
      continue;
    }
    try {
      const stat = await fs.stat(currentPath);
      if (!stat.isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true }) as Dirent[];
    } catch {
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = normalizeAbsoluteLocalPath(path.join(currentPath, entry.name));
      if (entry.isDirectory()) {
        queue.push(absolutePath);
      } else if (entry.isFile()) {
        collected.add(toRootRelativePath(skillRoot, absolutePath));
      }
    }
  }

  return [...collected].sort((left, right) => left.localeCompare(right));
}

function resolveScriptCommand(scriptPath: string): { command: string; parameters: string[] } {
  const extension = path.extname(scriptPath).toLowerCase();
  if (extension === '.py') {
    return { command: 'python3', parameters: [scriptPath] };
  }
  if (extension === '.js' || extension === '.mjs' || extension === '.cjs') {
    return { command: 'node', parameters: [scriptPath] };
  }
  if (extension === '.ts') {
    return { command: 'npx', parameters: ['tsx', scriptPath] };
  }
  return { command: 'bash', parameters: [scriptPath] };
}

function formatReferenceFilesBlock(referenceFiles: string[]): string {
  if (referenceFiles.length === 0) {
    return '(none)';
  }
  return referenceFiles.map((filePath) => `- ${filePath}`).join('\n');
}

function createSessionApprovalKey(worldId: string, chatId: string | null, skillId: string): string {
  return `${worldId}::${chatId ?? 'global'}::${skillId}`;
}

function getCurrentTurnMarker(context: LoadSkillToolContext | undefined): string | null {
  const chatId = context?.chatId ?? context?.world?.currentChatId ?? null;
  const messages = Array.isArray(context?.messages) ? context!.messages : [];
  if (!chatId || messages.length === 0) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      continue;
    }
    const messageChatId = message?.chatId ? String(message.chatId).trim() : null;
    if (messageChatId && messageChatId !== chatId) {
      continue;
    }

    const messageId = String(message?.messageId || '').trim();
    if (messageId) {
      return `msg:${messageId}`;
    }

    const createdAt = message?.createdAt ? new Date(message.createdAt) : null;
    if (createdAt && Number.isFinite(createdAt.valueOf())) {
      return `ts:${createdAt.toISOString()}`;
    }

    const content = String(message?.content || '').trim();
    if (content) {
      return `content:${content.slice(0, 80)}`;
    }

    return `idx:${index}`;
  }

  return null;
}

function createTurnApprovalKey(worldId: string, chatId: string | null, skillId: string, turnMarker: string): string {
  return `${worldId}::${chatId ?? 'global'}::${skillId}::turn::${turnMarker}`;
}

function createRunResultKey(worldId: string, chatId: string | null, skillId: string, turnMarker: string): string {
  return `${worldId}::${chatId ?? 'global'}::${skillId}::run::${turnMarker}`;
}

/**
 * Reconstruct skill approval caches from persisted message history.
 * Called during chat restore so that `yes_in_session` and `yes_once` grants
 * survive app restarts without re-prompting the user.
 *
 * Scans `role: 'tool'` messages whose JSON content contains `skillId` and
 * `optionId` fields (written by `persistLoadSkillApprovalResolutionMessage`).
 *
 * - `yes_in_session` grants are restored unconditionally (session-scoped).
 * - `yes_once` grants are restored only when they belong to the current turn
 *   (i.e. appear after the last `role: 'user'` message in the history).
 */
export function reconstructSkillApprovalsFromMessages(
  worldId: string,
  chatId: string | null,
  messages: Array<Record<string, any>>,
): number {
  if (!worldId || !Array.isArray(messages) || messages.length === 0) {
    return 0;
  }

  // Find the index of the last user message for this chat (turn boundary).
  let lastUserMessageIndex = -1;
  let turnMarker: string | null = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role !== 'user') continue;
    const msgChatId = msg?.chatId ? String(msg.chatId).trim() : null;
    if (msgChatId && msgChatId !== (chatId ?? 'global')) continue;
    lastUserMessageIndex = i;

    // Derive turn marker using same precedence as getCurrentTurnMarker.
    const messageId = String(msg?.messageId || '').trim();
    if (messageId) {
      turnMarker = `msg:${messageId}`;
    } else {
      const createdAt = msg?.createdAt ? new Date(msg.createdAt) : null;
      if (createdAt && Number.isFinite(createdAt.valueOf())) {
        turnMarker = `ts:${createdAt.toISOString()}`;
      } else {
        const content = String(msg?.content || '').trim();
        if (content) {
          turnMarker = `content:${content.slice(0, 80)}`;
        } else {
          turnMarker = `idx:${i}`;
        }
      }
    }
    break;
  }

  let restored = 0;
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (msg?.role !== 'tool') continue;

    let payload: { requestId?: string; skillId?: string; optionId?: string } | null = null;
    try {
      const content = typeof msg.content === 'string' ? msg.content : null;
      if (content) payload = JSON.parse(content);
    } catch {
      continue;
    }
    if (
      !payload
      || typeof payload.requestId !== 'string'
      || !payload.requestId.includes('load_skill_approval')
      || typeof payload.skillId !== 'string'
      || typeof payload.optionId !== 'string'
    ) {
      continue;
    }

    const { skillId, optionId } = payload;

    if (optionId === APPROVAL_OPTION_YES_IN_SESSION) {
      skillSessionApprovals.add(createSessionApprovalKey(worldId, chatId, skillId));
      restored += 1;
    } else if (optionId === APPROVAL_OPTION_YES_ONCE && turnMarker && i > lastUserMessageIndex) {
      skillTurnApprovals.add(createTurnApprovalKey(worldId, chatId, skillId, turnMarker));
      restored += 1;
    }
  }

  if (restored > 0) {
    loggerLoadSkillHitl.debug('Reconstructed skill approvals from message history', {
      worldId,
      chatId: chatId || null,
      restored,
    });
  }

  return restored;
}

/**
 * Clear cached skill approvals and run results scoped to a specific chat.
 * Must be called when messages are removed (e.g. edit+resubmit) so that
 * HITL approval prompts fire again for the reprocessed message.
 */
export function clearChatSkillApprovals(worldId: string, chatId: string | null): void {
  const chatToken = chatId ?? 'global';
  const prefix = `${worldId}::${chatToken}::`;

  for (const key of skillSessionApprovals) {
    if (key.startsWith(prefix)) {
      skillSessionApprovals.delete(key);
    }
  }
  for (const key of skillTurnApprovals) {
    if (key.startsWith(prefix)) {
      skillTurnApprovals.delete(key);
    }
  }
  for (const key of inFlightSkillApprovals.keys()) {
    if (key.includes(prefix)) {
      inFlightSkillApprovals.delete(key);
    }
  }
  for (const key of loadSkillRunResultCache.keys()) {
    if (key.startsWith(prefix)) {
      loadSkillRunResultCache.delete(key);
    }
  }
  for (const key of inFlightLoadSkillRunResults.keys()) {
    if (key.startsWith(prefix)) {
      inFlightLoadSkillRunResults.delete(key);
    }
  }
}

function getRunScopedLoadSkillResultKey(skillId: string, context: LoadSkillToolContext | undefined): string | null {
  const worldId = String(context?.world?.id || '').trim();
  if (!worldId) {
    return null;
  }
  const turnMarker = getCurrentTurnMarker(context);
  if (!turnMarker) {
    return null;
  }
  const chatId = context?.chatId ?? context?.world?.currentChatId ?? null;
  return createRunResultKey(worldId, chatId, skillId, turnMarker);
}

function rememberRunScopedLoadSkillResult(cacheKey: string, result: string): void {
  if (loadSkillRunResultCache.has(cacheKey)) {
    loadSkillRunResultCache.delete(cacheKey);
  }
  loadSkillRunResultCache.set(cacheKey, result);
  while (loadSkillRunResultCache.size > LOAD_SKILL_RUN_RESULT_CACHE_LIMIT) {
    const oldestKey = loadSkillRunResultCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    loadSkillRunResultCache.delete(oldestKey);
  }
}

function getLoadSkillApprovalRequestId(context: LoadSkillToolContext | undefined, skillId: string): string {
  const parentToolCallId = String(context?.toolCallId || '').trim();
  if (parentToolCallId) {
    return `${parentToolCallId}::load_skill_approval`;
  }
  const normalizedSkillId = String(skillId || '').trim() || 'skill';
  return `load_skill_approval::${normalizedSkillId}::${generateId()}`;
}

async function persistAgentMemoryIfAvailable(context: LoadSkillToolContext | undefined): Promise<void> {
  const worldId = String(context?.world?.id || '').trim();
  const agentName = String(context?.agentName || '').trim();
  const messages = Array.isArray(context?.messages) ? context!.messages : null;
  const world = context?.world as any;

  if (!worldId || !agentName || !messages || !world?.agents || typeof world.agents.get !== 'function') {
    return;
  }

  const agent = world.agents.get(agentName);
  if (!agent) {
    return;
  }

  const storage = await createStorageWithWrappers();
  await storage.saveAgent(worldId, agent);
}

async function persistLoadSkillApprovalPromptMessage(options: {
  context?: LoadSkillToolContext;
  requestId: string;
  skillId: string;
  scriptPaths: string[];
}): Promise<void> {
  const messages = Array.isArray(options.context?.messages) ? options.context!.messages : null;
  if (!messages) {
    return;
  }

  const existing = messages.some((message) =>
    message?.role === 'assistant'
    && Array.isArray(message?.tool_calls)
    && message.tool_calls.some((toolCall: any) => String(toolCall?.id || '').trim() === options.requestId)
  );
  if (existing) {
    return;
  }

  const question = `Skill "${options.skillId}" requested execution.${options.scriptPaths.length > 0 ? ` Referenced scripts:\n${options.scriptPaths.map((scriptPath) => `- ${scriptPath}`).join('\n')}` : ''}\n\nApprove applying this skill now?`;
  const toolArguments = {
    question,
    options: ['Yes once', 'Yes in this session', 'No'],
    defaultOption: 'No',
    metadata: {
      tool: 'human_intervention_request',
      toolCallId: options.requestId,
      source: 'load_skill',
      skillId: options.skillId,
      scriptPaths: options.scriptPaths,
    },
  };

  const chatId = options.context?.chatId ?? options.context?.world?.currentChatId ?? null;
  const agentName = String(options.context?.agentName || '').trim() || 'assistant';
  messages.push({
    role: 'assistant',
    content: `Calling tool: human_intervention_request (skill_id: "${options.skillId}")`,
    tool_calls: [{
      id: options.requestId,
      type: 'function',
      function: {
        name: 'human_intervention_request',
        arguments: JSON.stringify(toolArguments),
      },
    }],
    sender: agentName,
    createdAt: new Date(),
    chatId,
    messageId: generateId(),
    replyToMessageId: options.context?.toolCallId,
    agentId: agentName,
  });

  await persistAgentMemoryIfAvailable(options.context);
  loggerLoadSkillHitl.debug('Persisted load_skill approval tool-call message', {
    chatId: chatId || null,
    agentName,
    requestId: options.requestId,
    skillId: options.skillId,
  });
}

async function persistLoadSkillApprovalResolutionMessage(options: {
  context?: LoadSkillToolContext;
  requestId: string;
  resolution: HitlOptionResolution;
  skillId: string;
}): Promise<void> {
  const messages = Array.isArray(options.context?.messages) ? options.context!.messages : null;
  if (!messages) {
    return;
  }

  const existing = messages.some((message) =>
    message?.role === 'tool'
    && String(message?.tool_call_id || '').trim() === options.requestId
  );
  if (existing) {
    return;
  }

  const chatId = options.context?.chatId ?? options.context?.world?.currentChatId ?? null;
  const agentName = String(options.context?.agentName || '').trim() || 'assistant';
  const payload = {
    requestId: options.resolution.requestId,
    optionId: options.resolution.optionId,
    source: options.resolution.source,
    skillId: options.skillId,
  };

  messages.push({
    role: 'tool',
    content: JSON.stringify(payload),
    tool_call_id: options.requestId,
    sender: agentName,
    createdAt: new Date(),
    chatId,
    messageId: generateId(),
    agentId: agentName,
  });

  await persistAgentMemoryIfAvailable(options.context);
  loggerLoadSkillHitl.debug('Persisted load_skill approval tool-result message', {
    chatId: chatId || null,
    agentName,
    requestId: options.requestId,
    optionId: options.resolution.optionId,
  });
}

async function requestSkillExecutionApproval(options: {
  skillId: string;
  scriptPaths: string[];
  context?: LoadSkillToolContext;
}): Promise<boolean> {
  const worldContext = options.context?.world;
  const worldId = String(worldContext?.id || '').trim();
  const chatId = options.context?.chatId ?? worldContext?.currentChatId ?? null;
  const requestId = getLoadSkillApprovalRequestId(options.context, options.skillId);
  if (!worldId || !worldContext) {
    return true;
  }

  const sessionApprovalKey = createSessionApprovalKey(worldId, chatId, options.skillId);
  const turnMarker = getCurrentTurnMarker(options.context);
  const turnApprovalKey = turnMarker
    ? createTurnApprovalKey(worldId, chatId, options.skillId, turnMarker)
    : null;
  if (skillSessionApprovals.has(sessionApprovalKey)) {
    return true;
  }
  if (turnApprovalKey && skillTurnApprovals.has(turnApprovalKey)) {
    return true;
  }

  const inFlightApprovalKey = turnApprovalKey
    ? `turn::${turnApprovalKey}`
    : `session::${sessionApprovalKey}`;
  const existingInFlightApproval = inFlightSkillApprovals.get(inFlightApprovalKey);
  if (existingInFlightApproval) {
    return await existingInFlightApproval;
  }

  const approvalPromise = (async (): Promise<boolean> => {
    const scriptSummary = options.scriptPaths.length > 0
      ? `The skill references local scripts:\n${options.scriptPaths.map((scriptPath) => `- ${scriptPath}`).join('\n')}`
      : 'No instruction-referenced local scripts were detected for this skill.';

    await persistLoadSkillApprovalPromptMessage({
      context: options.context,
      requestId,
      skillId: options.skillId,
      scriptPaths: options.scriptPaths,
    });

    const approvalResult = await requestToolApproval({
      world: worldContext as any,
      requestId,
      title: `Run skill ${options.skillId}?`,
      message: [
        `Skill "${options.skillId}" requested execution.`,
        scriptSummary,
        'Approve applying this skill now?',
      ].join('\n\n'),
      chatId,
      defaultOptionId: APPROVAL_OPTION_NO,
      options: [
        { id: APPROVAL_OPTION_YES_ONCE, label: 'Yes once', description: 'Allow this skill for this call only.' },
        {
          id: APPROVAL_OPTION_YES_IN_SESSION,
          label: 'Yes in this session',
          description: 'Allow this skill for the current chat session.',
        },
        { id: APPROVAL_OPTION_NO, label: 'No', description: 'Do not apply this skill now.' },
      ],
      approvedOptionIds: [APPROVAL_OPTION_YES_ONCE, APPROVAL_OPTION_YES_IN_SESSION],
      metadata: {
        tool: 'human_intervention_request',
        toolCallId: requestId,
        source: 'load_skill',
        skillId: options.skillId,
        scriptPaths: options.scriptPaths,
      },
      agentName: options.context?.agentName ?? null,
    });

    const approval: HitlOptionResolution = {
      requestId,
      worldId,
      chatId,
      optionId: approvalResult.optionId,
      source: approvalResult.source,
    };

    await persistLoadSkillApprovalResolutionMessage({
      context: options.context,
      requestId,
      resolution: approval,
      skillId: options.skillId,
    });

    if (!approvalResult.approved) {
      return false;
    }

    if (approval.optionId === APPROVAL_OPTION_YES_IN_SESSION) {
      skillSessionApprovals.add(sessionApprovalKey);
      if (turnApprovalKey) {
        skillTurnApprovals.add(turnApprovalKey);
      }
    } else if (approval.optionId === APPROVAL_OPTION_YES_ONCE && turnApprovalKey) {
      skillTurnApprovals.add(turnApprovalKey);
    }

    return true;
  })();

  inFlightSkillApprovals.set(inFlightApprovalKey, approvalPromise);
  try {
    return await approvalPromise;
  } finally {
    const currentInFlightApproval = inFlightSkillApprovals.get(inFlightApprovalKey);
    if (currentInFlightApproval === approvalPromise) {
      inFlightSkillApprovals.delete(inFlightApprovalKey);
    }
  }
}

async function executeSkillScripts(options: {
  scriptPaths: string[];
  skillRoot: string;
  context?: LoadSkillToolContext;
}): Promise<Array<{ source: string; output: string }>> {
  const scriptPaths = options.scriptPaths;
  if (scriptPaths.length === 0) {
    return [];
  }

  const worldId = String(options.context?.world?.id || '').trim();
  const chatId = options.context?.chatId ?? options.context?.world?.currentChatId ?? null;
  const executionDirectory = options.context?.workingDirectory || options.skillRoot;

  if (!worldId || !options.context?.world) {
    return [{
      source: 'approval',
      output: 'HITL approval channel is unavailable in this runtime. Script execution skipped.',
    }];
  }

  const scriptOutputs: Array<{ source: string; output: string }> = [];

  for (const referencedScript of scriptPaths) {
    const scriptPath = normalizeScriptPath(referencedScript);
    const absoluteScriptPath = path.resolve(options.skillRoot, scriptPath);

    if (!isPathWithinRoot(options.skillRoot, absoluteScriptPath)) {
      scriptOutputs.push({
        source: scriptPath,
        output: `Script path rejected: "${scriptPath}" resolves outside skill root.`,
      });
      continue;
    }

    try {
      const scriptStat = await fs.stat(absoluteScriptPath);
      if (!scriptStat.isFile()) {
        scriptOutputs.push({
          source: scriptPath,
          output: `Script path is not a file: "${scriptPath}"`,
        });
        continue;
      }
    } catch {
      scriptOutputs.push({
        source: scriptPath,
        output: `Script not found: "${scriptPath}"`,
      });
      continue;
    }

    const normalizedRootPath = path.resolve(options.skillRoot).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
    const normalizedAbsoluteScriptPath = path.resolve(absoluteScriptPath).replace(/\\/g, '/').replace(/\/+/g, '/');
    const relativeScriptPath = normalizedAbsoluteScriptPath.startsWith(`${normalizedRootPath}/`)
      ? normalizedAbsoluteScriptPath.slice(normalizedRootPath.length + 1)
      : path.relative(options.skillRoot, absoluteScriptPath).replace(/\\/g, '/');
    const relativeCommandPath = normalizeScriptPath(relativeScriptPath);
    const relativeCommandSpec = resolveScriptCommand(relativeCommandPath);
    const scopeValidation = validateShellCommandScope(
      relativeCommandSpec.command,
      relativeCommandSpec.parameters,
      options.skillRoot,
    );
    if (!scopeValidation.valid) {
      scriptOutputs.push({
        source: relativeScriptPath,
        output: scopeValidation.error,
      });
      continue;
    }

    const absoluteCommandSpec = resolveScriptCommand(normalizedAbsoluteScriptPath);
    const executionResult = await executeShellCommand(
      absoluteCommandSpec.command,
      absoluteCommandSpec.parameters,
      executionDirectory,
      {
        timeout: SCRIPT_TIMEOUT_MS,
        abortSignal: options.context?.abortSignal,
        worldId,
        chatId: chatId ?? undefined,
        trustedWorkingDirectory: executionDirectory,
      },
    );

    if (executionResult.exitCode !== 0 || executionResult.error) {
      const exitCode = executionResult.exitCode === null ? 'unknown' : String(executionResult.exitCode);
      const stderr = executionResult.stderr.trim();
      const stdoutPreview = executionResult.stdout.trim();
      const detail = [
        `exit code ${exitCode}`,
        stderr ? `stderr: ${stderr}` : '',
        stdoutPreview ? `stdout: ${stdoutPreview}` : '',
      ].filter(Boolean).join(' | ');
      scriptOutputs.push({
        source: relativeScriptPath,
        output: `Script exited with ${detail}`,
      });
      continue;
    }

    scriptOutputs.push({
      source: relativeScriptPath,
      output: formatResultForLLM(executionResult),
    });
  }

  return scriptOutputs;
}

function isYouTubeUrl(value: string): boolean {
  return /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(String(value || ''));
}

function extractUrlsFromText(text: string): string[] {
  const matches = String(text || '').match(/https?:\/\/[^\s)>\]}]+/gi) || [];
  return [...new Set(matches.map((match) => match.replace(/[),.;!?]+$/g, '')))];
}

function extractArtifactPathCandidates(text: string): string[] {
  const matches = String(text || '').match(/(?:\/[^\s"'`<>]+|\.[/\\][^\s"'`<>]+|[A-Za-z0-9_.-]+\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a|mp4|webm|mov|md|txt))/gi) || [];
  return [...new Set(matches)];
}

async function resolvePreviewArtifactFromCandidate(
  candidate: string,
  roots: string[],
  options: { worldId?: string | null } = {},
): Promise<ToolPreview | null> {
  const normalizedCandidate = String(candidate || '').trim();
  if (!normalizedCandidate) {
    return null;
  }

  for (const root of roots) {
    const absolutePath = path.isAbsolute(normalizedCandidate)
      ? normalizeAbsoluteLocalPath(normalizedCandidate)
      : normalizeAbsoluteLocalPath(path.resolve(root, normalizedCandidate));
    const isAllowedPath = roots.some((allowedRoot) => isPathWithinRoot(allowedRoot, absolutePath));
    if (!isAllowedPath) {
      continue;
    }
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        continue;
      }

      const mediaType = guessMediaTypeFromPath(absolutePath);
      return createArtifactToolPreview({
        path: absolutePath,
        bytes: stat.size,
        media_type: mediaType,
        display_name: path.basename(absolutePath),
        url: buildToolArtifactPreviewUrl({ path: absolutePath, worldId: options.worldId }),
      });
    } catch {
      continue;
    }
  }

  return null;
}

async function collectLoadSkillPreviewArtifacts(options: {
  skillRoot: string;
  referenceFiles: string[];
  scriptOutputs: Array<{ source: string; output: string }>;
  context?: LoadSkillToolContext;
}): Promise<ToolPreview[]> {
  const previews: ToolPreview[] = [];
  const seen = new Set<string>();
  const roots = [
    options.skillRoot,
    ...(options.context?.workingDirectory ? [options.context.workingDirectory] : []),
  ];

  for (const referenceFile of options.referenceFiles) {
    const absolutePath = path.isAbsolute(referenceFile)
      ? normalizeAbsoluteLocalPath(referenceFile)
      : normalizeAbsoluteLocalPath(path.resolve(options.skillRoot, referenceFile));
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        continue;
      }

      const key = `path:${absolutePath}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      previews.push(createArtifactToolPreview({
        path: absolutePath,
        bytes: stat.size,
        media_type: guessMediaTypeFromPath(absolutePath),
        display_name: path.basename(referenceFile),
        title: referenceFile,
        url: buildToolArtifactPreviewUrl({
          path: absolutePath,
          worldId: typeof options.context?.world?.id === 'string' ? options.context.world.id : undefined,
        }),
      }));
    } catch {
      continue;
    }
  }

  for (const output of options.scriptOutputs) {
    for (const url of extractUrlsFromText(output.output)) {
      const key = `url:${url}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      previews.push(createUrlToolPreview(url, {
        renderer: isYouTubeUrl(url) ? 'youtube' : undefined,
        text: output.source,
        title: output.source,
      }));
    }

    for (const candidate of extractArtifactPathCandidates(output.output)) {
      const preview = await resolvePreviewArtifactFromCandidate(candidate, roots, {
        worldId: typeof options.context?.world?.id === 'string' ? options.context.world.id : undefined,
      });
      if (!preview) {
        continue;
      }

      if (!('artifact' in preview)) {
        continue;
      }
      const key = `artifact:${JSON.stringify((preview as any).artifact)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      previews.push(preview as any);
    }
  }

  return previews;
}

async function buildLoadSkillSuccessPreview(options: {
  skillId: string;
  skillDescription: string;
  skillRoot: string;
  scriptOutputs: Array<{ source: string; output: string }>;
  referenceFiles: string[];
  scriptPaths: string[];
  context?: LoadSkillToolContext;
}): Promise<ToolPreview[]> {
  const summaryLines = [
    `Loaded skill \`${options.skillId}\`.`,
    '',
    `${options.skillDescription}`,
    '',
    `Referenced scripts: ${options.scriptPaths.length > 0 ? options.scriptPaths.join(', ') : '(none)'}`,
    `Reference files: ${options.referenceFiles.length > 0 ? options.referenceFiles.join(', ') : '(none)'}`,
  ];

  if (options.scriptOutputs.length > 0) {
    summaryLines.push('');
    summaryLines.push('Script outputs:');
    for (const scriptOutput of options.scriptOutputs) {
      summaryLines.push(`- ${scriptOutput.source}: ${truncatePreviewText(scriptOutput.output)}`);
    }
  }

  const previews: ToolPreview[] = [
    createTextToolPreview(summaryLines.join('\n'), {
      markdown: true,
      title: `load_skill ${options.skillId}`,
    }),
  ];

  previews.push(...await collectLoadSkillPreviewArtifacts(options));
  return previews;
}

function wrapLoadSkillToolResult(options: {
  result: string;
  preview: ToolPreview | ToolPreview[] | null;
  toolCallId?: string;
}): string {
  return serializeToolExecutionEnvelope({
    __type: 'tool_execution_envelope',
    version: 1,
    tool: 'load_skill',
    ...(options.toolCallId ? { tool_call_id: options.toolCallId } : {}),
    status: /<error>/i.test(options.result) ? 'failed' : 'completed',
    preview: options.preview,
    result: options.result,
  });
}

function buildSuccessResult(options: {
  skillId: string;
  skillName: string;
  skillDescription: string;
  skillRoot: string;
  markdown: string;
  scriptOutputs: Array<{ source: string; output: string }>;
  referenceFiles: string[];
  scriptPaths: string[];
}): string {
  const {
    skillId,
    skillName,
    skillDescription,
    skillRoot,
    markdown,
    scriptOutputs,
    referenceFiles,
    scriptPaths,
  } = options;
  const escapedSkillId = escapeXmlText(skillId);
  const escapedSkillName = escapeXmlText(skillName);
  const escapedSkillDescription = escapeXmlText(skillDescription);
  const hasActiveResources = scriptOutputs.length > 0;
  const scriptBlocks = scriptOutputs.flatMap((scriptOutput) => ([
    `    <script_output source="${escapeXmlText(scriptOutput.source)}">`,
    `${escapeXmlText(scriptOutput.output)}`,
    '    </script_output>',
  ]));
  const referenceFilesBlock = escapeXmlText(formatReferenceFilesBlock(referenceFiles));

  const activeResourcesBlock = hasActiveResources
    ? [
      '  <active_resources>',
      ...scriptBlocks,
      '',
      '    <reference_files>',
      referenceFilesBlock,
      '    </reference_files>',
      '  </active_resources>',
      '',
    ]
    : [];

  const hasReferencedScripts = scriptPaths.length > 0;
  const executionDirective = [
    '  <execution_directive>',
    `    You are now operating under the specialized ${escapedSkillName} protocol.`,
    `    Skill purpose: ${escapedSkillDescription}`,
    '    1. Acknowledge which skill was loaded and apply it directly to the user request.',
    '    2. Prioritize the logic in <instructions> over generic behavior.',
    hasActiveResources
      ? '    3. Use the data in <active_resources> to complete the user\'s specific request.'
      : '    3. Use the skill instructions to complete the user\'s specific request.',
    '    4. Execute required steps directly; avoid unnecessary planning narration unless the user explicitly asks for a plan.',
    '    5. Keep tool-related assistant text concise and result-focused.',
    ...(hasReferencedScripts
      ? [`    6. Scripts referenced in <instructions> are located at skill root: ${escapeXmlText(skillRoot)}. When invoking them via shell commands, construct the absolute path (e.g., ${escapeXmlText(skillRoot)}/scripts/example.py) since they may not be accessible via relative paths from the project directory.`]
      : []),
    '  </execution_directive>',
  ];

  return [
    `<skill_context id="${escapedSkillId}">`,
    '  <instructions>',
    markdown,
    '  </instructions>',
    '',
    ...activeResourcesBlock,
    ...executionDirective,
    '</skill_context>',
  ].join('\n');
}

export function createLoadSkillToolDefinition() {
  return {
    description:
      'Load full SKILL.md instructions by skill_id from the skill registry. Use this when a request matches a listed skill. After loading, apply the skill instructions directly to the user request.',
    parameters: {
      type: 'object',
      properties: {
        skill_id: {
          type: 'string',
          description: 'Skill ID from <available_skills>/<id> in the system prompt.',
        },
      },
      required: ['skill_id'],
      additionalProperties: false,
    },
    execute: async (args: any, _sequenceId?: string, _parentToolCall?: string, context?: LoadSkillToolContext) => {
      await waitForInitialSkillSync();
      const persistToolEnvelope = context?.persistToolEnvelope === true;
      const toolCallId = typeof context?.toolCallId === 'string' ? context.toolCallId : undefined;

      const requestedSkillId = typeof args?.skill_id === 'string' ? args.skill_id.trim() : '';
      if (!requestedSkillId) {
        const result = buildReadErrorResult('', 'Missing required parameter: skill_id');
        return persistToolEnvelope
          ? wrapLoadSkillToolResult({
            result,
            preview: createTextToolPreview('Missing required parameter: skill_id'),
            toolCallId,
          })
          : result;
      }

      const runScopedResultKey = getRunScopedLoadSkillResultKey(requestedSkillId, context);
      if (runScopedResultKey) {
        const cachedResult = loadSkillRunResultCache.get(runScopedResultKey);
        if (cachedResult !== undefined) {
          loggerLoadSkillHitl.debug('Returning cached run-scoped load_skill result', {
            skillId: requestedSkillId,
            runScopedResultKey,
          });
          return cachedResult;
        }
        const inFlightResult = inFlightLoadSkillRunResults.get(runScopedResultKey);
        if (inFlightResult) {
          return await inFlightResult;
        }
      }

      const computeResult = async (): Promise<LoadSkillExecutionOutcome> => {
        const entry = getSkill(requestedSkillId);
        const sourcePath = getSkillSourcePath(requestedSkillId);
        if (!entry || !sourcePath) {
          const result = buildNotFoundResult(requestedSkillId);
          return {
            result,
            cacheableForRun: false,
          };
        }

        if (!isSkillEnabledBySettings(requestedSkillId)) {
          const result = buildDisabledBySettingsResult(requestedSkillId);
          return {
            result,
            cacheableForRun: false,
          };
        }

        try {
          const markdown = await fs.readFile(sourcePath, 'utf8');
          const instructionsMarkdown = stripYamlFrontMatter(markdown);
          const skillRoot = path.dirname(sourcePath);
          const scriptPaths = extractReferencedScriptPaths(instructionsMarkdown);
          const isApproved = await requestSkillExecutionApproval({
            skillId: requestedSkillId,
            scriptPaths,
            context,
          });
          if (!isApproved) {
            const result = buildDeclinedResult(requestedSkillId);
            return {
              result,
              cacheableForRun: false,
            };
          }
          const scriptOutputs = await executeSkillScripts({
            scriptPaths,
            skillRoot,
            context,
          });
          const referenceFiles = await collectReferenceFiles(skillRoot, instructionsMarkdown);
          const result = buildSuccessResult({
            skillId: requestedSkillId,
            skillName: entry.skill_id,
            skillDescription: entry.description?.trim() || entry.skill_id,
            skillRoot,
            markdown: instructionsMarkdown,
            scriptOutputs,
            referenceFiles,
            scriptPaths,
          });

          if (!persistToolEnvelope) {
            return {
              result,
              cacheableForRun: true,
            };
          }

          const preview = await buildLoadSkillSuccessPreview({
            skillId: requestedSkillId,
            skillDescription: entry.description?.trim() || entry.skill_id,
            skillRoot,
            scriptOutputs,
            referenceFiles,
            scriptPaths,
            context,
          });
          return {
            result: wrapLoadSkillToolResult({
              result,
              preview,
              toolCallId,
            }),
            cacheableForRun: true,
          };
        } catch (error) {
          if (error instanceof SkillScriptExecutionError) {
            throw error;
          }
          const message = error instanceof Error ? error.message : String(error);
          const result = buildReadErrorResult(requestedSkillId, message);
          return {
            result: persistToolEnvelope
              ? wrapLoadSkillToolResult({
                result,
                preview: createTextToolPreview(message),
                toolCallId,
              })
              : result,
            cacheableForRun: false,
          };
        }
      };

      if (!runScopedResultKey) {
        const outcome = await computeResult();
        if (persistToolEnvelope && !parseToolExecutionEnvelopeContent(outcome.result)) {
          return wrapLoadSkillToolResult({
            result: outcome.result,
            preview: createTextToolPreview(truncatePreviewText(outcome.result, 1600)),
            toolCallId,
          });
        }
        return outcome.result;
      }

      const runScopedPromise = computeResult().then((outcome) => {
        if (outcome.cacheableForRun) {
          rememberRunScopedLoadSkillResult(runScopedResultKey, outcome.result);
        }
        return outcome.result;
      });
      inFlightLoadSkillRunResults.set(runScopedResultKey, runScopedPromise);
      try {
        const result = await runScopedPromise;
        if (persistToolEnvelope && !parseToolExecutionEnvelopeContent(result)) {
          return wrapLoadSkillToolResult({
            result,
            preview: createTextToolPreview(truncatePreviewText(result, 1600)),
            toolCallId,
          });
        }
        return result;
      } finally {
        const inFlightResult = inFlightLoadSkillRunResults.get(runScopedResultKey);
        if (inFlightResult === runScopedPromise) {
          inFlightLoadSkillRunResults.delete(runScopedResultKey);
        }
      }
    },
  };
}

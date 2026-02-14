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
  waitForInitialSkillSync,
} from './skill-registry.js';
import {
  executeShellCommand,
  formatResultForLLM,
  validateShellCommandScope,
} from './shell-cmd-tool.js';
import { requestWorldOption } from './hitl.js';

const APPROVAL_OPTION_YES_ONCE = 'yes_once';
const APPROVAL_OPTION_YES_IN_SESSION = 'yes_in_session';
const APPROVAL_OPTION_NO = 'no';
const SCRIPT_TIMEOUT_MS = 120_000;
const skillSessionApprovals = new Set<string>();

type LoadSkillToolContext = {
  world?: { id?: string; currentChatId?: string | null; eventEmitter?: unknown };
  chatId?: string | null;
  abortSignal?: AbortSignal;
};

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

function normalizeScriptPath(scriptPath: string): string {
  return scriptPath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function stripYamlFrontMatter(markdown: string): string {
  const frontMatterPattern = /^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/;
  return markdown.replace(frontMatterPattern, '');
}

function isPathWithinRoot(skillRoot: string, targetPath: string): boolean {
  const normalize = (value: string): string =>
    path.resolve(value).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  const normalizedRoot = normalize(skillRoot);
  const normalizedTarget = normalize(targetPath);
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
    const absolutePath = path.resolve(skillRoot, linkedPath);
    if (!isPathWithinRoot(skillRoot, absolutePath)) {
      continue;
    }
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isFile()) {
        collected.add(path.relative(skillRoot, absolutePath).replace(/\\/g, '/'));
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
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
      } else if (entry.isFile()) {
        collected.add(path.relative(skillRoot, absolutePath).replace(/\\/g, '/'));
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

async function requestSkillExecutionApproval(options: {
  skillId: string;
  scriptPaths: string[];
  context?: LoadSkillToolContext;
}): Promise<boolean> {
  const worldId = String(options.context?.world?.id || '').trim();
  const chatId = options.context?.chatId ?? options.context?.world?.currentChatId ?? null;
  if (!worldId || !options.context?.world) {
    return true;
  }

  const sessionApprovalKey = createSessionApprovalKey(worldId, chatId, options.skillId);
  if (skillSessionApprovals.has(sessionApprovalKey)) {
    return true;
  }

  const scriptSummary = options.scriptPaths.length > 0
    ? `The skill references local scripts:\n${options.scriptPaths.map((scriptPath) => `- ${scriptPath}`).join('\n')}`
    : 'No instruction-referenced local scripts were detected for this skill.';

  const approval = await requestWorldOption(options.context.world as any, {
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
    metadata: { skillId: options.skillId, scriptPaths: options.scriptPaths },
  });

  if (approval.optionId === APPROVAL_OPTION_NO) {
    return false;
  }

  if (approval.optionId === APPROVAL_OPTION_YES_IN_SESSION) {
    skillSessionApprovals.add(sessionApprovalKey);
  }

  return true;
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
    const commandScriptPath = normalizeScriptPath(relativeScriptPath);
    const commandSpec = resolveScriptCommand(commandScriptPath);
    const scopeValidation = validateShellCommandScope(
      commandSpec.command,
      commandSpec.parameters,
      options.skillRoot,
    );
    if (!scopeValidation.valid) {
      scriptOutputs.push({
        source: relativeScriptPath,
        output: scopeValidation.error,
      });
      continue;
    }

    const executionResult = await executeShellCommand(
      commandSpec.command,
      commandSpec.parameters,
      options.skillRoot,
      {
        timeout: SCRIPT_TIMEOUT_MS,
        abortSignal: options.context?.abortSignal,
        worldId,
        chatId: chatId ?? undefined,
      },
    );
    scriptOutputs.push({
      source: relativeScriptPath,
      output: formatResultForLLM(executionResult),
    });
  }

  return scriptOutputs;
}

function buildSuccessResult(options: {
  skillId: string;
  skillName: string;
  markdown: string;
  scriptOutputs: Array<{ source: string; output: string }>;
  referenceFiles: string[];
}): string {
  const { skillId, skillName, markdown, scriptOutputs, referenceFiles } = options;
  const escapedSkillId = escapeXmlText(skillId);
  const escapedSkillName = escapeXmlText(skillName);
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

  const executionDirective = [
    '  <execution_directive>',
    `    You are now operating under the specialized ${escapedSkillName} protocol.`,
    '    1. Prioritize the logic in <instructions> over generic behavior.',
    hasActiveResources
      ? '    2. Use the data in <active_resources> to complete the user\'s specific request.'
      : '    2. Use the skill instructions to complete the user\'s specific request.',
    '    3. If the workflow is multi-step, explicitly state your plan before executing.',
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
      'Load full SKILL.md instructions by skill_id from the skill registry. Use this when a request matches a listed skill.',
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

      const requestedSkillId = typeof args?.skill_id === 'string' ? args.skill_id.trim() : '';
      if (!requestedSkillId) {
        return buildReadErrorResult('', 'Missing required parameter: skill_id');
      }

      const entry = getSkill(requestedSkillId);
      const sourcePath = getSkillSourcePath(requestedSkillId);
      if (!entry || !sourcePath) {
        return buildNotFoundResult(requestedSkillId);
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
          return buildDeclinedResult(requestedSkillId);
        }
        const scriptOutputs = await executeSkillScripts({
          scriptPaths,
          skillRoot,
          context,
        });
        const referenceFiles = await collectReferenceFiles(skillRoot, instructionsMarkdown);
        return buildSuccessResult({
          skillId: requestedSkillId,
          skillName: entry.skill_id,
          markdown: instructionsMarkdown,
          scriptOutputs,
          referenceFiles,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return buildReadErrorResult(requestedSkillId, message);
      }
    },
  };
}

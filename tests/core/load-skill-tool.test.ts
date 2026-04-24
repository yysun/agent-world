/**
 * load_skill Tool Tests
 *
 * Purpose:
 * - Validate progressive skill loading tool behavior for success and failure paths.
 *
 * Features tested:
 * - Loads full SKILL.md content by `skill_id` from registry-provided source path
 * - Requires HITL approval before applying skill instructions in world/chat contexts
 * - Preserves referenced-script guidance without auto-executing scripts during skill load
 * - Returns structured not-found output for unknown IDs
 * - Returns structured read-error output when SKILL.md cannot be read
 *
 * Implementation notes:
 * - Uses mocked registry APIs for deterministic lookup behavior
 * - Uses mocked in-memory fs APIs only (no filesystem access)
 *
 * Recent changes:
 * - 2026-03-22: Updated assertions for preview-free `load_skill` envelopes and
 *   reduced `<active_resources>` metadata (`skill_root` only).
 * - 2026-03-22: Updated coverage for the pure-load contract so `load_skill` no longer
 *   auto-executes referenced scripts or emits script-output active resources.
 * - 2026-03-21: Added durable mixed-artifact preview coverage for markdown, HTML bundles, and PDF outputs from skill scripts.
 * - 2026-03-01: Removed minimal-check mode assertions and updated coverage so load_skill always performs script/reference preflight.
 * - 2026-03-01: Added assertions for acknowledgment-first execution directive steps and regression coverage for empty-description fallback to skill ID.
 * - 2026-02-24: Updated coverage: non-zero exits surface as informational output (not blocking errors).
 * - 2026-02-24: Updated coverage to verify skill scripts execute with cwd = skill root directory (not project cwd).
 * - 2026-02-14: Added coverage ensuring SKILL.md YAML front matter is stripped from injected `<instructions>`.
 * - 2026-02-14: Added coverage ensuring `<active_resources>` is omitted when no instruction-referenced scripts are present.
 * - 2026-02-14: Added coverage for skill-level HITL gating when skills have no local script references.
 * - 2026-02-14: Added HITL approval + script execution coverage for `load_skill` active resource outputs.
 * - 2026-04-24: Retargeted execution coverage to the host-semantics entrypoint after deleting the dead public factory wrapper.
 * - 2026-02-14: Added initial unit coverage for `load_skill` host semantics.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fsModule from 'fs';
import {
  clearChatSkillApprovals,
  executeLoadSkillWithHostSemantics,
  reconstructSkillApprovalsFromMessages,
} from '../../core/load-skill-tool.js';
import { requestWorldOption } from '../../core/hitl.js';
import { parseToolExecutionEnvelopeContent } from '../../core/tool-execution-envelope.js';
import {
  executeShellCommand,
  formatResultForLLM,
  validateShellCommandScope,
} from '../../core/shell-cmd-tool.js';
import {
  getSkill,
  getSkillSourcePath,
  getSkillSourceScope,
  waitForInitialSkillSync,
} from '../../core/skill-registry.js';

vi.mock('../../core/skill-registry.js', () => ({
  getSkill: vi.fn(),
  getSkillSourcePath: vi.fn(),
  getSkillSourceScope: vi.fn(() => 'global'),
  waitForInitialSkillSync: vi.fn(async () => ({
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    total: 0,
  })),
}));
vi.mock('../../core/hitl.js', () => ({
  requestWorldOption: vi.fn(async () => ({
    worldId: 'world-1',
    requestId: 'req-1',
    chatId: 'chat-1',
    optionId: 'yes_once',
    source: 'user',
  })),
}));
vi.mock('../../core/shell-cmd-tool.js', () => ({
  executeShellCommand: vi.fn(async () => ({
    executionId: 'exec-1',
    command: 'bash',
    parameters: ['scripts/build.sh'],
    stdout: 'script ok',
    stderr: '',
    exitCode: 0,
    signal: null,
    executedAt: new Date('2026-02-14T12:00:00.000Z'),
    duration: 12,
  })),
  formatResultForLLM: vi.fn(() => 'formatted script output'),
  validateShellCommandScope: vi.fn(() => ({ valid: true })),
}));

function createLoadSkillToolSubject() {
  return {
    execute: async (args: any, _sequenceId?: string, _parentToolCall?: string, context?: any) =>
      await executeLoadSkillWithHostSemantics(args, context),
  };
}

const fs = vi.mocked(fsModule.promises);
const mockedGetSkill = vi.mocked(getSkill);
const mockedGetSkillSourcePath = vi.mocked(getSkillSourcePath);
const mockedGetSkillSourceScope = vi.mocked(getSkillSourceScope);
const mockedWaitForInitialSkillSync = vi.mocked(waitForInitialSkillSync);
const mockedRequestWorldOption = vi.mocked(requestWorldOption);
const mockedExecuteShellCommand = vi.mocked(executeShellCommand);
const mockedFormatResultForLLM = vi.mocked(formatResultForLLM);
const mockedValidateShellCommandScope = vi.mocked(validateShellCommandScope);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMockCallCount(mockFn: { mock: { calls: unknown[] } }, count: number, timeoutMs = 200): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (mockFn.mock.calls.length >= count) {
      return;
    }
    await delay(10);
  }
}

function createInteractiveWorld(
  toolPermission: 'read' | 'ask' | 'auto' = 'auto',
): { id: string; currentChatId: string; variables?: string; eventEmitter: { emit: ReturnType<typeof vi.fn> } } {
  return {
    id: 'world-1',
    currentChatId: 'chat-1',
    ...(toolPermission === 'auto' ? {} : { variables: `tool_permission=${toolPermission}` }),
    eventEmitter: { emit: vi.fn() },
  };
}

describe('core/load-skill-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const fsAny = fs as any;
    if (!fsAny.stat) {
      fsAny.stat = vi.fn();
    }
    if (!fsAny.readdir) {
      fsAny.readdir = vi.fn();
    }
    vi.mocked(fsAny.stat).mockRejectedValue(new Error('ENOENT'));
    vi.mocked(fsAny.readdir).mockResolvedValue([]);
    mockedWaitForInitialSkillSync.mockResolvedValue({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      total: 1,
    });
    mockedRequestWorldOption.mockResolvedValue({
      worldId: 'world-1',
      requestId: 'req-1',
      chatId: 'chat-1',
      optionId: 'yes_once',
      source: 'user',
    });
    mockedValidateShellCommandScope.mockReturnValue({ valid: true });
    mockedFormatResultForLLM.mockReturnValue('formatted script output');
    mockedGetSkillSourceScope.mockReturnValue('global');

    delete process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS;
    delete process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS;
    delete process.env.AGENT_WORLD_DISABLED_GLOBAL_SKILLS;
    delete process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS;
    delete process.env.AGENT_WORLD_LOAD_SKILL_MINIMAL_CHECK_MODE;
  });

  it('returns skill context with full SKILL.md content when skill exists', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# PDF Extraction Instructions\n1. Use tool X...\n' as any);

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute({ skill_id: 'pdf-extract' });

    expect(mockedWaitForInitialSkillSync).toHaveBeenCalledTimes(1);
    expect(fs.readFile).toHaveBeenCalledWith('/skills/pdf-extract/SKILL.md', 'utf8');
    expect(result).toContain('<skill_context id="pdf-extract">');
    expect(result).toContain('<instructions>');
    expect(result).toContain('# PDF Extraction Instructions');
    expect(result).toContain('<active_resources>');
    expect(result).toContain('<skill_root>/skills/pdf-extract</skill_root>');
    expect(result).toContain('<execution_directive>');
    expect(result).toContain('The skill "pdf-extract" is now loaded for this turn.');
    expect(result).toContain('Apply <instructions> as specialized task guidance for the current user request.');
    expect(result).toContain('Follow the skill only insofar as it is relevant to the user\'s request.');
    expect(result).toContain('Continue the task directly; do not stop merely to report that the skill was loaded.');
    expect(result).toContain('Use shell_cmd only when execution is actually required by the skill or task.');
    expect(result).toContain('Any script execution must use paths under <skill_root> and remain within runtime safety constraints.');
    expect(result).toContain('Keep any tool-related narration brief and result-focused.');
  });

  it('uses the real skill id in the execution directive when description is empty', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: '   ',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# PDF Extraction Instructions\n1. Use tool X...\n' as any);

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute({ skill_id: 'pdf-extract' });

    expect(result).toContain('The skill "pdf-extract" is now loaded for this turn.');
  });

  it('omits preview and display_content for persisted load_skill envelopes', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue(
      '# PDF Extraction Instructions\nSee [Rendered score](assets/score.svg)\n' as any,
    );
    vi.mocked((fs as any).stat).mockImplementation(async (targetPath: string) => {
      if (String(targetPath).endsWith('/skills/pdf-extract/assets/score.svg')) {
        return { isFile: () => true, isDirectory: () => false, size: 321 };
      }
      throw new Error('ENOENT');
    });

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1', eventEmitter: { emit: vi.fn() } },
        chatId: 'chat-1',
        workingDirectory: '/skills/pdf-extract',
        persistToolEnvelope: true,
      },
    );

    const envelope = parseToolExecutionEnvelopeContent(String(result));

    expect(envelope?.tool).toBe('load_skill');
    expect(envelope?.preview).toBeNull();
    expect(envelope?.display_content).toBeUndefined();
  });

  it('persists only canonical load_skill result content without previews', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockImplementation(async (targetPath: any) => {
      const normalizedTarget = String(targetPath);
      if (normalizedTarget.endsWith('/skills/pdf-extract/SKILL.md')) {
        return [
          '# PDF Extraction Instructions',
          '[Notes](out/notes.md)',
          '[Preview](out/index.html)',
          '[Report](out/report.pdf)',
          'Run `scripts/build.sh` before processing.',
        ].join('\n') as any;
      }
      if (normalizedTarget.endsWith('/skills/pdf-extract/out/notes.md')) {
        return '# Generated Notes\n\nThis is a rendered markdown summary.' as any;
      }
      if (normalizedTarget.endsWith('/skills/pdf-extract/out/index.html')) {
        return '<html><head><script src="./app.js"></script><link rel="stylesheet" href="./styles.css"></head><body>ready</body></html>' as any;
      }
      throw new Error(`ENOENT: ${normalizedTarget}`);
    });
    vi.mocked((fs as any).stat).mockImplementation(async (targetPath: string) => {
      const normalizedTarget = String(targetPath);
      if (normalizedTarget.endsWith('/skills/pdf-extract/scripts/build.sh')) {
        return { isFile: () => true, isDirectory: () => false, size: 12 };
      }
      if (normalizedTarget.endsWith('/skills/pdf-extract/out/notes.md')) {
        return { isFile: () => true, isDirectory: () => false, size: 128 };
      }
      if (normalizedTarget.endsWith('/skills/pdf-extract/out/index.html')) {
        return { isFile: () => true, isDirectory: () => false, size: 256 };
      }
      if (normalizedTarget.endsWith('/skills/pdf-extract/out/app.js')) {
        return { isFile: () => true, isDirectory: () => false, size: 64 };
      }
      if (normalizedTarget.endsWith('/skills/pdf-extract/out/styles.css')) {
        return { isFile: () => true, isDirectory: () => false, size: 48 };
      }
      if (normalizedTarget.endsWith('/skills/pdf-extract/out/report.pdf')) {
        return { isFile: () => true, isDirectory: () => false, size: 512 };
      }
      throw new Error(`ENOENT: ${normalizedTarget}`);
    });
    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1', eventEmitter: { emit: vi.fn() } },
        chatId: 'chat-1',
        workingDirectory: '/skills/pdf-extract',
        persistToolEnvelope: true,
      },
    );

    const envelope = parseToolExecutionEnvelopeContent(String(result));
    const resultText = String(envelope?.result || '');

    expect(envelope?.tool).toBe('load_skill');
    expect(envelope?.preview).toBeNull();
    expect(envelope?.display_content).toBeUndefined();
    expect(resultText).toContain('<active_resources>');
    expect(resultText).toContain('<skill_root>/skills/pdf-extract</skill_root>');
    expect(resultText).not.toContain('<reference_files>');
    expect(resultText).not.toContain('<script_manifest>');
    expect(resultText).not.toContain('<script_output');
    expect(resultText).not.toContain('Script outputs:');
    expect(mockedExecuteShellCommand).not.toHaveBeenCalled();
  });

  it('requires an explicit chatId for interactive load_skill approval', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# PDF Extraction Instructions\n1. Use tool X...\n' as any);

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1', eventEmitter: { emit: vi.fn() } },
      },
    );

    expect(result).toContain('Interactive load_skill execution requires an explicit chatId.');
    expect(mockedRequestWorldOption).not.toHaveBeenCalled();
  });

  it('returns structured not-found output when skill id does not exist', async () => {
    mockedGetSkill.mockReturnValue(undefined);
    mockedGetSkillSourcePath.mockReturnValue(undefined);

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute({ skill_id: 'missing-skill' });

    expect(result).toContain('<skill_context id="missing-skill">');
    expect(result).toContain('<error>');
    expect(result).toContain('was not found in the current registry');
  });

  it('blocks load_skill when global skills are disabled in system settings', async () => {
    process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS = 'false';
    mockedGetSkillSourceScope.mockReturnValue('global');
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute({ skill_id: 'pdf-extract' });

    expect(result).toContain('is disabled by current system settings');
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('blocks load_skill when skill id is disabled by per-skill settings', async () => {
    process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS = 'find-skills';
    mockedGetSkillSourceScope.mockReturnValue('project');
    mockedGetSkill.mockReturnValue({
      skill_id: 'find-skills',
      description: 'Find skills',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/find-skills/SKILL.md');

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute({ skill_id: 'find-skills' });

    expect(result).toContain('is disabled by current system settings');
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it('returns structured read-error output when skill file cannot be read', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockRejectedValue(new Error('EACCES: permission denied'));

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute({ skill_id: 'pdf-extract' });

    expect(result).toContain('<skill_context id="pdf-extract">');
    expect(result).toContain('<error>');
    expect(result).toContain('Failed to load SKILL.md');
    expect(result).toContain('EACCES');
  });

  it('requests HITL approval for referenced-script skills without auto-executing them', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue([
      '# PDF Extraction Instructions',
      'Run `scripts/build.sh` before processing.',
    ].join('\n') as any);
    vi.mocked((fs as any).stat).mockImplementation(async (targetPath: string) => {
      if (String(targetPath).endsWith('/skills/pdf-extract/scripts/build.sh')) {
        return { isFile: () => true, isDirectory: () => false };
      }
      throw new Error('ENOENT');
    });

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: createInteractiveWorld('ask'),
        chatId: 'chat-1',
        workingDirectory: '/skills/pdf-extract',
      },
    );

    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
    expect(mockedRequestWorldOption).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: expect.stringContaining('Approve loading and applying this skill now?'),
      }),
    );
    expect(mockedValidateShellCommandScope).not.toHaveBeenCalled();
    expect(mockedExecuteShellCommand).not.toHaveBeenCalled();
    expect(result).toContain('<instructions>');
    expect(result).toContain('<active_resources>');
    expect(result).toContain('<skill_root>/skills/pdf-extract</skill_root>');
    expect(result).not.toContain('<script_manifest>');
    expect(result).not.toContain('<script_output');
    expect(mockedFormatResultForLLM).not.toHaveBeenCalled();
  });

  it('does not auto-execute referenced scripts when the deprecated minimal-mode env var is unset', async () => {
    delete process.env.AGENT_WORLD_LOAD_SKILL_MINIMAL_CHECK_MODE;
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue([
      '# PDF Extraction Instructions',
      'Run this command before processing: bash scripts/build.sh',
    ].join('\n') as any);
    vi.mocked((fs as any).stat).mockImplementation(async (targetPath: string) => {
      if (String(targetPath).endsWith('/skills/pdf-extract/scripts/build.sh')) {
        return { isFile: () => true, isDirectory: () => false };
      }
      throw new Error('ENOENT');
    });

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1', eventEmitter: { emit: vi.fn() } },
        chatId: 'chat-1',
        workingDirectory: '/skills/pdf-extract',
      },
    );

    expect(result).toContain('<instructions>');
    expect(result).toContain('<active_resources>');
    expect(result).toContain('<skill_root>/skills/pdf-extract</skill_root>');
    expect(result).not.toContain('<script_manifest>');
    expect(result).not.toContain('Script outputs:');
    expect(result).toContain('Continue the task directly; do not stop merely to report that the skill was loaded.');
    expect(result).toContain('Any script execution must use paths under <skill_root> and remain within runtime safety constraints.');
    expect(mockedExecuteShellCommand).not.toHaveBeenCalled();
    expect(mockedValidateShellCommandScope).not.toHaveBeenCalled();
    expect(vi.mocked((fs as any).readdir)).not.toHaveBeenCalled();
  });

  it('ignores deprecated minimal-mode env flag and still avoids auto-execution', async () => {
    process.env.AGENT_WORLD_LOAD_SKILL_MINIMAL_CHECK_MODE = 'true';
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue([
      '# PDF Extraction Instructions',
      'Run `scripts/build.sh` before processing.',
    ].join('\n') as any);
    vi.mocked((fs as any).stat).mockImplementation(async (targetPath: string) => {
      if (String(targetPath).endsWith('/skills/pdf-extract/scripts/build.sh')) {
        return { isFile: () => true, isDirectory: () => false };
      }
      throw new Error('ENOENT');
    });

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1', eventEmitter: { emit: vi.fn() } },
        chatId: 'chat-1',
        workingDirectory: '/skills/pdf-extract',
      },
    );

    expect(result).toContain('<instructions>');
    expect(result).toContain('<active_resources>');
    expect(result).not.toContain('<script_manifest>');
    expect(result).not.toContain('Script outputs:');
    expect(mockedExecuteShellCommand).not.toHaveBeenCalled();
    expect(mockedValidateShellCommandScope).not.toHaveBeenCalled();
    expect(vi.mocked((fs as any).readdir)).not.toHaveBeenCalled();
  });

  it('does not inject failed script output into load_skill results when a referenced script would require arguments', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue([
      '# PDF Extraction Instructions',
      'Run `scripts/build.sh` before processing.',
    ].join('\n') as any);
    vi.mocked((fs as any).stat).mockImplementation(async (targetPath: string) => {
      if (String(targetPath).endsWith('/skills/pdf-extract/scripts/build.sh')) {
        return { isFile: () => true, isDirectory: () => false };
      }
      throw new Error('ENOENT');
    });

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: createInteractiveWorld('ask'),
        chatId: 'chat-1',
      },
    );

    expect(result).toContain('<instructions>');
    expect(result).toContain('<active_resources>');
    expect(result).not.toContain('<script_manifest>');
    expect(result).not.toContain('exit code 1');
    expect(result).not.toContain('Usage: build.sh');
    expect(mockedExecuteShellCommand).not.toHaveBeenCalled();
  });

  it('returns declined output when HITL skill approval is declined', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('Use `scripts/build.sh`' as any);
    mockedRequestWorldOption.mockResolvedValue({
      worldId: 'world-1',
      requestId: 'req-1',
      chatId: 'chat-1',
      optionId: 'no',
      source: 'user',
    });

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: createInteractiveWorld('ask'),
        chatId: 'chat-1',
      },
    );

    expect(mockedExecuteShellCommand).not.toHaveBeenCalled();
    expect(result).toContain('User declined HITL approval for skill');
    expect(result).not.toContain('<instructions>');
  });

  it('requires approval even when skill has no referenced scripts', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# Skill Instructions\nDo analysis only.' as any);
    mockedRequestWorldOption.mockResolvedValue({
      worldId: 'world-1',
      requestId: 'req-1',
      chatId: 'chat-1',
      optionId: 'no',
      source: 'user',
    });

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: createInteractiveWorld('ask'),
        chatId: 'chat-1',
      },
    );

    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
    expect(mockedRequestWorldOption).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ skillId: 'pdf-extract', scriptPaths: [] }),
      }),
    );
    expect(mockedExecuteShellCommand).not.toHaveBeenCalled();
    expect(result).toContain('User declined HITL approval for skill');
    expect(result).not.toContain('<instructions>');
  });

  it('includes active resources metadata when skill has no referenced scripts', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# Skill Instructions\nDo analysis only.' as any);
    mockedRequestWorldOption.mockResolvedValue({
      worldId: 'world-1',
      requestId: 'req-1',
      chatId: 'chat-1',
      optionId: 'yes_once',
      source: 'user',
    });

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: createInteractiveWorld('ask'),
        chatId: 'chat-1',
      },
    );

    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
    expect(mockedExecuteShellCommand).not.toHaveBeenCalled();
    expect(result).toContain('<instructions>');
    expect(result).toContain('<active_resources>');
    expect(result).toContain('<skill_root>/skills/pdf-extract</skill_root>');
    expect(result).not.toContain('<reference_files>');
    expect(result).not.toContain('<script_manifest>');
    expect(result).toContain('Continue the task directly; do not stop merely to report that the skill was loaded.');
  });

  it('strips yaml front matter from injected instructions', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'find-skills',
      description: 'Find skills',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/find-skills/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue([
      '---',
      'name: find-skills',
      'description: Helps users discover skills.',
      '---',
      '',
      '## Find Skill',
      '',
      'Use the available catalog to choose a skill.',
    ].join('\n') as any);

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute({ skill_id: 'find-skills' });

    expect(result).toContain('<instructions>');
    expect(result).toContain('## Find Skill');
    expect(result).not.toContain('name: find-skills');
    expect(result).not.toContain('description: Helps users discover skills.');
    expect(result).not.toContain('\n---\n');
  });

  it('preserves absolute-path execution guidance for referenced scripts when skill is a subdirectory of cwd', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    // Skill lives at /projects/myapp/skills/my-skill/SKILL.md; cwd is /projects/myapp
    mockedGetSkillSourcePath.mockReturnValue('/projects/myapp/skills/my-skill/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue([
      '# My Skill Instructions',
      'Run `scripts/setup.sh` before processing.',
    ].join('\n') as any);
    vi.mocked((fs as any).stat).mockImplementation(async (targetPath: string) => {
      if (String(targetPath).endsWith('/projects/myapp/skills/my-skill/scripts/setup.sh')) {
        return { isFile: () => true, isDirectory: () => false };
      }
      throw new Error('ENOENT');
    });

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1', eventEmitter: { emit: vi.fn() } },
        chatId: 'chat-1',
        workingDirectory: '/projects/myapp',
      },
    );

    expect(mockedValidateShellCommandScope).not.toHaveBeenCalled();
    expect(mockedExecuteShellCommand).not.toHaveBeenCalled();
    expect(result).toContain('<active_resources>');
    expect(result).toContain('<skill_root>/projects/myapp/skills/my-skill</skill_root>');
    expect(result).not.toContain('<script_manifest>');
  });

  it('keeps skill root in active_resources instead of execution_directive when no scripts are referenced', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'pdf-extract',
      description: 'Extract PDF content',
      hash: 'e99a18ad',
      lastUpdated: '2026-02-14T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# Skill Instructions\nDo analysis only.' as any);
    mockedRequestWorldOption.mockResolvedValue({
      worldId: 'world-1',
      requestId: 'req-1',
      chatId: 'chat-1',
      optionId: 'yes_once',
      source: 'user',
    });

    const tool = createLoadSkillToolSubject();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1', eventEmitter: { emit: vi.fn() } },
        chatId: 'chat-1',
        workingDirectory: '/projects/myapp',
      },
    );

    expect(result).toContain('<instructions>');
    expect(result).toContain('<skill_root>/skills/pdf-extract</skill_root>');
    expect(result).not.toContain('skill root:');
    expect(result).not.toContain('Scripts referenced in <instructions> are located at skill root:');
  });

  it('auto-suppresses repeated load_skill for same skill across active run hops', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'skill-installer',
      description: 'Install skills',
      hash: 'abc123',
      lastUpdated: '2026-02-27T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/skill-installer/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# Skill Installer\nUse installer flow.' as any);
    mockedRequestWorldOption.mockResolvedValue({
      worldId: 'world-1',
      requestId: 'req-same-turn',
      chatId: 'chat-1',
      optionId: 'yes_once',
      source: 'user',
    });

    const messages: Array<Record<string, unknown>> = [{
      role: 'user',
      content: 'Please install the skill',
      chatId: 'chat-1',
      messageId: 'user-turn-1',
      createdAt: new Date('2026-02-27T12:00:00.000Z'),
    }];

    const context = {
      world: createInteractiveWorld('ask'),
      chatId: 'chat-1',
      messages,
      agentName: 'a1',
      toolCallId: 'load-skill-call-1',
    };

    const tool = createLoadSkillToolSubject();
    const firstResult = await tool.execute({ skill_id: 'skill-installer' }, undefined, undefined, context);

    messages.push(
      {
        role: 'assistant',
        content: 'Continuing...',
        chatId: 'chat-1',
        messageId: 'assistant-hop-1',
        createdAt: new Date('2026-02-27T12:00:02.000Z'),
      },
      {
        role: 'tool',
        content: '{"ok":true}',
        chatId: 'chat-1',
        messageId: 'tool-hop-1',
        tool_call_id: 'some-other-tool',
        createdAt: new Date('2026-02-27T12:00:03.000Z'),
      },
    );

    const secondResult = await tool.execute({ skill_id: 'skill-installer' }, undefined, undefined, context);

    expect(firstResult).toContain('<skill_context id="skill-installer">');
    expect(secondResult).toContain('<skill_context id="skill-installer">');
    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });

  it('deduplicates in-flight approvals for concurrent same-turn load_skill calls', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'skill-installer',
      description: 'Install skills',
      hash: 'abc123',
      lastUpdated: '2026-02-27T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/skill-installer/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# Skill Installer\nUse installer flow.' as any);

    let resolveApproval!: (value: any) => void;
    const approvalPromise = new Promise((resolve) => {
      resolveApproval = resolve;
    });
    mockedRequestWorldOption.mockImplementation(() => approvalPromise as any);

    const messages: Array<Record<string, unknown>> = [{
      role: 'user',
      content: 'Please install the skill',
      chatId: 'chat-1',
      messageId: 'user-turn-2',
      createdAt: new Date('2026-02-27T12:01:00.000Z'),
    }];

    const context = {
      world: createInteractiveWorld('ask'),
      chatId: 'chat-1',
      messages,
      agentName: 'a1',
    };

    const tool = createLoadSkillToolSubject();
    const firstCall = tool.execute({ skill_id: 'skill-installer' }, undefined, undefined, context);
    const secondCall = tool.execute({ skill_id: 'skill-installer' }, undefined, undefined, context);

    await waitForMockCallCount(mockedRequestWorldOption, 1);
    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);

    resolveApproval({
      worldId: 'world-1',
      requestId: 'req-concurrent',
      chatId: 'chat-1',
      optionId: 'yes_once',
      source: 'user',
    });

    const [firstResult, secondResult] = await Promise.all([firstCall, secondCall]);
    expect(firstResult).toContain('<skill_context id="skill-installer">');
    expect(secondResult).toContain('<skill_context id="skill-installer">');
    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
  });

  it('allows retry after declined load_skill in the same run', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'skill-installer',
      description: 'Install skills',
      hash: 'abc123',
      lastUpdated: '2026-02-27T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/skill-installer/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# Skill Installer\nUse installer flow.' as any);
    mockedRequestWorldOption
      .mockResolvedValueOnce({
        worldId: 'world-1',
        requestId: 'req-decline',
        chatId: 'chat-1',
        optionId: 'no',
        source: 'user',
      })
      .mockResolvedValueOnce({
        worldId: 'world-1',
        requestId: 'req-approve',
        chatId: 'chat-1',
        optionId: 'yes_once',
        source: 'user',
      });

    const messages: Array<Record<string, unknown>> = [{
      role: 'user',
      content: 'Please install the skill',
      chatId: 'chat-1',
      messageId: 'user-turn-retry-1',
      createdAt: new Date('2026-02-27T12:02:00.000Z'),
    }];

    const context = {
      world: createInteractiveWorld('ask'),
      chatId: 'chat-1',
      messages,
      agentName: 'a1',
    };

    const tool = createLoadSkillToolSubject();
    const firstResult = await tool.execute({ skill_id: 'skill-installer' }, undefined, undefined, context);
    const secondResult = await tool.execute({ skill_id: 'skill-installer' }, undefined, undefined, context);

    expect(firstResult).toContain('User declined HITL approval for skill');
    expect(secondResult).toContain('<skill_context id="skill-installer">');
    expect(secondResult).toContain('<instructions>');
    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(2);
  });

  it('reuses reconstructed yes_in_session approval after cache reset (restart simulation)', async () => {
    mockedGetSkill.mockReturnValue({
      skill_id: 'skill-installer',
      description: 'Install skills',
      hash: 'abc123',
      lastUpdated: '2026-02-28T12:00:00.000Z',
    });
    mockedGetSkillSourcePath.mockReturnValue('/skills/skill-installer/SKILL.md');
    vi.mocked(fs.readFile).mockResolvedValue('# Skill Installer\nUse installer flow.' as any);
    mockedRequestWorldOption.mockResolvedValue({
      worldId: 'world-1',
      requestId: 'load_skill_approval::req-session-approve',
      chatId: 'chat-1',
      optionId: 'yes_in_session',
      source: 'user',
    });

    const messages: Array<Record<string, unknown>> = [{
      role: 'user',
      content: 'install it',
      chatId: 'chat-1',
      messageId: 'user-turn-session-1',
      createdAt: new Date('2026-02-28T12:00:00.000Z'),
    }];

    const context = {
      world: createInteractiveWorld('ask'),
      chatId: 'chat-1',
      messages,
      agentName: 'a1',
      toolCallId: 'load-skill-call-session',
    };

    const tool = createLoadSkillToolSubject();
    const firstResult = await tool.execute({ skill_id: 'skill-installer' }, undefined, undefined, context);
    expect(firstResult).toContain('<skill_context id="skill-installer">');
    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);

    // Simulate app restart by clearing process-local caches, then rebuilding from persisted messages.
    clearChatSkillApprovals('world-1', 'chat-1');
    const restored = reconstructSkillApprovalsFromMessages('world-1', 'chat-1', messages as Array<Record<string, any>>);
    expect(restored).toBeGreaterThan(0);

    // Move to a new user turn so run-scoped result caching cannot suppress the second request.
    messages.push({
      role: 'user',
      content: 'run it again in this chat',
      chatId: 'chat-1',
      messageId: 'user-turn-session-2',
      createdAt: new Date('2026-02-28T12:01:00.000Z'),
    });

    const secondResult = await tool.execute({ skill_id: 'skill-installer' }, undefined, undefined, context);
    expect(secondResult).toContain('<skill_context id="skill-installer">');
    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
  });

});

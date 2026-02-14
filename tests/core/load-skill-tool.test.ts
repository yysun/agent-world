/**
 * load_skill Tool Tests
 *
 * Purpose:
 * - Validate progressive skill loading tool behavior for success and failure paths.
 *
 * Features tested:
 * - Loads full SKILL.md content by `skill_id` from registry-provided source path
 * - Requires HITL approval before applying skill instructions in world/chat contexts
 * - Executes instruction-referenced scripts only after approval and scope validation
 * - Returns structured not-found output for unknown IDs
 * - Returns structured read-error output when SKILL.md cannot be read
 *
 * Implementation notes:
 * - Uses mocked registry APIs for deterministic lookup behavior
 * - Uses mocked in-memory fs APIs only (no filesystem access)
 *
 * Recent changes:
 * - 2026-02-14: Added coverage for skill-level HITL gating when skills have no local script references.
 * - 2026-02-14: Added HITL approval + script execution coverage for `load_skill` active resource outputs.
 * - 2026-02-14: Added initial unit coverage for the built-in `load_skill` tool.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fsModule from 'fs';
import { createLoadSkillToolDefinition } from '../../core/load-skill-tool.js';
import { requestWorldOption } from '../../core/hitl.js';
import {
  executeShellCommand,
  formatResultForLLM,
  validateShellCommandScope,
} from '../../core/shell-cmd-tool.js';
import {
  getSkill,
  getSkillSourcePath,
  waitForInitialSkillSync,
} from '../../core/skill-registry.js';

vi.mock('../../core/skill-registry.js', () => ({
  getSkill: vi.fn(),
  getSkillSourcePath: vi.fn(),
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

const fs = vi.mocked(fsModule.promises);
const mockedGetSkill = vi.mocked(getSkill);
const mockedGetSkillSourcePath = vi.mocked(getSkillSourcePath);
const mockedWaitForInitialSkillSync = vi.mocked(waitForInitialSkillSync);
const mockedRequestWorldOption = vi.mocked(requestWorldOption);
const mockedExecuteShellCommand = vi.mocked(executeShellCommand);
const mockedFormatResultForLLM = vi.mocked(formatResultForLLM);
const mockedValidateShellCommandScope = vi.mocked(validateShellCommandScope);

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

    const tool = createLoadSkillToolDefinition();
    const result = await tool.execute({ skill_id: 'pdf-extract' });

    expect(mockedWaitForInitialSkillSync).toHaveBeenCalledTimes(1);
    expect(fs.readFile).toHaveBeenCalledWith('/skills/pdf-extract/SKILL.md', 'utf8');
    expect(result).toContain('<skill_context id="pdf-extract">');
    expect(result).toContain('<instructions>');
    expect(result).toContain('# PDF Extraction Instructions');
    expect(result).toContain('<execution_directive>');
    expect(result).toContain('specialized pdf-extract protocol');
  });

  it('returns structured not-found output when skill id does not exist', async () => {
    mockedGetSkill.mockReturnValue(undefined);
    mockedGetSkillSourcePath.mockReturnValue(undefined);

    const tool = createLoadSkillToolDefinition();
    const result = await tool.execute({ skill_id: 'missing-skill' });

    expect(result).toContain('<skill_context id="missing-skill">');
    expect(result).toContain('<error>');
    expect(result).toContain('was not found in the current registry');
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

    const tool = createLoadSkillToolDefinition();
    const result = await tool.execute({ skill_id: 'pdf-extract' });

    expect(result).toContain('<skill_context id="pdf-extract">');
    expect(result).toContain('<error>');
    expect(result).toContain('Failed to load SKILL.md');
    expect(result).toContain('EACCES');
  });

  it('requests HITL approval and executes referenced scripts safely', async () => {
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

    const tool = createLoadSkillToolDefinition();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1', eventEmitter: { emit: vi.fn() } },
        chatId: 'chat-1',
      },
    );

    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
    expect(mockedValidateShellCommandScope).toHaveBeenCalledWith(
      'bash',
      ['scripts/build.sh'],
      '/skills/pdf-extract',
    );
    expect(mockedExecuteShellCommand).toHaveBeenCalledWith(
      'bash',
      ['scripts/build.sh'],
      '/skills/pdf-extract',
      expect.objectContaining({
        timeout: 120000,
        worldId: 'world-1',
        chatId: 'chat-1',
      }),
    );
    expect(result).toContain('<active_resources>');
    expect(result).toContain('<script_output source="scripts/build.sh">');
    expect(result).toContain('formatted script output');
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

    const tool = createLoadSkillToolDefinition();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1', eventEmitter: { emit: vi.fn() } },
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

    const tool = createLoadSkillToolDefinition();
    const result = await tool.execute(
      { skill_id: 'pdf-extract' },
      undefined,
      undefined,
      {
        world: { id: 'world-1', currentChatId: 'chat-1', eventEmitter: { emit: vi.fn() } },
        chatId: 'chat-1',
      },
    );

    expect(mockedRequestWorldOption).toHaveBeenCalledTimes(1);
    expect(mockedRequestWorldOption).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: { skillId: 'pdf-extract', scriptPaths: [] },
      }),
    );
    expect(mockedExecuteShellCommand).not.toHaveBeenCalled();
    expect(result).toContain('User declined HITL approval for skill');
    expect(result).not.toContain('<instructions>');
  });
});

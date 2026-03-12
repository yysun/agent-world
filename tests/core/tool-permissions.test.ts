/**
 * Tool Permission Tests
 *
 * Purpose:
 * - Validate world-level `tool_permission` enforcement via `world.variables` env key.
 * - Covers all affected built-in tools: write_file, web_fetch, shell_cmd, create_agent, load_skill.
 * - Permission levels: 'read' (block writes/execution), 'ask' (force HITL approval), 'auto' (normal).
 *
 * Architecture:
 * - `tool_permission` is stored as env variable in world.variables: `tool_permission=read|ask|auto`
 * - Read by tools via `getEnvValueFromText(world.variables, 'tool_permission')`
 * - No dedicated DB column — follows the same pattern as `working_directory`.
 *
 * Recent changes:
 * - 2026-03-12: Initial implementation with world.variables env key pattern.
 */

import * as fsModule from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock requestToolApproval (used by shell_cmd ask-level and load_skill approval)
const mockRequestToolApproval = vi.hoisted(() => vi.fn());
vi.mock('../../core/tool-approval.js', () => ({
  requestToolApproval: mockRequestToolApproval,
}));

// Mock hitl.js (requestWorldOption used by some HITL flows)
vi.mock('../../core/hitl.js', () => ({
  requestWorldOption: vi.fn(async () => ({
    worldId: 'world-1',
    requestId: 'req-1',
    chatId: 'chat-1',
    optionId: 'yes_once',
    source: 'user',
  })),
}));

// Mock shell-cmd-tool.js exports used by file-tools internals
// (shell_cmd itself calls its own local functions; these mocks only affect imports in other modules)
vi.mock('../../core/shell-cmd-tool.js', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    resolveTrustedShellWorkingDirectory: vi.fn((ctx: any) => ctx?.workingDirectory ?? '/workspace'),
    validateShellDirectoryRequest: vi.fn(() => ({ valid: true })),
  };
});

vi.mock('fast-glob', () => ({
  default: vi.fn(() => []),
}));

vi.mock('../../core/skill-registry.js', () => ({
  getSkills: vi.fn(() => []),
  getSkillSourcePath: vi.fn(() => undefined),
  getSkill: vi.fn(),
  getSkillSourceScope: vi.fn(() => 'global'),
  waitForInitialSkillSync: vi.fn(async () => ({ added: 0, updated: 0, removed: 0, unchanged: 0, total: 0 })),
}));

vi.mock('../../core/managers.js', () => ({
  claimAgentCreationSlot: vi.fn(async () => ({ claimed: true, release: vi.fn() })),
  createAgent: vi.fn(async (_worldId: string, params: any) => ({
    id: String(params.name || '').toLowerCase().replace(/\s+/g, '-'),
    name: params.name,
    type: params.type ?? 'default',
    autoReply: params.autoReply ?? false,
    status: 'active',
    systemPrompt: null,
    provider: null,
    model: null,
    temperature: null,
    maxTokens: null,
    memory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
}));

vi.mock('dns/promises', () => ({
  lookup: vi.fn(() => Promise.resolve([{ address: '93.184.216.34', family: 4 }])),
}));

import { createWriteFileToolDefinition } from '../../core/file-tools.js';
import { createWebFetchToolDefinition } from '../../core/web-fetch-tool.js';
import { createShellCmdToolDefinition } from '../../core/shell-cmd-tool.js';
import { createCreateAgentToolDefinition } from '../../core/create-agent-tool.js';
import { createLoadSkillToolDefinition } from '../../core/load-skill-tool.js';
import {
  getSkill,
  getSkillSourcePath,
  waitForInitialSkillSync,
} from '../../core/skill-registry.js';

const mockedGetSkill = vi.mocked(getSkill);
const mockedGetSkillSourcePath = vi.mocked(getSkillSourcePath);
const mockedWaitForInitialSkillSync = vi.mocked(waitForInitialSkillSync);
const fs = vi.mocked(fsModule.promises as any);

describe('tool_permission enforcement via world.variables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedWaitForInitialSkillSync.mockResolvedValue({
      added: 0, updated: 0, removed: 0, unchanged: 0, total: 0,
    });
    if (!fs.stat) fs.stat = vi.fn();
    if (!fs.readdir) fs.readdir = vi.fn();
    vi.mocked(fs.stat).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    vi.mocked(fs.readdir).mockResolvedValue([]);
  });

  // ==========================================
  // write_file
  // ==========================================

  describe('write_file', () => {
    it('blocks file writes when tool_permission=read', async () => {
      const tool = createWriteFileToolDefinition();
      const result = await tool.execute(
        { filePath: 'test.txt', content: 'hello' },
        undefined,
        undefined,
        {
          workingDirectory: '/workspace',
          world: { variables: 'tool_permission=read' },
        },
      );
      expect(String(result)).toContain('blocked');
      expect(String(result)).toContain('permission level (read)');
    });

    it('proceeds to write when tool_permission=auto (default behavior)', async () => {
      vi.mocked(fsModule.promises.writeFile).mockResolvedValue(undefined as any);
      vi.mocked(fsModule.promises.mkdir).mockResolvedValue(undefined as any);
      vi.mocked(fsModule.promises.stat).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      const tool = createWriteFileToolDefinition();
      const result = await tool.execute(
        { filePath: 'test.txt', content: 'hello' },
        undefined,
        undefined,
        {
          workingDirectory: '/workspace',
          world: { variables: '' },
        },
      );
      expect(String(result)).not.toContain('blocked by the current permission level');
    });
  });

  // ==========================================
  // web_fetch
  // ==========================================

  describe('web_fetch', () => {
    it('blocks fetches when tool_permission=read', async () => {
      const tool = createWebFetchToolDefinition();
      const result = await tool.execute(
        { url: 'https://example.com' },
        undefined,
        undefined,
        { world: { id: 'world-1', variables: 'tool_permission=read' } as any },
      );
      const parsed = JSON.parse(String(result));
      expect(parsed.ok).toBe(false);
      expect(parsed.error).toContain('permission level (read)');
    });
  });

  // ==========================================
  // shell_cmd
  // ==========================================

  describe('shell_cmd', () => {
    it('blocks command execution when tool_permission=read', async () => {
      const tool = createShellCmdToolDefinition();
      const result = await tool.execute(
        { command: 'echo', parameters: ['hello'] },
        undefined,
        undefined,
        {
          world: { id: 'world-1', variables: 'working_directory=/tmp\ntool_permission=read' },
          workingDirectory: '/tmp',
        },
      );
      expect(String(result)).toContain('permission level (read)');
    });

    it('forces HITL approval for low-risk command when tool_permission=ask', async () => {
      mockRequestToolApproval.mockResolvedValueOnce({
        approved: false,
        reason: 'user_denied',
        optionId: 'deny',
        source: 'user',
      });

      const tool = createShellCmdToolDefinition();
      await expect(
        tool.execute(
          { command: 'ls', parameters: [] },
          undefined,
          undefined,
          {
            world: { id: 'world-1', variables: 'working_directory=/tmp\ntool_permission=ask' },
            workingDirectory: '/tmp',
            chatId: 'chat-1',
          },
        ),
      ).rejects.toThrow('not approved');

      expect(mockRequestToolApproval).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================
  // create_agent
  // ==========================================

  describe('create_agent', () => {
    it('blocks agent creation when tool_permission=read', async () => {
      const tool = createCreateAgentToolDefinition();
      const result = await tool.execute(
        { name: 'my-agent' },
        undefined,
        undefined,
        {
          world: { id: 'world-1', variables: 'tool_permission=read' } as any,
          chatId: 'chat-1',
        },
      );
      const parsed = JSON.parse(String(result));
      expect(parsed.ok).toBe(false);
      expect(parsed.status).toBe('blocked');
      expect(parsed.message).toContain('permission level (read)');
    });
  });

  // ==========================================
  // load_skill (script execution blocking)
  // ==========================================

  describe('load_skill script execution', () => {
    it('blocks script execution when tool_permission=read but still returns skill instructions', async () => {
      mockedGetSkill.mockReturnValue({
        skill_id: 'pdf-extract',
        description: 'Extract PDF content',
        hash: 'abc12345',
        lastUpdated: '2026-03-12T00:00:00.000Z',
      });
      mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
      vi.mocked(fsModule.promises.readFile).mockResolvedValue(
        '# Steps\nRun `scripts/setup.sh` before processing.\n' as any,
      );
      // Approve the skill execution (permission check happens inside executeSkillScripts, after approval)
      mockRequestToolApproval.mockResolvedValueOnce({
        approved: true,
        reason: 'approved',
        optionId: 'yes_once',
        source: 'user',
      });

      const tool = createLoadSkillToolDefinition();
      const result = await tool.execute(
        { skill_id: 'pdf-extract' },
        undefined,
        undefined,
        {
          world: { id: 'world-perm-test', variables: 'tool_permission=read' } as any,
          chatId: 'chat-perm-test',
        },
      );
      // Skill instructions are still returned
      expect(String(result)).toContain('pdf-extract');
      // But script output is blocked
      expect(String(result)).toContain('blocked by the current permission level');
    });
  });
});

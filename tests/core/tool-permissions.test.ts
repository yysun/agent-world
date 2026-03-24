/**
 * Tool Permission Tests
 *
 * Purpose:
 * - Validate world-level `tool_permission` enforcement via `world.variables` env key.
 * - Covers all affected built-in tools: write_file, web_fetch, shell_cmd, create_agent, load_skill.
 * - Permission levels: 'read' (block writes/execution), 'ask' (force HITL approval where required), 'auto' (normal).
 *
 * Architecture:
 * - `tool_permission` is stored as env variable in world.variables: `tool_permission=read|ask|auto`
 * - Read by tools via `getEnvValueFromText(world.variables, 'tool_permission')`
 * - No dedicated DB column — follows the same pattern as `working_directory`.
 *
 * Recent changes:
 * - 2026-03-23: Added approved `create_agent` coverage so the tool-permission suite locks in the
 *   full approval-plus-created-info flow that web E2E relies on.
 * - 2026-03-22: Updated `load_skill` permission coverage for the pure-load contract so
 *   skill loading no longer implies or performs script execution at any permission level.
 * - 2026-03-12: Consolidated web_fetch coverage into an explicit allowed-at-all-levels
 *   matrix regression and updated write_file coverage to match the documented permission matrix.
 */

import * as fsModule from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequestToolApproval = vi.hoisted(() => vi.fn());
const mockRequestWorldOption = vi.hoisted(() => vi.fn());
const mockExecuteShellCommand = vi.hoisted(() => vi.fn());
const mockPublishEvent = vi.hoisted(() => vi.fn());

vi.mock('../../core/tool-approval.js', () => ({
  requestToolApproval: mockRequestToolApproval,
}));

vi.mock('../../core/hitl.js', () => ({
  requestWorldOption: mockRequestWorldOption,
}));

vi.mock('../../core/events/publishers.js', () => ({
  publishEvent: mockPublishEvent,
}));

vi.mock('../../core/shell-cmd-tool.js', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    executeShellCommand: mockExecuteShellCommand,
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

const fsPromises = fsModule.promises as any;
const mkdirSpy = vi.fn();
const writeFileSpy = vi.fn();
const readFileSpy = vi.fn();
const statSpy = vi.fn();
const readdirSpy = vi.fn();

fsPromises.mkdir = mkdirSpy;
fsPromises.writeFile = writeFileSpy;
fsPromises.readFile = readFileSpy;
fsPromises.stat = statSpy;
fsPromises.readdir = readdirSpy;

function createEnoentError(): Error & { code: string } {
  return Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
}

describe('tool_permission enforcement via world.variables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();

    mockedWaitForInitialSkillSync.mockResolvedValue({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      total: 0,
    });

    mockRequestToolApproval.mockResolvedValue({
      approved: true,
      reason: 'approved',
      optionId: 'yes',
      source: 'user',
    });
    mockRequestWorldOption.mockResolvedValue({
      worldId: 'world-1',
      requestId: 'req-1',
      chatId: 'chat-1',
      optionId: 'dismiss',
      source: 'user',
    });
    mockExecuteShellCommand.mockResolvedValue({
      exitCode: 0,
      stdout: 'script executed',
      stderr: '',
      error: null,
      signal: null,
      command: 'node',
      parameters: [],
      workingDirectory: '/workspace',
    });

    mkdirSpy.mockResolvedValue(undefined as any);
    writeFileSpy.mockResolvedValue(undefined as any);
    readFileSpy.mockResolvedValue('' as any);
    statSpy.mockRejectedValue(createEnoentError());
    readdirSpy.mockResolvedValue([] as any);
  });

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
      expect(writeFileSpy).not.toHaveBeenCalled();
    });

    it('requires HITL approval before file writes when tool_permission=ask', async () => {
      const tool = createWriteFileToolDefinition();
      const result = await tool.execute(
        { filePath: 'test.txt', content: 'hello ask' },
        undefined,
        undefined,
        {
          workingDirectory: '/workspace',
          world: { variables: 'tool_permission=ask' },
          chatId: 'chat-1',
        },
      );

      expect(String(result)).not.toContain('blocked by the current permission level');
      expect(writeFileSpy).toHaveBeenCalled();
      expect(mockRequestToolApproval).toHaveBeenCalledTimes(1);
    });

    it('proceeds to write when tool_permission=auto', async () => {
      const tool = createWriteFileToolDefinition();
      const result = await tool.execute(
        { filePath: 'test.txt', content: 'hello auto' },
        undefined,
        undefined,
        {
          workingDirectory: '/workspace',
          world: { variables: '' },
        },
      );

      expect(String(result)).not.toContain('blocked by the current permission level');
      expect(writeFileSpy).toHaveBeenCalled();
      expect(mockRequestToolApproval).not.toHaveBeenCalled();
    });
  });

  describe('web_fetch', () => {
    it.each([
      { level: 'read', variables: 'tool_permission=read', responseText: 'hello from read' },
      { level: 'ask', variables: 'tool_permission=ask', responseText: 'hello from ask' },
      { level: 'auto', variables: '', responseText: 'hello from auto' },
    ])('allows public fetches without HITL when tool_permission=$level', async ({
      variables,
      responseText,
    }) => {
      const fetchMock = vi.fn(async () => new Response(responseText, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }));
      vi.stubGlobal('fetch', fetchMock);

      const tool = createWebFetchToolDefinition();
      const result = await tool.execute(
        { url: 'https://example.com' },
        undefined,
        undefined,
        { world: { id: 'world-1', variables } as any },
      );

      const parsed = JSON.parse(String(result));
      expect(parsed.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mockRequestToolApproval).not.toHaveBeenCalled();
    });
  });

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

    it('forces HITL approval for low-risk commands when tool_permission=ask', async () => {
      mockRequestToolApproval.mockResolvedValueOnce({
        approved: false,
        reason: 'user_denied',
        optionId: 'deny',
        source: 'user',
      });

      const tool = createShellCmdToolDefinition();
      await expect(
        tool.execute(
          { command: 'pwd', parameters: [] },
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

    it('executes low-risk commands without HITL when tool_permission=auto', async () => {
      const tool = createShellCmdToolDefinition();
      const result = await tool.execute(
        { command: 'pwd', parameters: [] },
        undefined,
        undefined,
        {
          world: { id: 'world-1', variables: 'working_directory=/tmp' },
          workingDirectory: '/tmp',
          chatId: 'chat-1',
        },
      );

      expect(String(result)).not.toContain('permission level (read)');
      expect(mockRequestToolApproval).not.toHaveBeenCalled();
    });

    it('keeps risk-tier approval for risky commands when tool_permission=auto', async () => {
      mockRequestToolApproval.mockResolvedValueOnce({
        approved: false,
        reason: 'user_denied',
        optionId: 'deny',
        source: 'user',
      });

      const tool = createShellCmdToolDefinition();
      await expect(
        tool.execute(
          { command: 'rm', parameters: ['target.txt'] },
          undefined,
          undefined,
          {
            world: { id: 'world-1', variables: 'working_directory=/tmp' },
            workingDirectory: '/tmp',
            chatId: 'chat-1',
          },
        ),
      ).rejects.toThrow('not approved');

      expect(mockRequestToolApproval).toHaveBeenCalledTimes(1);
    });
  });

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

    it('requests approval when tool_permission=ask', async () => {
      mockRequestToolApproval.mockResolvedValueOnce({
        approved: false,
        reason: 'user_denied',
        optionId: 'no',
        source: 'user',
      });

      const tool = createCreateAgentToolDefinition();
      const result = await tool.execute(
        { name: 'ask-agent' },
        undefined,
        undefined,
        {
          world: { id: 'world-1', variables: 'tool_permission=ask' } as any,
          chatId: 'chat-1',
        },
      );

      const parsed = JSON.parse(String(result));
      expect(parsed.ok).toBe(false);
      expect(parsed.status).toBe('denied');
      expect(mockRequestToolApproval).toHaveBeenCalledTimes(1);
    });

    it('creates the agent and emits the created-info prompt when approval is granted at ask', async () => {
      const tool = createCreateAgentToolDefinition();
      const result = await tool.execute(
        { name: 'ask-agent' },
        undefined,
        undefined,
        {
          world: { id: 'world-1', variables: 'tool_permission=ask' } as any,
          chatId: 'chat-1',
        },
      );

      const parsed = JSON.parse(String(result));
      expect(parsed.ok).toBe(true);
      expect(parsed.status).toBe('created');
      expect(parsed.agent.name).toBe('ask-agent');
      expect(mockRequestToolApproval).toHaveBeenCalledTimes(1);
      expect(mockRequestWorldOption).toHaveBeenCalledTimes(1);
      expect(mockRequestWorldOption).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: 'Agent ask-agent created',
          defaultOptionId: 'dismiss',
        }),
      );
    });

    it('keeps approval flow when tool_permission=auto', async () => {
      mockRequestToolApproval.mockResolvedValueOnce({
        approved: false,
        reason: 'user_denied',
        optionId: 'no',
        source: 'user',
      });

      const tool = createCreateAgentToolDefinition();
      const result = await tool.execute(
        { name: 'auto-agent' },
        undefined,
        undefined,
        {
          world: { id: 'world-1', variables: '' } as any,
          chatId: 'chat-1',
        },
      );

      const parsed = JSON.parse(String(result));
      expect(parsed.ok).toBe(false);
      expect(parsed.status).toBe('denied');
      expect(mockRequestToolApproval).toHaveBeenCalledTimes(1);
    });
  });

  describe('load_skill script execution', () => {
    it('loads referenced-script skills without prompting or auto-executing when tool_permission=read', async () => {
      mockedGetSkill.mockReturnValue({
        skill_id: 'pdf-extract',
        description: 'Extract PDF content',
        hash: 'abc12345',
        lastUpdated: '2026-03-12T00:00:00.000Z',
      });
      mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
      readFileSpy.mockResolvedValue('# Steps\nRun `scripts/setup.sh` before processing.\n' as any);

      const tool = createLoadSkillToolDefinition();
      const result = await tool.execute(
        { skill_id: 'pdf-extract' },
        undefined,
        undefined,
        {
          world: { id: 'world-perm-test', variables: 'tool_permission=read' } as any,
          chatId: 'chat-perm-test',
          workingDirectory: '/workspace',
        },
      );

      expect(String(result)).toContain('pdf-extract');
      expect(String(result)).toContain('<active_resources>');
      expect(String(result)).toContain('<skill_root>/skills/pdf-extract</skill_root>');
      expect(String(result)).not.toContain('blocked by the current permission level');
      expect(mockRequestToolApproval).not.toHaveBeenCalled();
      expect(mockExecuteShellCommand).not.toHaveBeenCalled();
    });

    it('requests approval for script execution when tool_permission=ask', async () => {
      mockedGetSkill.mockReturnValue({
        skill_id: 'pdf-extract',
        description: 'Extract PDF content',
        hash: 'abc12345',
        lastUpdated: '2026-03-12T00:00:00.000Z',
      });
      mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
      readFileSpy.mockResolvedValue('# Steps\nRun `scripts/setup.sh` before processing.\n' as any);
      statSpy.mockResolvedValue({ isFile: () => true } as any);
      mockRequestToolApproval.mockResolvedValueOnce({
        approved: false,
        reason: 'user_denied',
        optionId: 'no',
        source: 'user',
      });

      const tool = createLoadSkillToolDefinition();
      const result = await tool.execute(
        { skill_id: 'pdf-extract' },
        undefined,
        undefined,
        {
          world: { id: 'world-perm-test', variables: 'tool_permission=ask' } as any,
          chatId: 'chat-perm-test',
          workingDirectory: '/workspace',
        },
      );

      expect(String(result)).toContain('User declined HITL approval');
      expect(mockRequestToolApproval).toHaveBeenCalledTimes(1);
      expect(mockExecuteShellCommand).not.toHaveBeenCalled();
    });

    it('loads referenced-script skills without auto-executing when tool_permission=auto', async () => {
      mockedGetSkill.mockReturnValue({
        skill_id: 'pdf-extract',
        description: 'Extract PDF content',
        hash: 'abc12345',
        lastUpdated: '2026-03-12T00:00:00.000Z',
      });
      mockedGetSkillSourcePath.mockReturnValue('/skills/pdf-extract/SKILL.md');
      readFileSpy.mockResolvedValue('# Steps\nRun `scripts/setup.sh` before processing.\n' as any);
      statSpy.mockResolvedValue({ isFile: () => true } as any);
      mockExecuteShellCommand.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'setup complete',
        stderr: '',
        error: null,
        signal: null,
      });

      const tool = createLoadSkillToolDefinition();
      const result = await tool.execute(
        { skill_id: 'pdf-extract' },
        undefined,
        undefined,
        {
          world: { id: 'world-perm-test', variables: '' } as any,
          chatId: 'chat-perm-test',
          workingDirectory: '/workspace',
        },
      );

      expect(String(result)).toContain('<active_resources>');
      expect(String(result)).toContain('<skill_root>/skills/pdf-extract</skill_root>');
      expect(String(result)).not.toContain('<script_output source="scripts/setup.sh">');
      expect(String(result)).not.toContain('blocked by the current permission level');
      expect(mockRequestToolApproval).not.toHaveBeenCalled();
      expect(mockExecuteShellCommand).not.toHaveBeenCalled();
    });
  });
});

/**
 * prepareMessagesForLLM Tests
 *
 * Purpose:
 * - Validate system prompt formatting behavior for LLM-ready messages.
 *
 * Features tested:
 * - Injects progressive `<available_skills>` prompt section from skill registry data.
 * - Omits the skills section when no skills are available after filtering.
 * - Separates authored prompt content from runtime injections with a structural delimiter.
 * - Keeps prompt assembly separator-free when authored content is empty.
 *
 * Implementation notes:
 * - Uses real in-memory world/agent setup via shared test helpers.
 * - Mocks skill registry APIs for deterministic prompt content.
 * - Focuses on prompt formatting only (no tool execution).
 *
 * Recent changes:
 * - 2026-05-10: Added CWD `AGENTS.md` prompt-loading coverage and final prompt precedence coverage with runtime tool-rule injection.
 * - 2026-03-22: Updated Agent Skills prompt assertions for continue-the-task guidance after `load_skill`.
 * - 2026-03-19: Added coverage that skill-registry prompt assembly refreshes against the active world's `variables`.
 * - 2026-03-01: Added coverage for the `available_skills` post-load acknowledgment requirement text.
 * - 2026-02-20: Shortened mention-format prompt assertions to compact handoff-focused wording.
 * - 2026-02-20: Added explicit assertion that normal user-facing replies should not include @mentions unless addressing another agent.
 * - 2026-02-20: Relaxed mention-format prompt assertions to conditional paragraph-beginning multi-agent guidance.
 * - 2026-02-16: Updated skill-registry mocking to `getSkillsForSystemPrompt` and added coverage for global/project skill-scope env flags.
 * - 2026-02-15: Added coverage to ensure system-level mention-format rule is injected even when agent has no custom system prompt.
 * - 2026-02-15: Added coverage for concise cross-agent addressing rule injection (`@<agent_id>, <message>`).
 * - 2026-02-14: Added coverage for `## Agent Skills` prompt injection and load_skill guidance.
 * - 2026-03-06: Updated expectations for separator-based runtime prompt assembly and empty skills suppression.
 */

import * as nodeFsPromises from 'node:fs/promises';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { appendToolRulesToSystemMessage } from '../../core/llm-runtime.js';
import { createAgent, updateWorld } from '../../core/managers.js';
import { LLMProvider } from '../../core/types.js';
import { buildProjectAgentsPromptSection, composeSystemPromptFromSections, prepareMessagesForLLM } from '../../core/utils.js';
import { getSkillSourceScope, getSkillsForSystemPrompt, syncSkills, waitForInitialSkillSync } from '../../core/skill-registry.js';
import { setupTestWorld } from '../helpers/world-test-setup.js';

vi.mock('../../core/skill-registry.js', () => ({
  getSkillSourceScope: vi.fn((skillId: string) => (skillId === 'apprun-skills' ? 'project' : 'global')),
  getSkillsForSystemPrompt: vi.fn(() => []),
  syncSkills: vi.fn(async () => ({
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    total: 0,
  })),
  waitForInitialSkillSync: vi.fn(async () => ({
    added: 0,
    updated: 0,
    removed: 0,
    unchanged: 0,
    total: 0,
  })),
}));

const mockedGetSkillsForSystemPrompt = vi.mocked(getSkillsForSystemPrompt);
const mockedGetSkillSourceScope = vi.mocked(getSkillSourceScope);
const mockedSyncSkills = vi.mocked(syncSkills);
const mockedWaitForInitialSkillSync = vi.mocked(waitForInitialSkillSync);
const mockedFsReadFile = vi.mocked(nodeFsPromises.readFile);
const mockedFsStat = vi.mocked(nodeFsPromises.stat);

function createMissingFileError(filePath: string) {
  return Object.assign(new Error(`ENOENT: no such file or directory, stat '${filePath}'`), { code: 'ENOENT' });
}

function mockProjectAgentsFiles(fileContentsByPath: Record<string, string>) {
  const fallbackReadFile = mockedFsReadFile.getMockImplementation();

  mockedFsStat.mockImplementation(async (filePath: nodeFsPromises.PathLike) => {
    const normalizedPath = String(filePath);
    if (Object.prototype.hasOwnProperty.call(fileContentsByPath, normalizedPath)) {
      return {
        isFile: () => true,
      } as Awaited<ReturnType<typeof nodeFsPromises.stat>>;
    }

    throw createMissingFileError(normalizedPath);
  });

  mockedFsReadFile.mockImplementation(async (...args: any[]) => {
    const normalizedPath = String(args[0]);
    if (Object.prototype.hasOwnProperty.call(fileContentsByPath, normalizedPath)) {
      return fileContentsByPath[normalizedPath] as any;
    }

    if (fallbackReadFile) {
      return await fallbackReadFile(...args);
    }

    throw createMissingFileError(normalizedPath);
  });
}

describe('prepareMessagesForLLM', () => {
  const { worldId } = setupTestWorld({
    name: 'test-world-prepare-messages',
    description: 'System prompt formatting tests'
  });

  beforeEach(() => {
    mockedWaitForInitialSkillSync.mockResolvedValue({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      total: 2,
    });
    mockedGetSkillsForSystemPrompt.mockReturnValue([
      {
        skill_id: 'apprun-skills',
        description: 'Build AppRun components',
        hash: 'abc12345',
        lastUpdated: '2026-02-14T09:00:00.000Z',
      },
      {
        skill_id: 'pdf-extract',
        description: 'Extract PDF content',
        hash: 'def67890',
        lastUpdated: '2026-02-14T09:01:00.000Z',
      },
    ]);
    mockedGetSkillSourceScope.mockImplementation((skillId: string) =>
      skillId === 'apprun-skills' ? 'project' : 'global'
    );
    mockedSyncSkills.mockResolvedValue({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      total: 2,
    });

    delete process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS;
    delete process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS;
    delete process.env.AGENT_WORLD_DISABLED_GLOBAL_SKILLS;
    delete process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS;

    mockedFsStat.mockImplementation(async (filePath: nodeFsPromises.PathLike) => {
      throw createMissingFileError(String(filePath));
    });
  });

  test('separates authored prompt from runtime-injected sections', async () => {
    await updateWorld(worldId(), {
      variables: 'project_name=agent-world\nworking_directory=/tmp/agent-world'
    });

    const agent = await createAgent(worldId(), {
      name: 'Prompt Agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are helping {{ project_name }}.'
    });

    const messages = await prepareMessagesForLLM(worldId(), agent, null);
    expect(mockedSyncSkills).toHaveBeenCalledWith({
      worldVariablesText: 'project_name=agent-world\nworking_directory=/tmp/agent-world'
    });
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('You are helping agent-world.');
    expect(messages[0]?.content).toContain('You are helping agent-world.\n\n---\nOnly use @mentions when handing off to another agent; for normal user replies, do not mention agents.');
    expect(messages[0]?.content).toContain('## Agent Skills');
    expect(messages[0]?.content).toContain('<available_skills>');
    expect(messages[0]?.content).toContain('<id>apprun-skills</id>');
    expect(messages[0]?.content).toContain('<description>Build AppRun components</description>');
    expect(messages[0]?.content).toContain('<id>pdf-extract</id>');
    expect(messages[0]?.content).toContain('<description>Extract PDF content</description>');
    expect(messages[0]?.content).toContain('If a user request would benefit from a skill\'s specialized instructions, execution guidance, or reference material, call `load_skill` to fetch the full instructions.');
    expect(messages[0]?.content).toContain('Skill IDs in <available_skills> are not tool names.');
    expect(messages[0]?.content).toContain('To use a skill, always call `load_skill` with `{ "skill_id": "<id>" }`.');
    expect(messages[0]?.content).toContain('After loading a skill, continue the user task using the loaded instructions.');
    expect(messages[0]?.content).toContain('Only use other tools, such as `shell_cmd`, when the loaded skill or the task actually requires them.');
    expect(messages[0]?.content).toContain('Only use @mentions when handing off to another agent; for normal user replies, do not mention agents.');
    expect(messages[0]?.content).toContain('Place each @<agent> at the start of a paragraph.');
    expect(messages[0]?.content).toContain('For multiple agents, use one paragraph-beginning mention per target.');
    expect(messages[0]?.content.indexOf('Only use @mentions')).toBeLessThan(messages[0]?.content.indexOf('## Agent Skills'));
  });

  test('loads AGENTS.md from the effective working directory into project instructions', async () => {
    mockProjectAgentsFiles({
      '/tmp/project-with-agents/AGENTS.md': '# Project Rules\n- Use project conventions',
    });

    const content = await buildProjectAgentsPromptSection('working_directory=/tmp/project-with-agents');
    expect(content).toContain('## Project Instructions');
    expect(content).toContain('<project_agents_md>');
    expect(content).toContain('# Project Rules\n- Use project conventions');
  });

  test('injects mention-format system rule even without custom agent system prompt', async () => {
    await updateWorld(worldId(), {
      variables: 'working_directory=/tmp/agent-world'
    });

    const agent = await createAgent(worldId(), {
      name: 'Prompt Agent No System Prompt',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: ''
    });

    const messages = await prepareMessagesForLLM(worldId(), agent, null);
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('## Agent Skills');
    expect(messages[0]?.content).toContain('Only use @mentions when handing off to another agent; for normal user replies, do not mention agents.');
    expect(messages[0]?.content).toContain('Place each @<agent> at the start of a paragraph.');
    expect(messages[0]?.content).not.toContain('\n\n---\n');
  });

  test('omits the Agent Skills section when no skills are available', async () => {
    mockedWaitForInitialSkillSync.mockResolvedValue({
      added: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      total: 0,
    });
    mockedGetSkillsForSystemPrompt.mockReturnValue([]);

    await updateWorld(worldId(), {
      variables: 'project_name=agent-world\nworking_directory=/tmp/no-agents'
    });

    const agent = await createAgent(worldId(), {
      name: 'Prompt Agent No Skills',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are helping agent-world.'
    });

    const messages = await prepareMessagesForLLM(worldId(), agent, null);
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('You are helping agent-world.\n\n---\nOnly use @mentions when handing off to another agent; for normal user replies, do not mention agents.');
    expect(messages[0]?.content).not.toContain('## Agent Skills');
    expect(messages[0]?.content).not.toContain('<available_skills>');
  });

  test('does not add a separator when the authored prompt is empty', async () => {
    await updateWorld(worldId(), {
      variables: 'working_directory=/tmp/agent-world'
    });

    const agent = await createAgent(worldId(), {
      name: 'Prompt Agent Empty Prompt',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: ''
    });

    const messages = await prepareMessagesForLLM(worldId(), agent, null);
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).not.toContain('\n\n---\n');
    expect(messages[0]?.content).toContain('## Agent Skills');
  });

  test('keeps unreadable AGENTS.md non-fatal and omits project instructions', async () => {
    mockedFsStat.mockResolvedValue({
      isFile: () => true,
    } as Awaited<ReturnType<typeof nodeFsPromises.stat>>);
    mockedFsReadFile.mockRejectedValue(Object.assign(new Error('permission denied'), { code: 'EACCES' }));

    await updateWorld(worldId(), {
      variables: 'working_directory=/tmp/unreadable-project'
    });

    const agent = await createAgent(worldId(), {
      name: 'Prompt Agent Unreadable AGENTS',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Unreadable AGENTS fallback.'
    });

    const messages = await prepareMessagesForLLM(worldId(), agent, null);
    expect(messages[0]?.content).toContain('Unreadable AGENTS fallback.');
    expect(messages[0]?.content).not.toContain('## Project Instructions');
    expect(messages[0]?.content).toContain('## Agent Skills');
  });

  test('evaluates AGENTS.md independently after working directory changes', async () => {
    mockProjectAgentsFiles({
      '/tmp/project-a/AGENTS.md': '# Project A',
      '/tmp/project-b/AGENTS.md': '# Project B',
    });

    const firstContent = await buildProjectAgentsPromptSection('working_directory=/tmp/project-a');
    const secondContent = await buildProjectAgentsPromptSection('working_directory=/tmp/project-b');

    expect(firstContent).toContain('# Project A');
    expect(secondContent).toContain('# Project B');
    expect(secondContent).not.toContain('# Project A');
  });

  test('preserves final prompt precedence after runtime tool rules are injected', async () => {
    mockProjectAgentsFiles({
      '/tmp/project-order/AGENTS.md': '# Ordered Project Rules',
    });

    const projectSection = await buildProjectAgentsPromptSection('working_directory=/tmp/project-order');
    const systemPromptSections = {
      authoredPrompt: 'Base system prompt for agent-world.',
      runtimeGuidanceSections: [
        'Only use @mentions when handing off to another agent; for normal user replies, do not mention agents.',
        'Place each @<agent> at the start of a paragraph.',
        'For multiple agents, use one paragraph-beginning mention per target.',
      ],
      projectInstructionSection: projectSection,
      skillSection: ['## Agent Skills', '<available_skills>', '</available_skills>'].join('\n'),
    };
    const runtimeMessages = appendToolRulesToSystemMessage([
      {
        role: 'system',
        content: composeSystemPromptFromSections(systemPromptSections),
        createdAt: new Date(),
        systemPromptSections,
      },
    ], ['shell_cmd'], {
      workingDirectory: '/tmp/project-order',
    });
    const systemContent = runtimeMessages[0]?.content ?? '';

    expect(systemContent.indexOf('Base system prompt for agent-world.')).toBeLessThan(systemContent.indexOf('When using `shell_cmd`'));
    expect(systemContent.indexOf('When using `shell_cmd`')).toBeLessThan(systemContent.indexOf('## Project Instructions'));
    expect(systemContent.indexOf('## Project Instructions')).toBeLessThan(systemContent.indexOf('## Agent Skills'));
  });

  test('appends tool rules to unstructured system prompts without heading-based insertion', () => {
    const runtimeMessages = appendToolRulesToSystemMessage([
      {
        role: 'system',
        content: 'Document these literal headings in prose: ## Project Instructions and ## Agent Skills.',
        createdAt: new Date(),
      },
    ], ['shell_cmd'], {
      workingDirectory: '/tmp/project-order',
    });

    const systemContent = runtimeMessages[0]?.content ?? '';
    expect(systemContent.startsWith('Document these literal headings in prose: ## Project Instructions and ## Agent Skills.')).toBe(true);
    expect(systemContent.indexOf('When using `shell_cmd`')).toBeGreaterThan(systemContent.indexOf('## Agent Skills.'));
  });

  test('passes skill-scope flags from environment to system-prompt skill lookup', async () => {
    process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS = 'false';
    process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS = 'false';

    await updateWorld(worldId(), {
      variables: 'working_directory=/tmp/agent-world'
    });

    const agent = await createAgent(worldId(), {
      name: 'Prompt Agent Scope Test',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'Scoped skills test.'
    });

    await prepareMessagesForLLM(worldId(), agent, null);
    expect(mockedSyncSkills).toHaveBeenCalledWith(expect.objectContaining({
      worldVariablesText: expect.any(String),
    }));
    expect(mockedGetSkillsForSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
      includeGlobal: false,
      includeProject: false,
      worldVariablesText: expect.any(String),
    }));
  });
});

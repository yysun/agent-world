/**
 * prepareMessagesForLLM Tests
 *
 * Purpose:
 * - Validate system prompt formatting behavior for LLM-ready messages.
 *
 * Features tested:
 * - Appends `working directory: <value>` line to system prompts.
 * - Uses world `working_directory` value when configured.
 * - Falls back to core default working directory when world `working_directory` is missing.
 * - Injects progressive `<available_skills>` prompt section from skill registry data.
 *
 * Implementation notes:
 * - Uses real in-memory world/agent setup via shared test helpers.
 * - Mocks skill registry APIs for deterministic prompt content.
 * - Focuses on prompt formatting only (no tool execution).
 *
 * Recent changes:
 * - 2026-02-16: Updated skill-registry mocking to `getSkillsForSystemPrompt` and added coverage for global/project skill-scope env flags.
 * - 2026-02-15: Added coverage to ensure system-level mention-format rule is injected even when agent has no custom system prompt.
 * - 2026-02-15: Added coverage for concise cross-agent addressing rule injection (`@<agent_id>, <message>`).
 * - 2026-02-14: Added coverage for `## Agent Skills` prompt injection and load_skill guidance.
 * - 2026-02-14: Updated default cwd expectation to core default working directory (user home fallback), replacing `./`.
 * - 2026-02-13: Added coverage for required working-directory system prompt suffix.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createAgent, updateWorld } from '../../core/managers.js';
import { LLMProvider } from '../../core/types.js';
import { getDefaultWorkingDirectory, prepareMessagesForLLM } from '../../core/utils.js';
import { getSkillSourceScope, getSkillsForSystemPrompt, waitForInitialSkillSync } from '../../core/skill-registry.js';
import { setupTestWorld } from '../helpers/world-test-setup.js';

vi.mock('../../core/skill-registry.js', () => ({
  getSkillSourceScope: vi.fn((skillId: string) => (skillId === 'apprun-skills' ? 'project' : 'global')),
  getSkillsForSystemPrompt: vi.fn(() => []),
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
const mockedWaitForInitialSkillSync = vi.mocked(waitForInitialSkillSync);

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

    delete process.env.AGENT_WORLD_ENABLE_GLOBAL_SKILLS;
    delete process.env.AGENT_WORLD_ENABLE_PROJECT_SKILLS;
    delete process.env.AGENT_WORLD_DISABLED_GLOBAL_SKILLS;
    delete process.env.AGENT_WORLD_DISABLED_PROJECT_SKILLS;
  });

  test('appends configured world working directory to system prompt', async () => {
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
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('You are helping agent-world.');
    expect(messages[0]?.content).toContain('working directory scope: /tmp/agent-world');
    expect(messages[0]?.content).toContain('## Agent Skills');
    expect(messages[0]?.content).toContain('<available_skills>');
    expect(messages[0]?.content).toContain('<id>apprun-skills</id>');
    expect(messages[0]?.content).toContain('<description>Build AppRun components</description>');
    expect(messages[0]?.content).toContain('<id>pdf-extract</id>');
    expect(messages[0]?.content).toContain('<description>Extract PDF content</description>');
    expect(messages[0]?.content).toContain('use the load_skill with skill id tool');
    expect(messages[0]?.content).toContain('Always use this format when addressing a specific agent: @<agent>, <message>.');
    expect(messages[0]?.content).toContain('Put @<agent> at the very start of the reply.');
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
    expect(messages[0]?.content).toContain('working directory scope: ');
    expect(messages[0]?.content).toContain('## Agent Skills');
    expect(messages[0]?.content).toContain('Always use this format when addressing a specific agent: @<agent>, <message>.');
    expect(messages[0]?.content).toContain('Put @<agent> at the very start of the reply.');
  });

  test('appends core default working directory when world value is missing', async () => {
    await updateWorld(worldId(), {
      variables: 'project_name=agent-world'
    });

    const agent = await createAgent(worldId(), {
      name: 'Prompt Agent Default',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are helping {{ project_name }}.'
    });

    const messages = await prepareMessagesForLLM(worldId(), agent, null);
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain(`working directory scope: ${getDefaultWorkingDirectory()}`);
    expect(messages[0]?.content).toContain('## Agent Skills');
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
    expect(mockedGetSkillsForSystemPrompt).toHaveBeenCalledWith({
      includeGlobal: false,
      includeProject: false,
    });
  });
});

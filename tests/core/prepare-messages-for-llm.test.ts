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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createAgent, updateWorld } from '../../core/managers.js';
import { LLMProvider } from '../../core/types.js';
import { prepareMessagesForLLM } from '../../core/utils.js';
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
    expect(messages[0]?.content).toContain('You are helping agent-world.\n\n---\n## Agent Skills');
    expect(messages[0]?.content).toContain('## Agent Skills');
    expect(messages[0]?.content).toContain('<available_skills>');
    expect(messages[0]?.content).toContain('<id>apprun-skills</id>');
    expect(messages[0]?.content).toContain('<description>Build AppRun components</description>');
    expect(messages[0]?.content).toContain('<id>pdf-extract</id>');
    expect(messages[0]?.content).toContain('<description>Extract PDF content</description>');
    expect(messages[0]?.content).toContain('use the load_skill with skill id tool');
    expect(messages[0]?.content).toContain('After successfully loading a skill, ALWAYS acknowledge it to the user');
    expect(messages[0]?.content).toContain('Only use @mentions when handing off to another agent; for normal user replies, do not mention agents.');
    expect(messages[0]?.content).toContain('Place each @<agent> at the start of a paragraph.');
    expect(messages[0]?.content).toContain('For multiple agents, use one paragraph-beginning mention per target.');
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
      variables: 'project_name=agent-world'
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

/**
 * prepareMessagesForLLM Tests
 *
 * Purpose:
 * - Validate system prompt formatting behavior for LLM-ready messages.
 *
 * Features tested:
 * - Appends `working directory: <value>` line to system prompts.
 * - Uses world `working_directory` value when configured.
 * - Falls back to `./` when world `working_directory` is missing.
 *
 * Implementation notes:
 * - Uses real in-memory world/agent setup via shared test helpers.
 * - Focuses on prompt formatting only (no tool execution).
 *
 * Recent changes:
 * - 2026-02-13: Added coverage for required working-directory system prompt suffix.
 */

import { describe, expect, test } from 'vitest';
import { createAgent, updateWorld } from '../../core/managers.js';
import { LLMProvider } from '../../core/types.js';
import { prepareMessagesForLLM } from '../../core/utils.js';
import { setupTestWorld } from '../helpers/world-test-setup.js';

describe('prepareMessagesForLLM', () => {
  const { worldId } = setupTestWorld({
    name: 'test-world-prepare-messages',
    description: 'System prompt formatting tests'
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
    expect(messages[0]?.content).toContain('working directory: /tmp/agent-world');
  });

  test('appends default working directory when world value is missing', async () => {
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
    expect(messages[0]?.content).toContain('working directory: ./');
  });
});

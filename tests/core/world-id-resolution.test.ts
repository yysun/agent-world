/**
 * World ID Resolution Integration Tests
 *
 * Features:
 * - Verifies core world lookup resolves by either stored ID or world name
 * - Covers renamed-world scenarios where world `id` and `toKebabCase(name)` differ
 * - Ensures world-scoped manager APIs (agents/chats) work with name-based identifiers
 *
 * Implementation Notes:
 * - Uses real manager APIs with test-world lifecycle cleanup in each test
 * - Avoids filesystem fixture mutation by creating/deleting isolated test worlds
 *
 * Recent Changes:
 * - 2026-02-10: Added regression coverage for world identifier normalization/resolution
 */

import { describe, expect, test } from 'vitest';
import {
  createAgent,
  createWorld,
  deleteWorld,
  getWorld,
  listAgents,
  listChats,
  updateWorld
} from '../../core/managers.js';
import { LLMProvider } from '../../core/types.js';

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('world identifier resolution', () => {
  test('getWorld resolves renamed world by normalized name', async () => {
    const suffix = uniqueSuffix();
    const originalName = `Function Gemma ${suffix}`;
    const renamedName = `FunctionGemma${suffix.replace(/-/g, '')}`;

    const world = await createWorld({ name: originalName, turnLimit: 5 });
    expect(world).toBeTruthy();

    try {
      const updated = await updateWorld(world!.id, { name: renamedName });
      expect(updated).toBeTruthy();
      expect(updated!.id).toBe(world!.id);
      expect(updated!.name).toBe(renamedName);

      const loadedByName = await getWorld(renamedName);
      expect(loadedByName).toBeTruthy();
      expect(loadedByName!.id).toBe(world!.id);
      expect(loadedByName!.name).toBe(renamedName);
    } finally {
      await deleteWorld(world!.id);
    }
  });

  test('agent and chat APIs resolve world by name when id/name diverge', async () => {
    const suffix = uniqueSuffix();
    const originalName = `Function Gemma ${suffix}`;
    const renamedName = `FunctionGemma${suffix.replace(/-/g, '')}`;

    const world = await createWorld({ name: originalName, turnLimit: 5 });
    expect(world).toBeTruthy();

    try {
      const updated = await updateWorld(world!.id, { name: renamedName });
      expect(updated).toBeTruthy();

      const createdAgent = await createAgent(renamedName, {
        name: `Resolver Agent ${suffix}`,
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4o-mini'
      });
      expect(createdAgent).toBeTruthy();

      const agentsByName = await listAgents(renamedName);
      expect(agentsByName.some(agent => agent.id === createdAgent.id)).toBe(true);

      const chatsByName = await listChats(renamedName);
      expect(chatsByName.length).toBeGreaterThan(0);
    } finally {
      await deleteWorld(world!.id);
    }
  });
});


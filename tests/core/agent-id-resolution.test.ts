/**
 * Agent ID Resolution Integration Tests
 *
 * Features:
 * - Verifies core agent lookup resolves by either stored ID or agent name
 * - Covers renamed-agent scenarios where agent `id` and `toKebabCase(name)` diverge
 * - Ensures agent-scoped manager APIs accept name-based identifiers
 *
 * Implementation Notes:
 * - Uses real manager APIs with isolated world lifecycle per test
 * - Avoids external dependencies and network usage
 *
 * Recent Changes:
 * - 2026-02-10: Added regression coverage for agent identifier normalization/resolution
 */

import { describe, expect, test } from 'vitest';
import {
  clearAgentMemory,
  createAgent,
  createWorld,
  deleteAgent,
  deleteWorld,
  getAgent,
  listAgents,
  updateAgent,
  updateAgentMemory
} from '../../core/managers.js';
import { LLMProvider } from '../../core/types.js';

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('agent identifier resolution', () => {
  test('agent APIs resolve by renamed agent name when id/name diverge', async () => {
    const suffix = uniqueSuffix();
    const world = await createWorld({ name: `Agent Resolve World ${suffix}`, turnLimit: 5 });
    expect(world).toBeTruthy();

    try {
      const created = await createAgent(world!.id, {
        name: `Function Agent ${suffix}`,
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4o-mini'
      });

      const renamedName = `FunctionAgent${suffix.replace(/-/g, '')}`;
      const renamed = await updateAgent(world!.id, created.id, { name: renamedName });
      expect(renamed).toBeTruthy();
      expect(renamed!.id).toBe(created.id);
      expect(renamed!.name).toBe(renamedName);

      const loadedByName = await getAgent(world!.id, renamedName);
      expect(loadedByName).toBeTruthy();
      expect(loadedByName!.id).toBe(created.id);

      const updatedByName = await updateAgent(world!.id, renamedName, { temperature: 0.33 });
      expect(updatedByName).toBeTruthy();
      expect(updatedByName!.id).toBe(created.id);
      expect(updatedByName!.temperature).toBe(0.33);

      const deletedByName = await deleteAgent(world!.id, renamedName);
      expect(deletedByName).toBe(true);

      const remainingAgents = await listAgents(world!.id);
      expect(remainingAgents.some(agent => agent.id === created.id)).toBe(false);
    } finally {
      await deleteWorld(world!.id);
    }
  });

  test('clearAgentMemory resolves agent by renamed name', async () => {
    const suffix = uniqueSuffix();
    const world = await createWorld({ name: `Agent Memory Resolve ${suffix}`, turnLimit: 5 });
    expect(world).toBeTruthy();

    try {
      const created = await createAgent(world!.id, {
        name: `Memory Agent ${suffix}`,
        type: 'assistant',
        provider: LLMProvider.OPENAI,
        model: 'gpt-4o-mini'
      });

      const renamedName = `MemoryAgent${suffix.replace(/-/g, '')}`;
      await updateAgent(world!.id, created.id, { name: renamedName });

      await updateAgentMemory(world!.id, created.id, [
        {
          role: 'user',
          content: 'test-memory'
        }
      ]);

      const beforeClear = await getAgent(world!.id, created.id);
      expect(beforeClear).toBeTruthy();
      expect((beforeClear!.memory || []).length).toBeGreaterThan(0);

      const cleared = await clearAgentMemory(world!.id, renamedName);
      expect(cleared).toBeTruthy();
      expect(cleared!.id).toBe(created.id);
      expect(cleared!.memory).toEqual([]);
    } finally {
      await deleteWorld(world!.id);
    }
  });
});


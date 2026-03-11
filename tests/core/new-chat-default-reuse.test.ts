/**
 * Purpose:
 * - Lock down the core new-chat contract that web E2E relies on.
 *
 * Key Features:
 * - Verifies empty default chats are reused instead of duplicated.
 * - Verifies a distinct chat is created once the default chat has persisted messages.
 *
 * Notes on Implementation:
 * - Uses the public core manager and event exports only.
 * - Polls persisted memory through the public API instead of inspecting internal storage details.
 *
 * Summary of Recent Changes:
 * - 2026-03-11: Added regression coverage for empty-chat reuse versus distinct chat creation.
 */

import { describe, expect, it } from 'vitest';
import { LLMProvider } from '../../core/types.js';
import { createAgent, getMemory, listChats, newChat, updateAgentMemory } from '../../core/managers.js';
import { setupTestWorld } from '../helpers/world-test-setup.js';

describe('newChat default chat reuse', () => {
  const { worldId, getWorld } = setupTestWorld({
    name: 'new-chat-default-reuse',
    description: 'Verify empty default chat reuse behavior',
    turnLimit: 5,
  });

  it('reuses the existing empty default chat', async () => {
    const world = await getWorld();

    expect(world).toBeTruthy();
    expect(world!.currentChatId).toBeTruthy();

    const initialChatId = world!.currentChatId!;
    const chatsBefore = await listChats(worldId());
    const updatedWorld = await newChat(worldId());
    const chatsAfter = await listChats(worldId());

    expect(updatedWorld).toBeTruthy();
    expect(updatedWorld!.currentChatId).toBe(initialChatId);
    expect(chatsAfter).toHaveLength(chatsBefore.length);
  });

  it('creates a distinct chat after the default chat has messages', async () => {
    const world = await getWorld();

    expect(world).toBeTruthy();
    expect(world!.currentChatId).toBeTruthy();

    const initialChatId = world!.currentChatId!;
    const agent = await createAgent(worldId(), {
      name: 'reuse-test-agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4o-mini',
    });

    await updateAgentMemory(worldId(), agent.id, [
      {
        role: 'user',
        content: 'seed token new-chat-default-reuse',
        chatId: initialChatId,
        messageId: 'seed-msg-1',
        createdAt: new Date('2026-03-11T12:00:00.000Z'),
      },
    ]);

    await expect.poll(async () => {
      const memory = await getMemory(worldId(), initialChatId);
      return Array.isArray(memory) ? memory.length : 0;
    }).toBeGreaterThan(0);

    const chatsBefore = await listChats(worldId());
    const updatedWorld = await newChat(worldId());
    const chatsAfter = await listChats(worldId());

    expect(updatedWorld).toBeTruthy();
    expect(updatedWorld!.currentChatId).not.toBe(initialChatId);
    expect(chatsAfter).toHaveLength(chatsBefore.length + 1);
  });
});

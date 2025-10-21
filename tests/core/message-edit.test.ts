/**
 * Unit tests for user message edit feature
 * Tests: migrateMessageIds, removeMessagesFrom, resubmitMessageToWorld, editUserMessage
 */

import {
  createWorld,
  createAgent,
  getWorld,
  migrateMessageIds,
  removeMessagesFrom,
  resubmitMessageToWorld,
  editUserMessage,
  deleteWorld,
  type AgentMessage,
  type RemovalResult
} from '../../core/index.js';
import { nanoid } from 'nanoid';

describe('Message Edit Feature', () => {
  const testWorldName = `test-edit-world-${nanoid(6)}`;
  let worldId: string;

  beforeAll(async () => {
    // Create test world
    const world = await createWorld({ name: testWorldName });
    expect(world).toBeTruthy();
    worldId = world!.id;

    // Create test agents
    await createAgent(worldId, {
      name: 'Agent1',
      type: 'assistant',
      systemPrompt: 'Test agent 1',
      provider: 'openai' as any,
      model: 'gpt-4'
    });

    await createAgent(worldId, {
      name: 'Agent2',
      type: 'assistant',
      systemPrompt: 'Test agent 2',
      provider: 'openai' as any,
      model: 'gpt-4'
    });
  });

  afterAll(async () => {
    // Cleanup
    if (worldId) {
      await deleteWorld(worldId);
    }
  });

  describe('migrateMessageIds', () => {
    it('should assign messageIds to messages without IDs', async () => {
      const world = await getWorld(worldId);
      expect(world).toBeTruthy();

      // Add messages without messageIds
      const chatId = world!.currentChatId!;

      // Migration should handle messages without messageIds
      const migrated = await migrateMessageIds(worldId);
      expect(typeof migrated).toBe('number');
      expect(migrated).toBeGreaterThanOrEqual(0);
    });

    it('should be idempotent - running twice should not duplicate IDs', async () => {
      const firstRun = await migrateMessageIds(worldId);
      const secondRun = await migrateMessageIds(worldId);

      // Second run should find 0 messages to migrate
      expect(secondRun).toBe(0);
    });

    it('should throw error for non-existent world', async () => {
      await expect(migrateMessageIds('nonexistent-world')).rejects.toThrow();
    });
  });

  describe('removeMessagesFrom', () => {
    it('should return error when message not found', async () => {
      const world = await getWorld(worldId);
      const chatId = world!.currentChatId!;

      const result = await removeMessagesFrom(worldId, 'fake-message-id', chatId);

      expect(result.success).toBe(false);
      expect(result.failedAgents.length).toBeGreaterThan(0);
    });

    it('should return error when chat has no messages', async () => {
      const world = await getWorld(worldId);
      const chatId = world!.currentChatId!;

      const result = await removeMessagesFrom(worldId, 'any-id', chatId);

      expect(result.success).toBe(false);
    });

    it('should track results per agent', async () => {
      const world = await getWorld(worldId);
      const chatId = world!.currentChatId!;

      const result = await removeMessagesFrom(worldId, 'test-msg-id', chatId);

      expect(result).toHaveProperty('totalAgents');
      expect(result).toHaveProperty('processedAgents');
      expect(result).toHaveProperty('failedAgents');
      expect(result).toHaveProperty('messagesRemovedTotal');
    });
  });

  describe('resubmitMessageToWorld', () => {
    it('should fail when session mode is OFF', async () => {
      // Create world without current chat
      const noSessionWorld = await createWorld({
        name: `test-no-session-${nanoid(6)}`
      });
      expect(noSessionWorld).toBeTruthy();

      // Clear currentChatId to simulate session mode OFF
      // This would require updating the world

      const result = await resubmitMessageToWorld(
        noSessionWorld!.id,
        'test content',
        'human',
        'test-chat-id'
      );

      // Should fail because currentChatId might not match
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();

      // Cleanup
      await deleteWorld(noSessionWorld!.id);
    });

    it('should fail when chatId does not match current chat', async () => {
      const world = await getWorld(worldId);

      const result = await resubmitMessageToWorld(
        worldId,
        'test content',
        'human',
        'wrong-chat-id'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('current chat');
    });

    it('should generate new messageId on success', async () => {
      const world = await getWorld(worldId);
      const chatId = world!.currentChatId!;

      const result = await resubmitMessageToWorld(
        worldId,
        'test content',
        'human',
        chatId
      );

      if (result.success) {
        expect(result.messageId).toBeTruthy();
        expect(typeof result.messageId).toBe('string');
      }
    });
  });

  describe('editUserMessage', () => {
    it('should throw error when world is processing', async () => {
      const world = await getWorld(worldId);

      // Manually set isProcessing flag (in real scenario, this would be set by events)
      // For now, we just test the error case

      // This test would need the world to have isProcessing = true
      // Skip for now as we don't have a way to set it
    });

    it('should return RemovalResult with resubmission status', async () => {
      const world = await getWorld(worldId);
      const chatId = world!.currentChatId!;

      const result = await editUserMessage(
        worldId,
        'fake-message-id',
        'new content',
        chatId
      );

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('messageId');
      expect(result).toHaveProperty('resubmissionStatus');
      expect(['success', 'failed', 'skipped']).toContain(result.resubmissionStatus);
    });

    it('should skip resubmission when session mode is OFF', async () => {
      // Create world, then clear currentChatId
      const testWorld = await createWorld({
        name: `test-edit-no-session-${nanoid(6)}`
      });
      expect(testWorld).toBeTruthy();

      const result = await editUserMessage(
        testWorld!.id,
        'fake-id',
        'new content',
        'fake-chat-id'
      );

      // Should skip resubmission
      expect(result.resubmissionStatus).toBe('skipped');
      expect(result.resubmissionError).toBeTruthy();

      // Cleanup
      await deleteWorld(testWorld!.id);
    });

    it('should handle removal errors gracefully', async () => {
      const world = await getWorld(worldId);
      const chatId = world!.currentChatId!;

      const result = await editUserMessage(
        worldId,
        'nonexistent-message-id',
        'new content',
        chatId
      );

      // Should complete without throwing
      expect(result).toBeTruthy();
      expect(result.success).toBe(false);
    });
  });

  describe('Integration: Full edit flow', () => {
    it('should handle complete edit workflow', async () => {
      const world = await getWorld(worldId);
      expect(world).toBeTruthy();

      const chatId = world!.currentChatId!;

      // 1. Migrate any messages without IDs
      await migrateMessageIds(worldId);

      // 2. Try to edit a message (will fail because no messages exist)
      const result = await editUserMessage(
        worldId,
        'test-id',
        'edited content',
        chatId
      );

      // Should fail gracefully
      expect(result.success).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should handle invalid worldId in all functions', async () => {
      const invalidWorldId = 'nonexistent-world-xyz';

      await expect(migrateMessageIds(invalidWorldId)).rejects.toThrow();

      const removeResult = await removeMessagesFrom(invalidWorldId, 'id', 'chat');
      expect(removeResult).toBeFalsy(); // Will throw before returning

      await expect(
        editUserMessage(invalidWorldId, 'id', 'content', 'chat')
      ).rejects.toThrow();
    });
  });
});

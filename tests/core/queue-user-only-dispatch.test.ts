/**
 * Queue User-Only Dispatch Tests
 *
 * Verifies external ingress queueing applies only to user messages and
 * non-user senders bypass queue with immediate event publish.
 */

import { describe, expect, it } from 'vitest';
import {
  createWorld,
  deleteWorld,
  enqueueAndProcessUserMessage,
  getQueueMessages,
  getWorld,
  listChats,
  restoreChat,
} from '../../core/managers.js';

function uniqueWorldName(): string {
  return `queue-user-only-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('enqueueAndProcessUserMessage', () => {
  it('does not enqueue non-user sender messages and publishes immediately', async () => {
    const world = await createWorld({ name: uniqueWorldName(), turnLimit: 5 });
    expect(world).toBeTruthy();

    try {
      const chats = await listChats(world!.id);
      const chatId = chats[0]?.id;
      expect(chatId).toBeTruthy();

      await restoreChat(world!.id, chatId!);
      const runtimeWorld = await getWorld(world!.id);
      expect(runtimeWorld).toBeTruthy();

      let receivedMessageId: string | null = null;
      runtimeWorld!.eventEmitter.once('message', (event: any) => {
        receivedMessageId = String(event?.messageId || '');
      });

      const preassignedMessageId = `immediate-${Date.now()}`;

      const result = await enqueueAndProcessUserMessage(
        world!.id,
        chatId!,
        'system broadcast',
        'system',
        runtimeWorld!,
        { preassignedMessageId }
      );

      expect(result).toBeNull();
      expect(receivedMessageId).toBe(preassignedMessageId);

      const queue = await getQueueMessages(world!.id, chatId!);
      expect(queue.length).toBe(0);
    } finally {
      await deleteWorld(world!.id);
    }
  });
});

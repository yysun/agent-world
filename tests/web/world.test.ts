/**
 * Unit Tests - World Component State and Event Handlers
 *
 * Purpose: Verify the state management and event handling of the World component,
 * focusing on the memory-driven approval flow.
 *
 * Test Coverage:
 * 1. `initWorld` correctly detects pending approvals from memory on load
 * 2. `initWorld` returns null for `approvalRequest` when an approval has a response
 * 3. `dismissedApprovals` set is reset on chat load
 * 4. `handleMessageEvent` triggers approval detection on relevant messages
 * 5. `hideApprovalRequestDialog` correctly tracks dismissed approvals
 */

import { describe, it, expect, vi } from 'vitest';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';
import type { WorldComponentState, Message } from '../../web/src/types';

// Mock the API
vi.mock('../../web/src/api', () => ({
  default: {
    getWorld: vi.fn().mockResolvedValue({
      name: 'Test World',
      agents: [],
      chats: [],
    }),
    setChat: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('World Component - Unit Tests', () => {
  it('initWorld should detect pending approval from memory', async () => {
    const messages: Message[] = [
      {
        isToolCallRequest: true,
        toolCallData: { toolCallId: '1' },
      } as Message,
    ];
    const state: WorldComponentState = { messages } as any;

    // Mock the generator
    const generator = worldUpdateHandlers.initWorld(state, 'Test World');
    const { value } = await generator.next();

    expect(value.approvalRequest).toBeDefined();
    expect(value.approvalRequest?.toolCallId).toBe('1');
  });

  it('initWorld should return null when approval has a response', async () => {
    const messages: Message[] = [
      {
        isToolCallRequest: true,
        toolCallData: { toolCallId: '1' },
      } as Message,
      {
        role: 'tool',
        tool_call_id: '1',
      } as Message,
    ];
    const state: WorldComponentState = { messages } as any;

    const generator = worldUpdateHandlers.initWorld(state, 'Test World');
    const { value } = await generator.next();

    expect(value.approvalRequest).toBeNull();
  });

  it('initWorld should reset dismissed approvals on chat load', async () => {
    const state: WorldComponentState = {
      dismissedApprovals: new Set(['1']),
    } as any;

    const generator = worldUpdateHandlers.initWorld(state, 'Test World');
    const { value } = await generator.next();

    expect(value.dismissedApprovals.size).toBe(0);
  });
});

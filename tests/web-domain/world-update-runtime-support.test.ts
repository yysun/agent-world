/**
 * Web World Update Runtime Support Tests
 *
 * Purpose:
 * - Verify extracted world runtime helper behavior remains stable after moving support logic out of `runtime.ts`.
 *
 * Coverage:
 * - Deduplicates repeated user messages while preserving agent replies in timestamp order.
 * - Preserves transient same-chat system/error rows across refresh hydration.
 * - Keeps existing UI-only agent sprite and message-count metadata when world data is refreshed.
 *
 * Recent Changes:
 * - 2026-03-24: Added regression coverage for the extracted runtime support helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  deduplicateMessages,
  mergeUpdatedWorldWithUiState,
  preserveTransientMessagesAcrossRefresh,
} from '../../web/src/features/world/update/runtime-support';

describe('web/world-update runtime support', () => {
  it('deduplicates repeated user messages while preserving agent rows', () => {
    const timestamp = '2026-03-24T10:00:00.000Z';
    const messages = [
      { id: 'u-1', type: 'user', sender: 'human', text: 'hello', messageId: 'm-1', createdAt: timestamp },
      { id: 'u-2', type: 'user', sender: 'human', text: 'hello', messageId: 'm-1', createdAt: timestamp },
      { id: 'a-1', type: 'agent', sender: 'writer', text: 'reply', messageId: 'm-2', createdAt: timestamp },
    ] as any[];

    const deduplicated = deduplicateMessages(messages, [{ id: 'writer', name: 'Writer' }] as any);

    expect(deduplicated).toHaveLength(2);
    expect(deduplicated[0]).toMatchObject({ id: 'a-1', type: 'agent' });
    expect(deduplicated[1]).toMatchObject({ id: 'u-1', type: 'user', seenByAgents: ['writer'] });
  });

  it('preserves transient same-chat system messages across refresh', () => {
    const existingMessages = [
      { id: 'sys-1', type: 'system', text: 'World updated', chatId: 'chat-1' },
      { id: 'err-1', type: 'error', text: 'Request failed', chatId: 'chat-2', hasError: true },
    ] as any[];
    const refreshedMessages = [
      { id: 'base-1', type: 'agent', text: 'fresh', chatId: 'chat-1' },
    ] as any[];

    const merged = preserveTransientMessagesAcrossRefresh(existingMessages, refreshedMessages, 'chat-1');

    expect(merged).toHaveLength(2);
    expect(merged.some((message) => message.id === 'sys-1')).toBe(true);
    expect(merged.some((message) => message.id === 'err-1')).toBe(false);
  });

  it('merges refreshed world data with existing ui-only agent metadata', () => {
    const currentWorld = {
      name: 'demo',
      agents: [
        { id: 'agent-1', name: 'Writer', spriteIndex: 7, messageCount: 42 },
      ],
    } as any;
    const updatedWorld = {
      name: 'demo',
      agents: [
        { id: 'agent-1', name: 'Writer' },
        { id: 'agent-2', name: 'Reviewer' },
      ],
    } as any;

    const merged = mergeUpdatedWorldWithUiState(currentWorld, updatedWorld);

    expect(merged.agents[0]).toMatchObject({ id: 'agent-1', spriteIndex: 7, messageCount: 42 });
    expect(merged.agents[1]).toMatchObject({ id: 'agent-2', spriteIndex: 1, messageCount: 0 });
  });
});
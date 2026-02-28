/**
 * Unit Tests for Electron Message Serialization
 *
 * Features:
 * - Validates chat-session normalization and deduplication behavior.
 * - Ensures human-message detection prioritizes sender over legacy role hints.
 *
 * Implementation Notes:
 * - Uses pure helper tests with no Electron runtime dependencies.
 *
 * Recent Changes:
 * - 2026-02-28: Added regression coverage ensuring realtime tool message serialization preserves `tool_call_id` for renderer-side request/result linking.
 * - 2026-02-19: Added coverage for realtime CRUD-event serialization payload shape.
 * - 2026-02-15: Added regression coverage for agent-sender messages persisted with `role: 'user'`.
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeSessionMessages,
  serializeRealtimeMessageEvent,
  serializeRealtimeCrudEvent
} from '../../../electron/main-process/message-serialization';

describe('normalizeSessionMessages', () => {
  it('does not classify agent-sender user-role message as a human-only duplicate', () => {
    const source = [
      {
        id: 'msg-1',
        messageId: 'msg-1',
        role: 'user',
        sender: 'g1',
        content: '@g2, good day!',
        createdAt: '2026-02-15T18:04:00.000Z',
        chatId: 'chat-1'
      }
    ];

    const normalized = normalizeSessionMessages(source);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].sender).toBe('g1');
    expect(normalized[0].role).toBe('user');
  });

  it('still treats explicit human sender as human message', () => {
    const source = [
      {
        id: 'msg-2',
        messageId: 'msg-2',
        role: 'user',
        sender: 'human',
        content: 'hello',
        createdAt: '2026-02-15T18:03:00.000Z',
        chatId: 'chat-1'
      }
    ];

    const normalized = normalizeSessionMessages(source);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].sender).toBe('human');
  });
});

describe('serializeRealtimeCrudEvent', () => {
  it('serializes CRUD payload for renderer chat events', () => {
    const payload = serializeRealtimeCrudEvent('world-1', 'chat-1', {
      operation: 'create',
      entityType: 'agent',
      entityId: 'agent-2',
      entityData: { id: 'agent-2', name: 'Agent 2' },
      timestamp: '2026-02-19T18:00:00.000Z'
    });

    expect(payload).toMatchObject({
      type: 'crud',
      worldId: 'world-1',
      chatId: 'chat-1',
      crud: {
        operation: 'create',
        entityType: 'agent',
        entityId: 'agent-2',
        entityData: { id: 'agent-2', name: 'Agent 2' },
        createdAt: '2026-02-19T18:00:00.000Z'
      }
    });
  });
});

describe('serializeRealtimeMessageEvent', () => {
  it('preserves tool_call_id on realtime tool messages', () => {
    const payload = serializeRealtimeMessageEvent('world-1', {
      messageId: 'msg-tool-1',
      role: 'tool',
      sender: 'shell_cmd',
      content: '{"status":"failed","exit_code":1}',
      tool_call_id: 'call_shell_1',
      chatId: 'chat-1',
      timestamp: '2026-02-28T12:00:00.000Z'
    });

    expect(payload).toMatchObject({
      type: 'message',
      worldId: 'world-1',
      chatId: 'chat-1',
      message: {
        messageId: 'msg-tool-1',
        role: 'tool',
        tool_call_id: 'call_shell_1',
      }
    });
  });
});

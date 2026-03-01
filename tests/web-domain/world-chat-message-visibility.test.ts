/**
 * Web World Chat Message Visibility Domain Tests
 *
 * Purpose:
 * - Validate transcript hide/show rules used by web world chat rendering.
 *
 * Key Features:
 * - Suppresses assistant HITL tool-call placeholder rows.
 * - Suppresses messages that carry a logEvent (server log events).
 * - Preserves normal assistant rows.
 * - Keeps existing internal protocol tool_result filtering behavior.
 *
 * Notes on Implementation:
 * - Tests pure domain helper only; no DOM rendering required.
 * - Uses deterministic in-memory message fixtures.
 *
 * Summary of Recent Changes:
 * - 2026-03-01: Added regression coverage for hiding messages with logEvent (server logs).
 * - 2026-02-28: Added regression coverage for hiding assistant `human_intervention_request` placeholder rows.
 */

import { describe, expect, it } from 'vitest';
import { shouldHideWorldChatMessage } from '../../web/src/domain/message-visibility';
import type { Message } from '../../web/src/types';

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    type: 'assistant',
    sender: 'a1',
    text: '',
    createdAt: new Date('2026-02-28T00:00:00.000Z'),
    ...overrides,
  };
}

describe('web world chat message visibility', () => {
  it('hides assistant HITL placeholder message by content text', () => {
    const message = createMessage({
      role: 'assistant',
      text: 'Calling tool: human_intervention_request',
      messageId: 'msg-hitl-content-1',
    });

    expect(shouldHideWorldChatMessage(message)).toBe(true);
  });

  it('hides assistant HITL placeholder message when tool call metadata is present', () => {
    const message = createMessage({
      role: 'assistant',
      text: 'Calling tool: human_intervention_request (skill_id: "ian-gemini-web")',
      messageId: 'msg-hitl-tool-call-1',
    }) as Message & {
      tool_calls: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    };
    message.tool_calls = [
      {
        id: 'call_hitl_1',
        type: 'function',
        function: {
          name: 'human_intervention_request',
          arguments: '{"question":"confirm?"}',
        },
      },
    ];

    expect(shouldHideWorldChatMessage(message)).toBe(true);
  });

  it('keeps non-HITL assistant content visible', () => {
    const message = createMessage({
      role: 'assistant',
      text: 'Here is the generated summary.',
      messageId: 'msg-normal-1',
    });

    expect(shouldHideWorldChatMessage(message)).toBe(false);
  });

  it('hides messages that carry a logEvent (server log events)', () => {
    const message = createMessage({
      text: 'some log message',
    }) as any;
    message.logEvent = { level: 'info', category: 'llm', message: 'some log message', timestamp: Date.now() };

    expect(shouldHideWorldChatMessage(message)).toBe(true);
  });

  it('does not hide messages without a logEvent', () => {
    const message = createMessage({ text: 'normal assistant response' });
    expect(shouldHideWorldChatMessage(message)).toBe(false);
  });
});

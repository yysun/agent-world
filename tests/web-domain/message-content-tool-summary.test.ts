/**
 * Tool Message One-Line Summary Tests
 *
 * Purpose:
 * - Verify web tool messages use the compact one-line label format used by desktop.
 *
 * Key Features:
 * - Covers running status for tool-call request rows.
 * - Covers failed status for stderr tool-result rows.
 * - Covers grouped naming for multiple tool calls on one assistant row.
 *
 * Notes on Implementation:
 * - Tests the pure `getToolOneLineSummary` helper only.
 * - Uses deterministic in-memory fixtures.
 *
 * Recent Changes:
 * - 2026-03-01: Initial test coverage added for one-line tool summary labels.
 */

import { describe, expect, it } from 'vitest';
import { getToolOneLineSummary } from '../../web/src/domain/message-content';
import type { Message } from '../../web/src/types';

function createMessage(overrides: Record<string, unknown>): Message {
  return {
    id: 'msg-1',
    type: 'assistant',
    sender: 'a1',
    text: '',
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  } as Message;
}

describe('getToolOneLineSummary', () => {
  it('returns running summary for assistant tool-call request rows', () => {
    const message = createMessage({
      role: 'assistant',
      combinedToolResults: [],
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'run_in_terminal',
            arguments: '{"command":"pwd"}',
          },
        },
      ],
    });

    expect(getToolOneLineSummary(message)).toBe('tool: run_in_terminal - running');
  });

  it('returns failed summary for stderr tool-result rows', () => {
    const message = createMessage({
      type: 'tool',
      role: 'tool',
      streamType: 'stderr',
      toolName: 'run_in_terminal',
      text: 'permission denied',
    });

    expect(getToolOneLineSummary(message)).toBe('tool: run_in_terminal - failed');
  });

  it('returns grouped tool name for multi-tool assistant rows', () => {
    const message = createMessage({
      role: 'assistant',
      combinedToolResults: [
        {
          id: 'res-1',
          type: 'tool',
          sender: 'a1',
          text: 'ok',
          createdAt: new Date('2026-03-01T00:00:01.000Z'),
          role: 'tool',
          tool_call_id: 'call-1',
        },
      ],
      tool_calls: [
        { id: 'call-1', type: 'function', function: { name: 'run_in_terminal', arguments: '{}' } },
        { id: 'call-2', type: 'function', function: { name: 'read_file', arguments: '{}' } },
      ],
    });

    expect(getToolOneLineSummary(message)).toBe('tool: run_in_terminal +1 more - done');
  });
});

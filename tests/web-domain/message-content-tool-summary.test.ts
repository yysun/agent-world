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
 * - 2026-03-11: Added legacy inline `Calling tool:` fallback coverage so live web tool cards still resolve a
 *   readable tool name before structured request metadata is present.
 * - 2026-03-06: Added JSON-serialized canonical failure coverage so web completed tool cards do not miss failed shell results after reload.
 * - 2026-03-06: Added regression coverage for canonical shell validation/policy failure reasons in merged web tool cards.
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

  it('returns running summary for inline tool-request text without tool_calls metadata', () => {
    const message = createMessage({
      role: 'assistant',
      text: 'Calling tool: shell_cmd (command: "pwd")',
      combinedToolResults: [],
    });

    expect(getToolOneLineSummary(message)).toBe('tool: shell_cmd - running');
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

  it('returns failed summary when merged canonical tool result carries a validation or approval failure reason', () => {
    const message = createMessage({
      role: 'assistant',
      combinedToolResults: [
        {
          id: 'res-approval',
          type: 'tool',
          sender: 'a1',
          content: 'status: failed\nexit_code: null\nreason: approval_denied\nstderr_preview:\nrequest was not approved',
          createdAt: new Date('2026-03-01T00:00:01.000Z'),
          role: 'tool',
          tool_call_id: 'call-1',
        },
      ],
      tool_calls: [
        { id: 'call-1', type: 'function', function: { name: 'shell_cmd', arguments: '{"command":"curl"}' } },
      ],
    });

    expect(getToolOneLineSummary(message)).toBe('tool: shell_cmd - failed');
  });

  it('returns failed summary when merged canonical tool result is serialized as JSON', () => {
    const message = createMessage({
      role: 'assistant',
      combinedToolResults: [
        {
          id: 'res-json-failure',
          type: 'tool',
          sender: 'a1',
          content: JSON.stringify({
            status: 'failed',
            exit_code: null,
            timed_out: false,
            canceled: false,
            reason: 'approval_denied',
            stderr_preview: 'request was not approved',
          }),
          createdAt: new Date('2026-03-01T00:00:01.000Z'),
          role: 'tool',
          tool_call_id: 'call-1',
        },
      ],
      tool_calls: [
        { id: 'call-1', type: 'function', function: { name: 'shell_cmd', arguments: '{"command":"curl"}' } },
      ],
    });

    expect(getToolOneLineSummary(message)).toBe('tool: shell_cmd - failed');
  });
});

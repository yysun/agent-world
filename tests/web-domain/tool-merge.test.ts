/**
 * Tool Merge Domain Tests
 *
 * Purpose:
 * - Validate buildCombinedRenderableMessages merges tool request + result rows.
 *
 * Key Features:
 * - Tool result rows matched by tool_call_id are attached to the request row
 *   as combinedToolResults and filtered from the top-level array.
 * - Streaming tool rows (isToolStreaming=true) are left standalone.
 * - Messages without matching results pass through unchanged.
 * - Messages that are not tool-related pass through unchanged.
 *
 * Notes on Implementation:
 * - Pure function; no I/O, no DOM.
 *
 * Recent Changes:
 * - 2026-03-01: Initial test file created.
 */

import { describe, it, expect } from 'vitest';
import { buildCombinedRenderableMessages } from '../../web/src/domain/tool-merge';
import type { Message } from '../../web/src/types';

function makeRequest(overrides: Record<string, any> = {}): Message {
  return {
    id: 'req-1',
    type: 'assistant',
    sender: 'agent',
    text: 'Calling tool: my_tool',
    createdAt: new Date(),
    role: 'assistant',
    tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'my_tool', arguments: '{}' } }],
    ...overrides,
  } as unknown as Message;
}

function makeResult(overrides: Record<string, any> = {}): Message {
  return {
    id: 'res-1',
    type: 'tool',
    sender: 'agent',
    text: 'result text',
    createdAt: new Date(),
    role: 'tool',
    tool_call_id: 'call-1',
    messageId: 'msgid-res-1',
    ...overrides,
  } as unknown as Message;
}

function makeHuman(overrides: Record<string, any> = {}): Message {
  return {
    id: 'human-1',
    type: 'user',
    sender: 'human',
    text: 'hello',
    createdAt: new Date(),
    ...overrides,
  } as unknown as Message;
}

describe('buildCombinedRenderableMessages', () => {
  it('returns identical list when no tool messages present', () => {
    const msgs = [makeHuman(), makeHuman({ id: 'human-2', text: 'world' })];
    const result = buildCombinedRenderableMessages(msgs);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('human-1');
  });

  it('merges a tool result into the matching request row', () => {
    const req = makeRequest();
    const res = makeResult();
    const result = buildCombinedRenderableMessages([req, res]);

    // Result row should be consumed (not top-level)
    expect(result).toHaveLength(1);
    // Request row should have combinedToolResults attached
    const merged = result[0] as any;
    expect(Array.isArray(merged.combinedToolResults)).toBe(true);
    expect(merged.combinedToolResults).toHaveLength(1);
    expect(merged.combinedToolResults[0].id).toBe('res-1');
  });

  it('leaves request row unchanged when no matching result exists', () => {
    const req = makeRequest();
    const result = buildCombinedRenderableMessages([req]);
    expect(result).toHaveLength(1);
    expect((result[0] as any).combinedToolResults).toBeUndefined();
  });

  it('does not merge streaming tool rows', () => {
    const req = makeRequest();
    const streamingRes = makeResult({ isToolStreaming: true, messageId: 'msgid-stream-1' });
    const result = buildCombinedRenderableMessages([req, streamingRes]);

    // Streaming result stays standalone; request has no combinedToolResults
    expect(result).toHaveLength(2);
    expect((result[0] as any).combinedToolResults).toBeUndefined();
  });

  it('passes non-tool human messages through unchanged', () => {
    const human = makeHuman();
    const req = makeRequest({ id: 'req-x' });
    const res = makeResult({ id: 'res-x', messageId: 'msgid-res-x' });
    const result = buildCombinedRenderableMessages([human, req, res]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('human-1');
  });
});

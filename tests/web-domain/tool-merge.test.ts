/**
 * Tool Merge Domain Tests
 *
 * Purpose:
 * - Validate buildCombinedRenderableMessages merges tool request + result rows.
 *
 * Key Features:
 * - Tool result rows matched by tool_call_id are attached to the request row
 *   as combinedToolResults and filtered from the top-level array.
 * - Linked streaming tool rows (isToolStreaming=true) are attached to the request row
 *   as combinedToolStreams and filtered from the top-level array.
 * - Messages without matching results pass through unchanged.
 * - Messages that are not tool-related pass through unchanged.
 *
 * Notes on Implementation:
 * - Pure function; no I/O, no DOM.
 *
 * Recent Changes:
 * - 2026-03-11: Added regression coverage for assistant streaming request rows that only carry legacy
 *   inline `text` (`Calling tool: ...`) before structured `tool_calls` metadata arrives.
 * - 2026-03-06: Added transcript-restore coverage for canonical shell request+result pairs and legacy assistant stdout mirror row compatibility.
 * - 2026-03-01: Initial test file created.
 * - 2026-03-01: Updated expectations so tool request rows always include `combinedToolResults` (empty while running).
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

  it('restores a completed shell card from assistant request plus canonical tool result only', () => {
    const req = makeRequest({
      text: 'Calling tool: shell_cmd',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'shell_cmd', arguments: '{"command":"pwd"}' } }],
    });
    const res = makeResult({
      text: 'status: success\nexit_code: 0\nstdout_preview:\n/Users/esun/project',
      content: 'status: success\nexit_code: 0\nstdout_preview:\n/Users/esun/project',
    });

    const result = buildCombinedRenderableMessages([req, res]);

    expect(result).toHaveLength(1);
    const merged = result[0] as any;
    expect(Array.isArray(merged.combinedToolResults)).toBe(true);
    expect(merged.combinedToolResults).toHaveLength(1);
    expect(String(merged.combinedToolResults[0].content || '')).toContain('stdout_preview:');
  });

  it('returns request row with empty combined results when no matching result exists', () => {
    const req = makeRequest();
    const result = buildCombinedRenderableMessages([req]);
    expect(result).toHaveLength(1);
    expect(Array.isArray((result[0] as any).combinedToolResults)).toBe(true);
    expect((result[0] as any).combinedToolResults).toHaveLength(0);
  });

  it('passes assistant streaming text through unchanged when tool_calls metadata has not arrived yet', () => {
    const liveRequest = makeRequest({
      id: 'req-inline',
      text: 'Calling tool: shell_cmd (command: "pwd")',
      content: undefined,
      tool_calls: undefined,
      isStreaming: true,
    });

    const result = buildCombinedRenderableMessages([liveRequest]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('req-inline');
    // Without tool_calls, the message is not a tool request — it passes through
    // unchanged, matching Electron behavior where only structured tool_calls
    // trigger the merge path.
    expect((result[0] as any).combinedToolResults).toBeUndefined();
  });

  it('merges linked streaming tool rows into the request row', () => {
    const req = makeRequest();
    const streamingRes = makeResult({
      id: 'stream-1',
      isToolStreaming: true,
      messageId: 'msgid-stream-1',
      toolCallId: 'call-1',
      role: 'tool',
      text: 'line 1',
    });
    const result = buildCombinedRenderableMessages([req, streamingRes]);

    expect(result).toHaveLength(1);
    expect(Array.isArray((result[0] as any).combinedToolResults)).toBe(true);
    expect((result[0] as any).combinedToolResults).toHaveLength(0);
    expect(Array.isArray((result[0] as any).combinedToolStreams)).toBe(true);
    expect((result[0] as any).combinedToolStreams).toHaveLength(1);
    expect((result[0] as any).combinedToolStreams[0].id).toBe('stream-1');
  });

  it('passes non-tool human messages through unchanged', () => {
    const human = makeHuman();
    const req = makeRequest({ id: 'req-x' });
    const res = makeResult({ id: 'res-x', messageId: 'msgid-res-x' });
    const result = buildCombinedRenderableMessages([human, req, res]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('human-1');
  });

  it('keeps narrated assistant tool-call messages as regular cards when content is in text field (web Message shape)', () => {
    // Web Messages use `text` (not `content`) — createMessageFromMemory maps content→text.
    // This reproduces the real-world scenario from chat-1773416220554-68tfbw6py.
    const narrated = makeRequest({
      id: 'narrated-web',
      text: 'I\'ve loaded the yt-dlp skill to search YouTube videos. I will now search for the 10 most recent YouTube videos.',
      content: undefined,
      tool_calls: [{ id: 'call-w', type: 'function', function: { name: 'shell_cmd', arguments: '{}' } }],
    });
    const res = makeResult({ id: 'res-w', tool_call_id: 'call-w', messageId: 'msgid-res-w' });

    const result = buildCombinedRenderableMessages([narrated, res]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('narrated-web');
    expect((result[0] as any).combinedToolResults).toBeUndefined();
    expect(result[1].id).toBe('res-w');
  });

  it('keeps narrated assistant tool-call messages as regular cards instead of merging them as tool requests', () => {
    const narrated = makeRequest({
      id: 'narrated-1',
      text: 'I will now run the command for you.',
      content: 'I will now run the command for you.',
      tool_calls: [{ id: 'call-n', type: 'function', function: { name: 'shell_cmd', arguments: '{"command":"ls"}' } }],
    });
    const res = makeResult({ id: 'res-n', tool_call_id: 'call-n', messageId: 'msgid-res-n' });

    const result = buildCombinedRenderableMessages([narrated, res]);

    // Narrated assistant messages should pass through unchanged; tool result stays standalone
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('narrated-1');
    expect((result[0] as any).combinedToolResults).toBeUndefined();
    expect(result[1].id).toBe('res-n');
  });

  it('keeps legacy assistant stdout mirror rows visible while still merging the canonical tool result', () => {
    const req = makeRequest({
      id: 'req-shell',
      text: 'Calling tool: shell_cmd',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'shell_cmd', arguments: '{"command":"ls"}' } }],
    });
    const legacyStdout = {
      id: 'legacy-stdout',
      type: 'assistant',
      sender: 'agent',
      text: 'file-a\nfile-b',
      content: 'file-a\nfile-b',
      createdAt: new Date(),
      role: 'assistant',
      messageId: 'call-1-stdout',
    } as unknown as Message;
    const res = makeResult({
      id: 'res-shell',
      messageId: 'msgid-res-shell',
      text: 'status: success\nexit_code: 0\nstdout_preview:\nfile-a\nfile-b',
      content: 'status: success\nexit_code: 0\nstdout_preview:\nfile-a\nfile-b',
    });

    const result = buildCombinedRenderableMessages([req, legacyStdout, res]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('req-shell');
    expect(Array.isArray((result[0] as any).combinedToolResults)).toBe(true);
    expect((result[0] as any).combinedToolResults).toHaveLength(1);
    expect(result[1].id).toBe('legacy-stdout');
    expect(result[1].text).toContain('file-a');
  });
});

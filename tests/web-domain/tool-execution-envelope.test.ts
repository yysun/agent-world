/**
 * Web Tool Execution Envelope Tests
 *
 * Purpose:
 * - Verify web transcript helpers consume persisted tool execution envelopes.
 *
 * Key Features:
 * - Extract preview display text from enveloped tool rows.
 * - Prefer preview payloads for custom renderer matching utilities.
 *
 * Notes on Implementation:
 * - Uses pure web-domain helpers with deterministic in-memory fixtures.
 *
 * Recent Changes:
 * - 2026-03-06: Added merged-tool renderer resolution coverage so completed cards can recover explicit preview payloads from attached tool-result rows.
 * - 2026-03-06: Initial envelope parsing and preview extraction coverage.
 */

import { describe, expect, it } from 'vitest';
import { getCustomRendererMatch } from '../../web/src/domain/custom-renderers';
import { getToolPreviewMaxLines } from '../../web/src/domain/message-content';
import { extractToolPayload } from '../../web/src/domain/renderers/custom-renderer-utils';
import { getToolPreviewDisplayText } from '../../web/src/domain/tool-execution-envelope';
import type { Message } from '../../web/src/types';

function makeToolMessage(content: string): Message {
  return {
    id: 'tool-1',
    type: 'tool',
    sender: 'agent',
    text: content,
    createdAt: new Date('2026-03-06T12:00:00.000Z'),
    role: 'tool',
    tool_call_id: 'call-1',
  } as unknown as Message;
}

describe('web tool execution envelope helpers', () => {
  it('uses a 10-line viewport for markdown tool previews', () => {
    expect(getToolPreviewMaxLines()).toBe(10);
  });

  it('returns preview display text from persisted tool envelopes', () => {
    const message = makeToolMessage(JSON.stringify({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'shell_cmd',
      tool_call_id: 'call-1',
      status: 'completed',
      preview: [
        { kind: 'text', renderer: 'text', text: 'status: success\nexit_code: 0' },
        { kind: 'artifact', renderer: 'file', artifact: { path: '/tmp/out.txt', display_name: 'out.txt' } },
      ],
      result: 'status: success\nexit_code: 0',
    }));

    expect(getToolPreviewDisplayText(message)).toContain('status: success');
    expect(getToolPreviewDisplayText(message)).toContain('out.txt');
  });

  it('returns markdown preview text from persisted tool envelopes', () => {
    const message = makeToolMessage(JSON.stringify({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'shell_cmd',
      tool_call_id: 'call-1',
      status: 'completed',
      preview: {
        kind: 'markdown',
        renderer: 'markdown',
        text: '# Command Execution\n\nCommand: codex exec\n\nStatus: done',
      },
      result: 'status: success\nexit_code: 0',
    }));

    expect(getToolPreviewDisplayText(message)).toContain('Command Execution');
    expect(getToolPreviewDisplayText(message)).toContain('Status: done');
  });

  it('prefers envelope preview payloads for custom renderer extraction', () => {
    const message = makeToolMessage(JSON.stringify({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'load_skill',
      tool_call_id: 'call-1',
      status: 'completed',
      preview: {
        kind: 'url',
        renderer: 'youtube',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      result: '<skill_context id="demo"></skill_context>',
    }));

    expect(extractToolPayload(message)).toEqual({
      kind: 'url',
      renderer: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  });

  it('treats explicit live tool event preview payload objects as renderable preview content', () => {
    const message = {
      id: 'tool-live-1',
      type: 'tool',
      sender: 'agent',
      text: '✅ load_skill completed',
      createdAt: new Date('2026-03-06T12:00:00.000Z'),
      role: 'tool',
      tool_call_id: 'call-1',
      toolExecution: {
        toolName: 'load_skill',
        preview: {
          kind: 'url',
          renderer: 'youtube',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
        result: '<skill_context id="demo"></skill_context>',
      },
    } as unknown as Message;

    expect(getToolPreviewDisplayText(message)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(extractToolPayload(message)).toEqual({
      kind: 'url',
      renderer: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
  });

  it('does not infer preview rendering from ordinary result objects that only happen to have a kind field', () => {
    const message = {
      id: 'tool-live-2',
      type: 'tool',
      sender: 'agent',
      text: '✅ create_agent completed',
      createdAt: new Date('2026-03-06T12:00:00.000Z'),
      role: 'tool',
      tool_call_id: 'call-2',
      toolExecution: {
        toolName: 'create_agent',
        result: {
          kind: 'create_agent_created',
          name: 'Alice',
        },
      },
    } as unknown as Message;

    expect(getToolPreviewDisplayText(message)).toBeNull();
    expect(extractToolPayload(message)).toEqual({
      kind: 'create_agent_created',
      name: 'Alice',
    });
  });

  it('matches a custom renderer from merged tool-result rows when the assistant request row has no direct preview', () => {
    const assistantMessage = {
      id: 'assistant-1',
      type: 'assistant',
      sender: 'agent',
      text: 'Calling tool: load_skill',
      createdAt: new Date('2026-03-06T12:00:00.000Z'),
      role: 'assistant',
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'load_skill', arguments: '{}' } }],
    } as unknown as Message;
    const resultMessage = makeToolMessage(JSON.stringify({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'load_skill',
      tool_call_id: 'call-1',
      status: 'completed',
      preview: {
        kind: 'url',
        renderer: 'youtube',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      result: '<skill_context id="demo"></skill_context>',
    }));

    const match = getCustomRendererMatch(assistantMessage, [resultMessage]);

    expect(match?.renderer.id).toBe('youtube-video');
    expect(match?.message).toBe(resultMessage);
  });
});

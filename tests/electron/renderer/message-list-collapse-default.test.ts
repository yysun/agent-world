/**
 * MessageListPanel Default Collapse Policy Tests
 *
 * Purpose:
 * - Verify tool transcript rows collapse by default while assistant cards stay expanded.
 *
 * Recent changes:
 * - 2026-03-21: Added regression coverage so completed merged tool request rows stay collapsed by default and use tool-call ids as collapse keys when no message id is present.
 * - 2026-03-13: Updated regression coverage so tool rows default to collapsed and assistant cards remain expanded.
 */

import { describe, expect, it, vi } from 'vitest';

const { jsxFactory } = vi.hoisted(() => ({
  jsxFactory: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({
    type,
    props: props ?? {},
    key,
  }),
}));

vi.mock('react', () => ({
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
}), { virtual: true });

vi.mock('react/jsx-runtime', () => ({
  Fragment: 'Fragment',
  jsx: jsxFactory,
  jsxs: jsxFactory,
}), { virtual: true });

vi.mock('react/jsx-dev-runtime', () => ({
  Fragment: 'Fragment',
  jsxDEV: jsxFactory,
}), { virtual: true });

import {
  getInitialMessageCollapsedState,
  getMessageCollapseKey,
  getMessageCollapseToggleLabel,
} from '../../../electron/renderer/src/components/MessageListPanel';

describe('MessageListPanel default collapse policy', () => {
  it('returns the visible Electron collapse-toggle label from the current state', () => {
    expect(getMessageCollapseToggleLabel(true)).toBe('Open');
    expect(getMessageCollapseToggleLabel(false)).toBe('Collapse');
  });

  it('defaults collapsible tool rows to collapsed', () => {
    const toolMessage = {
      role: 'tool',
      content: '{"status":"done"}',
    };

    expect(getInitialMessageCollapsedState(toolMessage, true)).toBe(true);
  });

  it('defaults merged completed tool rows to collapsed like web tool rows', () => {
    const mergedToolMessage = {
      role: 'assistant',
      content: 'Calling tool: shell_cmd',
      tool_calls: [
        {
          id: 'call_merged_1',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: '{"command":"pwd"}',
          },
        },
      ],
      combinedToolResults: [
        {
          role: 'tool',
          tool_call_id: 'call_merged_1',
          content: 'status: success\nexit_code: 0',
        },
      ],
    };

    expect(getInitialMessageCollapsedState(mergedToolMessage, true)).toBe(true);
  });

  it('keeps completed merged tool request rows collapsible while defaulting them to collapsed', () => {
    const mergedToolMessage = {
      messageId: 'assistant-tool-1',
      role: 'assistant',
      content: 'Calling tool: search',
      tool_calls: [
        {
          id: 'call_search_1',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"query":"latest"}',
          },
        },
      ],
      combinedToolResults: [
        {
          role: 'tool',
          tool_call_id: 'call_search_1',
          content: 'Error executing tool: Tool not found: search',
        },
      ],
    };

    const isToolMessage = true;
    const isToolRequestMessage = true;
    const hasMergedToolContent = Array.isArray((mergedToolMessage as any).combinedToolResults)
      && (mergedToolMessage as any).combinedToolResults.length > 0;
    const isCollapsible = isToolMessage && (!isToolRequestMessage || hasMergedToolContent);

    expect(isCollapsible).toBe(true);
    expect(getInitialMessageCollapsedState(mergedToolMessage, isCollapsible)).toBe(true);
  });

  it('uses the tool call id as the collapse key when a tool request row has no message id', () => {
    const toolRequestMessage = {
      role: 'assistant',
      content: 'Calling tool: search',
      tool_calls: [
        {
          id: 'call_search_1',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"query":"latest"}',
          },
        },
      ],
      combinedToolResults: [
        {
          role: 'tool',
          tool_call_id: 'call_search_1',
          content: 'Error executing tool: Tool not found: search',
        },
      ],
    };

    expect(getMessageCollapseKey(toolRequestMessage)).toBe('call_search_1');
  });

  it('defaults collapsible assistant rows to expanded', () => {
    const assistantMessage = {
      role: 'assistant',
      content: 'I will write and render score',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'write_file',
            arguments: '{"filePath":"./score.musicxml","content":"<xml/>"}',
          },
        },
      ],
    };

    expect(getInitialMessageCollapsedState(assistantMessage, true)).toBe(false);
  });
});

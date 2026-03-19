/**
 * Electron Renderer Message Content Status Label Tests
 *
 * Purpose:
 * - Verify tool status label formatting and tool-name resolution behavior.
 *
 * Key Features:
 * - Enforces `tool: <name> - <status>` label format.
 * - Verifies resolved-name override support for history rows missing direct tool metadata.
 * - Verifies fallback to `toolExecution.toolName` metadata.
 *
 * Implementation Notes:
 * - Tests pure helper output only; no DOM rendering is required.
 * - Uses deterministic in-memory message fixtures.
 *
 * Summary of Recent Changes:
 * - 2026-03-06: Added regression coverage for canonical shell validation/policy failure reasons in renderer tool status labels.
 * - 2026-03-01: Added regression coverage to preserve meaningful planning text in merged tool request/result body content.
 * - 2026-02-28: Added regression coverage for tool-body rendering with linked assistant request metadata (`Args` + `Result`).
 * - 2026-02-28: Added regression coverage for tool-name-inclusive status labels.
 */

import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

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
  useEffect: () => undefined,
  useState: (initial: unknown) => [initial, vi.fn()],
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

const desktopApiMock = {
  openExternalLink: vi.fn(async () => ({ opened: true })),
};

vi.mock('../../../electron/renderer/src/domain/desktop-api', () => ({
  readDesktopApi: () => desktopApiMock,
}));

import {
  default as MessageContent,
  formatReasoningDuration,
  getExternalMessageLinkFromTarget,
  getReasoningElapsedMs,
  getReasoningHeaderLabel,
  getInitialReasoningCollapsedState,
  getToolBodyContent,
  handleMessageExternalLinkClick,
  getToolStatusLabel
} from '../../../electron/renderer/src/components/MessageContent';

function findNode(root: any, predicate: (node: any) => boolean): any {
  if (!root || typeof root !== 'object') {
    return null;
  }

  if (predicate(root)) {
    return root;
  }

  const children = root?.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findNode(child, predicate);
      if (found) {
        return found;
      }
    }
    return null;
  }

  return findNode(children, predicate);
}

function collectRenderedText(root: any): string {
  if (typeof root === 'string') {
    return root;
  }
  if (!root || typeof root !== 'object') {
    return '';
  }

  const children = root?.props?.children;
  if (Array.isArray(children)) {
    return children.map((child) => collectRenderedText(child)).join('');
  }

  return collectRenderedText(children);
}

describe('message content tool status label', () => {
  it('extracts only safe absolute external message links from clicked anchors', () => {
    const target = {
      closest: vi.fn(() => ({
        getAttribute: vi.fn(() => 'https://example.com/docs')
      }))
    };

    expect(getExternalMessageLinkFromTarget(target as any)).toBe('https://example.com/docs');
    expect(getExternalMessageLinkFromTarget({
      closest: vi.fn(() => ({
        getAttribute: vi.fn(() => '/docs')
      }))
    } as any)).toBeNull();
    expect(getExternalMessageLinkFromTarget({
      closest: vi.fn(() => ({
        getAttribute: vi.fn(() => 'javascript:alert(1)')
      }))
    } as any)).toBeNull();
    expect(getExternalMessageLinkFromTarget({
      closest: vi.fn(() => ({
        href: 'sms:+15551234567',
        getAttribute: vi.fn(() => 'sms:+15551234567')
      }))
    } as any)).toBe('sms:+15551234567');
    expect(getExternalMessageLinkFromTarget({
      nodeType: 3,
      parentElement: {
        closest: vi.fn(() => ({
          getAttribute: vi.fn(() => 'https://example.com/from-text-node')
        }))
      }
    } as any)).toBe('https://example.com/from-text-node');
    expect(getExternalMessageLinkFromTarget({
      closest: vi.fn(() => ({
        getAttribute: vi.fn(() => null),
        href: '',
        textContent: 'https://www.youtube.com/watch?v=Gaf_jCnA6mc'
      }))
    } as any)).toBe('https://www.youtube.com/watch?v=Gaf_jCnA6mc');
    expect(getExternalMessageLinkFromTarget({
      closest: vi.fn(() => ({
        href: 'https://docs.example.com/extensions/apps/build',
        getAttribute: vi.fn(() => '/extensions/apps/build'),
        textContent: 'Build an MCP App'
      }))
    } as any)).toBe('https://docs.example.com/extensions/apps/build');
  });

  it('prevents default and opens safe markdown links externally', async () => {
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const openExternalLink = vi.fn(async () => ({ opened: true }));

    const handled = handleMessageExternalLinkClick({
      target: {
        closest: () => ({
          getAttribute: () => 'https://example.com/docs'
        })
      },
      preventDefault,
      stopPropagation,
      defaultPrevented: false,
    } as any, openExternalLink);

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(openExternalLink).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('wires markdown container clicks to the desktop bridge opener', () => {
    desktopApiMock.openExternalLink.mockClear();

    const tree = MessageContent({
      message: {
        role: 'assistant',
        content: '[Docs](https://example.com/docs)',
      },
      collapsed: false,
      reasoningCollapsed: true,
      onToggleReasoningCollapsed: vi.fn(),
      isToolCallPending: false,
      showToolHeader: true,
      streamingDotsLabel: 'model',
      streamingInputPreview: '',
    });

    tree.props.onClick({
      target: {
        closest: () => ({
          getAttribute: () => 'https://example.com/docs'
        })
      },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      defaultPrevented: false,
    });

    expect(desktopApiMock.openExternalLink).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('formats label as tool-name-status when direct tool name exists', () => {
    const label = getToolStatusLabel({
      role: 'tool',
      toolName: 'shell_cmd',
      content: '{"ok":true}',
    });

    expect(label).toBe('tool: shell_cmd - done');
  });

  it('uses resolved tool-name override for history tool rows', () => {
    const label = getToolStatusLabel({
      role: 'tool',
      content: '{"ok":true}',
    }, false, 'human_intervention_request');

    expect(label).toBe('tool: human_intervention_request - done');
  });

  it('falls back to toolExecution toolName metadata when present', () => {
    const label = getToolStatusLabel({
      role: 'tool',
      toolExecution: { toolName: 'read_file' },
      content: '{"ok":true}',
    });

    expect(label).toBe('tool: read_file - done');
  });

  it('marks canonical approval-denied shell tool results as failed', () => {
    const label = getToolStatusLabel({
      role: 'tool',
      toolName: 'shell_cmd',
      content: 'status: failed\nexit_code: null\nreason: approval_denied\nstderr_preview:\nrequest was not approved',
    });

    expect(label).toBe('tool: shell_cmd - failed');
  });

  it('renders Args and Result when tool row is linked to assistant tool request metadata', () => {
    const content = getToolBodyContent({
      role: 'tool',
      tool_call_id: 'call_shell_1',
      content: 'status: failed\nexit_code: 1\nreason: non_zero_exit',
      linkedToolRequest: {
        role: 'assistant',
        tool_calls: [{
          id: 'call_shell_1',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: '{"command":"ls -la","directory":"./"}'
          }
        }]
      }
    });

    expect(content).toContain('Args:');
    expect(content).toContain('shell_cmd');
    expect(content).toContain('"command":"ls -la"');
    expect(content).toContain('Result:');
    expect(content).toContain('status: failed');
  });

  it('preserves planning text when assistant tool request includes meaningful content', () => {
    const content = getToolBodyContent({
      role: 'assistant',
      content: 'I will generate the score, write it to ./score.musicxml, then ask @engraver to render it.',
      tool_calls: [{
        id: 'call_write_1',
        type: 'function',
        function: {
          name: 'write_file',
          arguments: '{"filePath":"./score.musicxml","content":"<xml/>"}'
        }
      }],
      combinedToolResults: [{
        role: 'tool',
        tool_call_id: 'call_write_1',
        content: '{"ok":true,"status":"done"}'
      }]
    });

    expect(content).toContain('write it to ./score.musicxml');
    expect(content).toContain('Args:');
    expect(content).toContain('Result:');
  });

  it('renders Args and Result from inline toolInput metadata on tool rows', () => {
    const content = getToolBodyContent({
      role: 'tool',
      toolName: 'shell_cmd',
      toolInput: {
        command: 'ls -la',
        explanation: 'List files',
      },
      content: '{"status":"failed","exit_code":2}',
    });

    expect(content).toContain('Args:');
    expect(content).toContain('shell_cmd');
    expect(content).toContain('"command": "ls -la"');
    expect(content).toContain('Result:');
    expect(content).toContain('"status":"failed"');
  });

  it('renders preview text instead of raw envelope json for enveloped tool rows', () => {
    const content = getToolBodyContent({
      role: 'tool',
      tool_call_id: 'call_shell_2',
      content: JSON.stringify({
        __type: 'tool_execution_envelope',
        version: 1,
        tool: 'shell_cmd',
        tool_call_id: 'call_shell_2',
        status: 'completed',
        preview: {
          kind: 'text',
          renderer: 'text',
          text: 'status: success\nexit_code: 0\nstdout_preview:\npreview only',
        },
        result: 'status: success\nexit_code: 0\nstdout_preview:\npreview only',
      }),
      linkedToolRequest: {
        role: 'assistant',
        tool_calls: [{
          id: 'call_shell_2',
          type: 'function',
          function: {
            name: 'shell_cmd',
            arguments: '{"command":"echo","parameters":["preview only"]}'
          }
        }]
      }
    });

    expect(content).toContain('Args:');
    expect(content).toContain('shell_cmd');
    expect(content).toContain('Result:');
    expect(content).toContain('preview only');
    expect(content).not.toContain('tool_execution_envelope');
  });

  it('defaults completed assistant reasoning panels to collapsed but keeps streaming reasoning expanded', () => {
    expect(getInitialReasoningCollapsedState({
      role: 'assistant',
      isStreaming: false,
      reasoningContent: 'step 1',
    })).toBe(true);

    expect(getInitialReasoningCollapsedState({
      role: 'assistant',
      isStreaming: true,
      reasoningContent: 'step 1',
    })).toBe(false);
  });

  it('formats live and completed reasoning labels with elapsed time', () => {
    expect(formatReasoningDuration(65000)).toBe('1m 5s');
    expect(getReasoningElapsedMs({
      isStreaming: true,
      createdAt: '2026-03-13T10:00:00.000Z',
    }, new Date('2026-03-13T10:01:05.000Z').getTime())).toBe(65000);

    expect(getReasoningHeaderLabel({
      isStreaming: true,
      reasoningContent: 'step 1',
    }, 65000)).toBe('Thinking ...');

    expect(getReasoningHeaderLabel({
      isStreaming: false,
      reasoningContent: 'step 1',
      reasoningDurationMs: 65000,
    }, 65000)).toBe('Thought for 1m 5s');
  });

  it('renders an arrow-only reasoning toggle with regular-weight header text', () => {
    const tree = MessageContent({
      message: {
        role: 'assistant',
        isStreaming: false,
        reasoningContent: 'step 1',
        reasoningDurationMs: 65000,
      },
      collapsed: false,
      reasoningCollapsed: true,
      onToggleReasoningCollapsed: vi.fn(),
      isToolCallPending: false,
      showToolHeader: true,
      streamingDotsLabel: 'model',
      streamingInputPreview: '',
    });

    const toggleButton = findNode(tree, (node) => node?.type === 'button' && node?.props?.['aria-label'] === 'Open reasoning');
    const labelNode = findNode(tree, (node) => node?.props?.className === 'text-[11px] text-muted-foreground');

    expect(toggleButton).toBeTruthy();
    expect(collectRenderedText(toggleButton)).not.toContain('Open');
    expect(collectRenderedText(toggleButton)).not.toContain('Collapse');
    expect(labelNode).toBeTruthy();
    expect(String(labelNode?.props?.className || '')).not.toContain('font-medium');
  });
});

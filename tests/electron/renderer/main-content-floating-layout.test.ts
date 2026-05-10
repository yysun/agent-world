/**
 * Electron Renderer Main Content Stacked Layout Tests
 *
 * Purpose:
 * - Verify `MainContentArea` keeps the transcript above the queue/composer/status stack instead of
 *   floating those controls over the message surface.
 *
 * Key Features:
 * - Confirms message list remains a direct flex child so it can own vertical scrolling.
 * - Confirms queue/composer/status render as normal stacked siblings after the transcript.
 * - Confirms no floating overlay wrapper or inset variable remains in the main section contract.
 *
 * Implementation Notes:
 * - Uses JSX-runtime virtual mocks and inspects element props directly.
 * - Avoids DOM runtime dependencies for deterministic unit coverage.
 *
 * Summary of Recent Changes:
 * - 2026-05-10: Updated coverage for the normal stacked transcript/composer layout so messages never extend behind the composer.
 * - 2026-03-04: Added regression coverage for main-content queue/composer layout contract.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  default: { createElement: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }) },
  useState: (initial: unknown) => [initial, () => { }],
}));

vi.mock('react/jsx-runtime', () => ({
  Fragment: 'Fragment',
  jsx: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }),
  jsxs: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }),
}));

vi.mock('react/jsx-dev-runtime', () => ({
  Fragment: 'Fragment',
  jsxDEV: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }),
}));

const { composerBarSpy, messageListPanelSpy, rightPanelContentSpy, rightPanelShellSpy } = vi.hoisted(() => ({
  composerBarSpy: vi.fn(() => null),
  messageListPanelSpy: vi.fn(() => null),
  rightPanelContentSpy: vi.fn(() => null),
  rightPanelShellSpy: vi.fn(() => null),
}));

vi.mock('../../../electron/renderer/src/features/chat', () => ({
  ComposerBar: composerBarSpy,
  MessageListPanel: messageListPanelSpy,
}));

vi.mock('../../../electron/renderer/src/app/shell/components/RightPanelContent', () => ({
  default: rightPanelContentSpy,
}));

vi.mock('../../../electron/renderer/src/app/shell/components/RightPanelShell', () => ({
  default: rightPanelShellSpy,
}));

import MainContentArea from '../../../electron/renderer/src/app/shell/components/MainContentArea';

describe('MainContentArea stacked bottom controls layout', () => {
  it('renders message panel above the queue/composer/status stack', () => {
    const queueProbe = { id: 'queue-probe' };
    const statusProbe = { id: 'status-probe' };

    const tree = MainContentArea({
      messageListProps: { a: 1 },
      composerProps: { b: 2 },
      rightPanelShellProps: { c: 3 },
      rightPanelContentProps: { d: 4 },
      queuePanel: queueProbe as unknown as any,
      statusBar: statusProbe as unknown as any,
    }) as {
      props?: { children?: Array<any> };
    };

    const rootChildren = tree.props?.children ?? [];
    const mainSection = rootChildren[0];
    const mainSectionChildren = mainSection?.props?.children ?? [];

    expect(String(mainSection?.props?.className || '')).toContain('flex-1');
    expect(mainSection?.props?.style).toBeUndefined();

    expect(mainSectionChildren[0]?.type).toBe(messageListPanelSpy);
    expect(mainSectionChildren[1]?.type).toBe('div');
    expect(String(mainSectionChildren[1]?.props?.className || '')).toContain('shrink-0');

    const stackedChildren = mainSectionChildren[1]?.props?.children ?? [];

    expect(stackedChildren[0]).toBe(queueProbe);
    expect(stackedChildren[1]?.type).toBe(composerBarSpy);
    expect(stackedChildren[2]).toBe(statusProbe);
  });

  it('keeps the composer stack in normal flow when no queue panel is present', () => {
    const tree = MainContentArea({
      messageListProps: { a: 1 },
      composerProps: { b: 2 },
      rightPanelShellProps: { c: 3 },
      rightPanelContentProps: { d: 4 },
      queuePanel: null,
      statusBar: null,
    }) as {
      props?: { children?: Array<any> };
    };

    const rootChildren = tree.props?.children ?? [];
    const mainSection = rootChildren[0];
    const mainSectionChildren = mainSection?.props?.children ?? [];
    const stackedChildren = mainSectionChildren[1]?.props?.children ?? [];

    expect(mainSection?.props?.style).toBeUndefined();
    expect(mainSectionChildren[0]?.type).toBe(messageListPanelSpy);
    expect(stackedChildren[0]).toBeNull();
    expect(stackedChildren[1]?.type).toBe(composerBarSpy);
    expect(stackedChildren[2]).toBeNull();
  });
});

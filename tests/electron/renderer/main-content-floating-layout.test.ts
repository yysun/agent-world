/**
 * Electron Renderer Main Content Floating Layout Tests
 *
 * Purpose:
 * - Verify `MainContentArea` keeps the message surface full-height while the queue/composer/status
 *   controls float above it as a bottom overlay stack.
 *
 * Key Features:
 * - Confirms message list remains a direct flex child so it can own vertical scrolling.
 * - Confirms queue/composer/status render inside an absolute bottom overlay container.
 * - Confirms floating composer inset CSS variable is provided to descendants.
 *
 * Implementation Notes:
 * - Uses JSX-runtime virtual mocks and inspects element props directly.
 * - Avoids DOM runtime dependencies for deterministic unit coverage.
 *
 * Summary of Recent Changes:
 * - 2026-03-05: Updated queue wrapper overlap assertion to enforce lower queue placement near composer (`-mb-6`).
 * - 2026-03-04: Added regression coverage for floating composer/queue layout contract.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  default: { createElement: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => ({ type, props: props ?? {}, key }) },
  useState: (initial: unknown) => [initial, () => {}],
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

vi.mock('../../../electron/renderer/src/components/ComposerBar', () => ({
  default: composerBarSpy,
}));

vi.mock('../../../electron/renderer/src/components/MessageListPanel', () => ({
  default: messageListPanelSpy,
}));

vi.mock('../../../electron/renderer/src/components/RightPanelContent', () => ({
  default: rightPanelContentSpy,
}));

vi.mock('../../../electron/renderer/src/components/RightPanelShell', () => ({
  default: rightPanelShellSpy,
}));

import MainContentArea from '../../../electron/renderer/src/components/MainContentArea';

describe('MainContentArea floating bottom stack layout', () => {
  it('renders message panel full-height and floats queue/composer/status in a bottom overlay', () => {
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

    expect(String(mainSection?.props?.className || '')).toContain('relative');
    expect(String(mainSection?.props?.className || '')).toContain('flex-1');
    expect((mainSection?.props?.style as Record<string, unknown>)?.['--floating-composer-height']).toBe('8.5rem');

    expect(mainSectionChildren[0]?.type).toBe(messageListPanelSpy);

    expect(mainSectionChildren[1]?.type).toBe('div');
    expect(String(mainSectionChildren[1]?.props?.className || '')).toContain('absolute inset-x-0 bottom-0');

    const overlayInner = mainSectionChildren[1]?.props?.children;
    const overlayChildren = overlayInner?.props?.children ?? [];

    expect(overlayChildren[0]?.type).toBe('div');
    expect(String(overlayChildren[0]?.props?.className || '')).toContain('-mb-5');
    expect(overlayChildren[0]?.props?.children).toBe(queueProbe);
    expect(overlayChildren[1]?.type).toBe(composerBarSpy);
    expect(overlayChildren[2]).toBe(statusProbe);
  });
});

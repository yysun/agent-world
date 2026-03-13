/**
 * Web Composer Dropdown Label Tests
 *
 * Purpose:
 * - Verify the web chat and dashboard composers expose the simplified dropdown labels.
 *
 * Key Features:
 * - Confirms the world chat composer renders capitalized reasoning and permission labels.
 * - Confirms the dashboard composer uses the same capitalized reasoning labels.
 *
 * Notes on Implementation:
 * - Uses lightweight AppRun JSX mocks and inspects returned virtual node trees directly.
 * - Avoids DOM mounting and unrelated transcript behavior.
 *
 * Summary of Recent Changes:
 * - 2026-03-13: Added regression coverage for `Not set`/capitalized web composer dropdown labels.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { jsxFactory } = vi.hoisted(() => ({
  jsxFactory: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({
    type,
    props: {
      ...(props ?? {}),
      children: children.length <= 1 ? children[0] : children,
    },
  }),
}));

function allDescendants(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  if (!children) return [node];
  const childArr = Array.isArray(children) ? children : [children];
  return [node, ...childArr.flatMap(allDescendants)];
}

describe('web composer dropdown labels', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('renders plain capitalized reasoning and permission labels in world chat', async () => {
    vi.doMock('apprun', () => ({
      app: {
        createElement: jsxFactory,
        h: jsxFactory,
        Fragment: 'Fragment',
      },
    }));
    vi.doMock('../../web/src/domain/message-visibility', () => ({
      shouldHideWorldChatMessage: () => false,
    }));
    vi.doMock('../../web/src/domain/message-content', () => ({
      getToolSummaryStatus: () => null,
      isToolRenderableMessage: () => false,
      renderMessageContent: () => null,
    }));
    vi.doMock('../../web/src/domain/tool-merge', () => ({
      buildCombinedRenderableMessages: (messages: unknown[]) => messages,
    }));
    vi.doMock('../../web/src/components/activity-indicators', () => ({
      ActivityPulse: () => null,
      ElapsedTimeCounter: () => null,
    }));
    vi.doMock('../../web/src/components/agent-queue-display', () => ({
      AgentQueueDisplay: () => null,
    }));
    vi.doMock('../../web/src/domain/responsive-ui', () => ({
      getResponsiveControlStyleAttribute: () => '',
    }));

    const { default: WorldChat } = await import('../../web/src/components/world-chat');
    const tree: any = WorldChat({
      worldName: 'world-1',
      messagesLoading: false,
      isSending: false,
      isWaiting: false,
      currentChatId: 'chat-1',
      currentChat: 'Chat 1',
      reasoningEffort: 'default',
      toolPermission: 'auto',
    } as any);

    const nodes = allDescendants(tree);
    const defaultOption = nodes.find((node: any) => node?.type === 'option' && node?.props?.value === 'default');
    const noneOption = nodes.find((node: any) => node?.type === 'option' && node?.props?.value === 'none');
    const readOption = nodes.find((node: any) => node?.type === 'option' && node?.props?.value === 'read');
    const askOption = nodes.find((node: any) => node?.type === 'option' && node?.props?.value === 'ask');
    const autoOption = nodes.find((node: any) => node?.type === 'option' && node?.props?.value === 'auto');

    expect(defaultOption.props.children).toBe('Not set');
    expect(noneOption.props.children).toBe('None');
    expect(readOption.props.children).toBe('Read');
    expect(askOption.props.children).toBe('Ask');
    expect(autoOption.props.children).toBe('Auto');
  });

  it('renders matching capitalized reasoning labels in the dashboard composer', async () => {
    vi.doMock('apprun', () => ({
      app: {
        createElement: jsxFactory,
        h: jsxFactory,
        Fragment: 'Fragment',
      },
    }));
    vi.doMock('../../web/src/domain/message-content', () => ({
      renderMessageContent: () => null,
    }));
    vi.doMock('../../web/src/components/world-chat', () => ({
      getComposerActionState: () => ({
        canStopCurrentSession: false,
        composerDisabled: false,
        actionButtonDisabled: false,
        actionButtonClass: 'composer-submit-button',
        actionButtonLabel: 'Send message',
      }),
    }));

    const { default: WorldDashboard } = await import('../../web/src/components/world-dashboard');
    const tree: any = WorldDashboard({
      worldName: 'world-1',
      dashboardZones: [],
      dashboardZoneContent: new Map(),
      dashboardShowHistory: false,
      isSending: false,
      isWaiting: false,
      reasoningEffort: 'default',
    } as any);

    const nodes = allDescendants(tree);
    const defaultOption = nodes.find((node: any) => node?.type === 'option' && node?.props?.value === 'default');
    const noneOption = nodes.find((node: any) => node?.type === 'option' && node?.props?.value === 'none');
    const lowOption = nodes.find((node: any) => node?.type === 'option' && node?.props?.value === 'low');

    expect(defaultOption.props.children).toBe('Not set');
    expect(noneOption.props.children).toBe('None');
    expect(lowOption.props.children).toBe('Low');
  });
});
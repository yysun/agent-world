/**
 * Purpose:
 * - Verify key web feature and page surfaces route interactive controls through the pattern layer.
 *
 * Key Features:
 * - Checks representative world/chat/history/carousel surfaces with lightweight AppRun JSX mocks.
 * - Fails if feature-owned trees regress to raw native button/input/select/textarea nodes.
 *
 * Notes on Implementation:
 * - This is an architecture regression test tied to the layered web UI contract.
 * - Custom pattern components remain unresolved in the virtual tree, while raw native controls would appear directly.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added coverage for the pattern-only control surface refactor.
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
  const childArray = Array.isArray(children) ? children : [children];
  return [node, ...childArray.flatMap(allDescendants)];
}

function expectNoNativeControls(tree: any) {
  const nodes = allDescendants(tree);
  const interactiveNodes = nodes.filter((node: any) => ['button', 'input', 'select', 'textarea'].includes(node?.type));
  expect(interactiveNodes).toEqual([]);
}

describe('web layered control patterns', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('keeps world chat history controls behind pattern wrappers', async () => {
    const appMock = {
      createElement: jsxFactory,
      h: jsxFactory,
      Fragment: 'Fragment',
    };
    vi.stubGlobal('app', appMock);
    vi.doMock('apprun', () => ({
      app: appMock,
      Component: class { },
    }));
    vi.doMock('../../web/src/domain/responsive-ui', () => ({
      getResponsiveControlStyleAttribute: () => '',
    }));

    const { default: WorldChatHistory } = await import('../../web/src/components/world-chat-history');
    const tree = WorldChatHistory({
      world: {
        currentChatId: 'chat-1',
        chats: [{ id: 'chat-1', name: 'Planning' }],
        agents: [{ id: 'agent-1' }],
      },
      chatSearchQuery: 'plan',
      viewportMode: 'desktop',
    } as any);

    expectNoNativeControls(tree);
  });

  it('keeps world chat composer and message actions behind pattern wrappers', async () => {
    const appMock = {
      createElement: jsxFactory,
      h: jsxFactory,
      Fragment: 'Fragment',
    };
    vi.stubGlobal('app', appMock);
    vi.doMock('apprun', () => ({
      app: appMock,
      Component: class { },
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
    const tree = WorldChat({
      worldName: 'world-1',
      messagesLoading: false,
      isSending: false,
      isWaiting: false,
      currentChatId: 'chat-1',
      currentChat: 'Chat 1',
      messages: [{
        id: 'message-1',
        messageId: 'backend-1',
        sender: 'user',
        text: 'hello',
        createdAt: new Date().toISOString(),
        isStreaming: false,
        userEntered: false,
      }],
      reasoningEffort: 'default',
      toolPermission: 'auto',
    } as any);

    expectNoNativeControls(tree);
  });

  it('keeps carousel search and navigation controls behind pattern wrappers', async () => {
    const appMock = {
      createElement: jsxFactory,
      h: jsxFactory,
      Fragment: 'Fragment',
    };
    vi.stubGlobal('app', appMock);
    vi.doMock('apprun', () => ({
      app: appMock,
      Component: class { },
    }));

    const { default: SwipeCarousel } = await import('../../web/src/components/swipe-carousel');
    const carousel = new SwipeCarousel();
    const tree = carousel.view({
      allWorlds: [
        { id: 'world-1', name: 'World One', description: 'First world' },
        { id: 'world-2', name: 'World Two', description: 'Second world' },
      ],
      currentIndex: 0,
      dragOffset: 0,
      isDragging: false,
      lastWheelAt: 0,
      startX: null,
      startY: null,
      searchQuery: '',
    } as any);

    expectNoNativeControls(tree);
  });
});
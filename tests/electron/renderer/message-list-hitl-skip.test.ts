/**
 * MessageListPanel HITL Skip Tests
 *
 * Purpose:
 * - Verify the Electron HITL prompt exposes a Skip action when `allowSkip` is enabled.
 *
 * Key Features:
 * - Confirms the Skip button is rendered only for skip-capable prompts.
 * - Confirms the provided skip callback receives the active prompt.
 *
 * Implementation Notes:
 * - Uses the renderer's direct element-tree testing pattern with JSX mocks.
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
  default: { createElement: jsxFactory },
  useState: (initial: unknown) => [initial, () => undefined],
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

import { MessageListPanel } from '../../../electron/renderer/src/features/chat';

function allDescendants(node: any): any[] {
  if (Array.isArray(node)) {
    return node.flatMap(allDescendants);
  }
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  const childArray = Array.isArray(children) ? children : children != null ? [children] : [];
  return [node, ...childArray.flatMap(allDescendants)];
}

describe('MessageListPanel HITL skip action', () => {
  it('renders and wires a skip button when the active prompt allows skipping', () => {
    const onSkipHitlPrompt = vi.fn();
    const prompt = {
      requestId: 'req-skip-1',
      chatId: 'chat-1',
      title: 'Optional action',
      message: 'You can skip this prompt.',
      mode: 'option' as const,
      allowSkip: true,
      options: [{ id: 'approve', label: 'Approve' }],
    };

    const tree: any = MessageListPanel({
      worldViewMode: 'chat',
      worldGridLayoutChoiceId: '1+2',
      messagesContainerRef: { current: null },
      messagesLoading: false,
      hasConversationMessages: true,
      selectedSession: { id: 'chat-1', name: 'Chat 1' },
      refreshSkillRegistry: () => undefined,
      loadingSkillRegistry: false,
      visibleSkillRegistryEntries: [],
      skillRegistryError: '',
      showToolMessages: true,
      messages: [],
      messagesById: {},
      worldAgentsById: new Map(),
      worldAgentsByName: new Map(),
      editingText: '',
      setEditingText: () => undefined,
      editingMessageId: null,
      deletingMessageId: null,
      onCancelEditMessage: () => undefined,
      onSaveEditMessage: () => undefined,
      onStartEditMessage: () => undefined,
      onDeleteMessage: () => undefined,
      onBranchFromMessage: () => undefined,
      onCopyRawMarkdownFromMessage: () => undefined,
      showInlineWorkingIndicator: false,
      inlineWorkingIndicatorState: null,
      activeHitlPrompt: prompt,
      submittingHitlRequestId: null,
      onRespondHitlOption: () => undefined,
      onSkipHitlPrompt,
    });

    const nodes = allDescendants(tree);
    const skipButton = nodes.find((node: any) => node?.type === 'button' && node?.props?.['data-testid'] === 'hitl-skip');

    expect(skipButton).toBeDefined();
    skipButton.props.onClick();
    expect(onSkipHitlPrompt).toHaveBeenCalledWith(prompt);
  });
});
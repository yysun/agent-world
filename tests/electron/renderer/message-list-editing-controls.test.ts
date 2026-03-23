/**
 * MessageListPanel Editing Control Tests
 *
 * Purpose:
 * - Verify inline message editing uses the shared textarea primitive and preserves setter wiring.
 *
 * Key Features:
 * - Asserts the edit surface renders through the Textarea primitive.
 * - Confirms edit text updates still flow through the provided setter callback.
 *
 * Implementation Notes:
 * - Uses JSX-runtime mocks and inspects the returned element tree directly.
 * - Keeps the message fixture minimal to exercise only the inline edit branch.
 *
 * Recent Changes:
 * - 2026-03-23: Added after rewiring the inline message editor to the generic Textarea primitive.
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
import { Textarea } from '../../../electron/renderer/src/design-system/primitives';

function allDescendants(node: any): any[] {
  if (Array.isArray(node)) {
    return node.flatMap(allDescendants);
  }
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  const childArray = Array.isArray(children) ? children : children != null ? [children] : [];
  return [node, ...childArray.flatMap(allDescendants)];
}

describe('MessageListPanel editing controls', () => {
  it('renders the inline edit surface with the shared Textarea primitive and setter wiring', () => {
    const setEditingText = vi.fn();
    const message = {
      messageId: 'message-1',
      role: 'user',
      sender: 'user',
      content: 'Original text',
      timestamp: '2026-03-23T00:00:00.000Z',
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
      messages: [message],
      messagesById: {},
      worldAgentsById: new Map(),
      worldAgentsByName: new Map(),
      editingText: 'Edited text',
      setEditingText,
      editingMessageId: 'message-1',
      deletingMessageId: null,
      onCancelEditMessage: () => undefined,
      onSaveEditMessage: () => undefined,
      onStartEditMessage: () => undefined,
      onDeleteMessage: () => undefined,
      onBranchFromMessage: () => undefined,
      onCopyRawMarkdownFromMessage: () => undefined,
      showInlineWorkingIndicator: false,
      inlineWorkingIndicatorState: null,
      activeHitlPrompt: null,
      submittingHitlRequestId: null,
      onRespondHitlOption: () => undefined,
    });

    const nodes = allDescendants(tree);
    const editTextarea = nodes.find((node: any) => node?.type === Textarea && node?.props?.placeholder === 'Edit your message...');

    expect(editTextarea).toBeDefined();
    expect(editTextarea.props.value).toBe('Edited text');

    editTextarea.props.onChange({ target: { value: 'Updated text' } });
    expect(setEditingText).toHaveBeenCalledWith('Updated text');
  });
});
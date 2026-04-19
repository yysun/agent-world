/**
 * Agent Form Fields Tests
 *
 * Purpose:
 * - Verify the shared agent form uses generic field primitives and preserves state wiring.
 *
 * Key Features:
 * - Asserts Input, Select, and Textarea primitive usage.
 * - Verifies field change handlers still apply updates through the provided setter.
 *
 * Implementation Notes:
 * - Uses JSX-runtime mocks and inspects returned element props directly.
 *
 * Recent Changes:
 * - 2026-03-23: Added after rewiring agent form fields to design-system primitives.
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
  useId: () => 'auto-reply-label',
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

import { Input, Select, Switch, Textarea } from '../../../electron/renderer/src/design-system/primitives';
import AgentFormFields from '../../../electron/renderer/src/features/agents/components/AgentFormFields';

function flatten(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (node.type === 'Fragment') {
    const fragmentChildren = node.props?.children;
    const childArray = Array.isArray(fragmentChildren) ? fragmentChildren : fragmentChildren != null ? [fragmentChildren] : [];
    return childArray.flatMap(flatten);
  }
  const children = node.props?.children;
  const childArray = Array.isArray(children) ? children : children != null ? [children] : [];
  return [node, ...childArray.flatMap(flatten)];
}

describe('AgentFormFields', () => {
  it('uses generic field primitives for shared controls', () => {
    const tree = AgentFormFields({
      agent: {
        name: 'Agent One',
        autoReply: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: '0.5',
        maxTokens: '512',
        systemPrompt: 'hello',
      },
      setAgent: () => undefined,
      disabled: false,
      providerOptions: ['openai', 'anthropic'],
      onExpandPrompt: () => undefined,
    }) as any;

    const nodes = flatten(tree);
    expect(nodes.filter((node) => node.type === Input)).toHaveLength(4);
    expect(nodes.filter((node) => node.type === Select)).toHaveLength(1);
    expect(nodes.filter((node) => node.type === Switch)).toHaveLength(1);
    expect(nodes.filter((node) => node.type === Textarea)).toHaveLength(1);
  });

  it('routes name input changes through the provided setter', () => {
    const setAgent = vi.fn();

    const tree = AgentFormFields({
      agent: {
        name: 'Agent One',
        autoReply: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: '0.5',
        maxTokens: '512',
        systemPrompt: 'hello',
      },
      setAgent,
      disabled: false,
      providerOptions: ['openai', 'anthropic'],
      onExpandPrompt: () => undefined,
    }) as any;

    const nodes = flatten(tree);
    const nameInput = nodes.find((node) => node.type === Input && node.props?.placeholder === 'Agent name');

    expect(nameInput).toBeDefined();
    nameInput.props.onChange({ target: { value: 'Updated Agent' } });

    expect(setAgent).toHaveBeenCalledTimes(1);
    const updater = setAgent.mock.calls[0][0];
    expect(updater({ name: 'Agent One' })).toEqual({ name: 'Updated Agent' });
  });

  it('routes the expand button through the provided prompt editor callback', () => {
    const onExpandPrompt = vi.fn();

    const tree = AgentFormFields({
      agent: {
        name: 'Agent One',
        autoReply: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: '0.5',
        maxTokens: '512',
        systemPrompt: 'hello',
      },
      setAgent: () => undefined,
      disabled: false,
      providerOptions: ['openai', 'anthropic'],
      onExpandPrompt,
    }) as any;

    const nodes = flatten(tree);
    const expandButton = nodes.find((node) => node.type === 'button' && node.props?.title === 'Expand editor');

    expect(expandButton).toBeDefined();
    expandButton.props.onClick();
    expect(onExpandPrompt).toHaveBeenCalledTimes(1);
  });
});

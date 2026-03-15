/**
 * Electron Renderer World Info Card Tests
 *
 * Purpose:
 * - Verify the world sidebar heartbeat label shown to the user.
 *
 * Key Features:
 * - Confirms running heartbeat jobs render a next-run countdown instead of the run counter.
 * - Confirms non-running heartbeat jobs still render the historical run counter.
 *
 * Implementation Notes:
 * - Uses virtual JSX-runtime mocks so the component can be exercised as a pure function.
 * - Uses fake timers only to make the countdown label deterministic.
 *
 * Summary of Recent Changes:
 * - 2026-03-15: Added regression coverage for the sidebar next-run countdown label.
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

import WorldInfoCard from '../../../electron/renderer/src/components/WorldInfoCard';

function collectText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((entry) => collectText(entry)).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    return collectText((node as { props?: { children?: unknown } }).props?.children);
  }
  return '';
}

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    loadedWorld: {
      id: 'world-1',
      name: 'World 1',
      description: 'Test world',
      heartbeatEnabled: true,
      heartbeatInterval: '*/5 * * * *',
      heartbeatPrompt: 'tick',
    },
    worldInfoStats: {
      totalAgents: 2,
      turnLimit: 5,
      totalChats: 3,
    },
    heartbeatJob: null,
    heartbeatAction: null,
    refreshingWorldInfo: false,
    updatingWorld: false,
    deletingWorld: false,
    onRefreshWorldInfo: vi.fn(),
    onOpenWorldEditPanel: vi.fn(),
    onDeleteWorld: vi.fn(),
    selectedSessionId: 'chat-1',
    onStartHeartbeat: vi.fn(),
    onStopHeartbeat: vi.fn(),
    ...overrides,
  };
}

describe('WorldInfoCard', () => {
  it('shows a countdown instead of the run count while cron is running', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T12:00:00.000Z'));

    try {
      const tree = WorldInfoCard(createProps({
        heartbeatJob: {
          status: 'running',
          runCount: 12,
          nextRunAt: '2026-03-15T12:01:05.000Z',
        },
      }));

      expect(collectText(tree)).toContain('Next: 1m 5s');
      expect(collectText(tree)).not.toContain('Runs: 12');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the run count visible when cron is not running', () => {
    const tree = WorldInfoCard(createProps({
      heartbeatJob: {
        status: 'stopped',
        runCount: 12,
        nextRunAt: null,
      },
    }));

    expect(collectText(tree)).toContain('Runs: 12');
    expect(collectText(tree)).not.toContain('Next:');
  });
});
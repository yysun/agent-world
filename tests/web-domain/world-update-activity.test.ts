/**
 * Web World Update Activity Tests
 *
 * Purpose:
 * - Verify the extracted World activity runtime module preserves waiting-state behavior.
 *
 * Coverage:
 * - Resolves the active waiting agent from normalized activity payloads.
 * - Stops waiting and clears the active agent when the world becomes idle.
 * - Ignores unsupported activity event payloads without forcing a rerender.
 *
 * Recent Changes:
 * - 2026-03-24: Added regression coverage for the extracted World activity runtime module.
 */

import { describe, expect, it } from 'vitest';
import { handleWorldActivity } from '../../web/src/features/world/update/runtime-activity';

function createBaseState(overrides: Record<string, unknown> = {}) {
  return {
    isWaiting: false,
    activeAgent: null,
    needScroll: false,
    world: {
      agents: [
        { id: 'writer', name: 'Writer', spriteIndex: 3 },
        { id: 'reviewer', name: 'Reviewer', spriteIndex: 5 },
      ],
    },
    ...overrides,
  } as any;
}

describe('web/world-update activity runtime', () => {
  it('resolves the active waiting agent from normalized activity keys', () => {
    const state = createBaseState();

    const nextState = handleWorldActivity(state, {
      type: 'response-start',
      pendingOperations: 1,
      activeAgentNames: ['agent:writer'],
      activityId: 12,
      source: 'agent:writer',
    }) as any;

    expect(nextState.isWaiting).toBe(true);
    expect(nextState.needScroll).toBe(true);
    expect(nextState.activeAgent).toMatchObject({ name: 'Writer', spriteIndex: 3 });
  });

  it('clears waiting state when the world becomes idle', () => {
    const state = createBaseState({
      isWaiting: true,
      activeAgent: { name: 'Writer', spriteIndex: 3 },
    });

    const nextState = handleWorldActivity(state, {
      type: 'idle',
      pendingOperations: 0,
      activityId: 13,
      source: 'agent:writer',
    }) as any;

    expect(nextState.isWaiting).toBe(false);
    expect(nextState.activeAgent).toBeNull();
    expect(nextState.needScroll).toBe(true);
  });

  it('returns nothing for unsupported activity events', () => {
    const state = createBaseState();

    const result = handleWorldActivity(state, { type: 'heartbeat' });

    expect(result).toBeUndefined();
  });
});

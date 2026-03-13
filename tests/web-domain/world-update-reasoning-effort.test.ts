/**
 * Web World Update Reasoning Effort Tests
 *
 * Purpose:
 * - Validate web composer reasoning-effort persistence behavior.
 *
 * Coverage:
 * - Confirms world update handlers register reasoning-effort event.
 * - Preserves UI-enriched agent fields when reasoning-effort updates round-trip through `updateWorld`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../web/src/api';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';

describe('web/world-update reasoning-effort handler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers set-reasoning-effort handler', () => {
    expect(typeof (worldUpdateHandlers as any)['set-reasoning-effort']).toBe('function');
  });

  it('persists reasoning_effort and preserves UI-enriched agent fields', async () => {
    vi.spyOn(api, 'updateWorld').mockResolvedValue({
      id: 'world-1',
      name: 'world-1',
      variables: '',
      agents: [{ id: 'agent-1', name: 'Agent 1' }],
    } as any);

    const state = {
      worldName: 'world-1',
      error: null,
      world: {
        id: 'world-1',
        name: 'world-1',
        variables: 'reasoning_effort=none',
        agents: [{ id: 'agent-1', name: 'Agent 1', spriteIndex: 5, messageCount: 2 }],
      },
    } as any;

    const nextState = await (worldUpdateHandlers as any)['set-reasoning-effort'](state, {
      target: { value: 'default' },
    });

    expect(nextState.error).toBeNull();
    expect(nextState.world?.variables).toBe('');
    expect(nextState.world?.agents?.[0]?.spriteIndex).toBe(5);
    expect(nextState.world?.agents?.[0]?.messageCount).toBe(2);
    expect(api.updateWorld).toHaveBeenCalledWith('world-1', {
      variables: '',
    });
  });
});
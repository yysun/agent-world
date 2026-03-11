/**
 * Web Working Indicator Agent Tests
 *
 * Purpose:
 * - Prevent the web waiting indicator from showing the wrong agent name.
 *
 * Coverage:
 * - Resolves the active agent from world activity payload agent IDs.
 * - Switches the active agent when activity continues with a different agent.
 * - Falls back to a generic waiting label when no active agent is known.
 *
 * Recent Changes:
 * - 2026-03-11: Added regression coverage for world-activity-driven waiting indicator agent names.
 */

import { describe, expect, it } from 'vitest';
import { getWaitingAgentName } from '../../web/src/components/world-chat';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';

function createState(overrides: Record<string, unknown> = {}) {
  return {
    isWaiting: false,
    needScroll: false,
    activeAgent: null,
    world: {
      agents: [
        { id: 'codex', name: 'Codex', spriteIndex: 1 },
        { id: 'gemini', name: 'Gemini', spriteIndex: 2 },
      ],
    },
    ...overrides,
  } as any;
}

describe('web working indicator agent name', () => {
  it('sets the active agent from response-start activity payload data', () => {
    const state = createState();

    const nextState = (worldUpdateHandlers['handleWorldActivity'] as any)(state, {
      type: 'response-start',
      pendingOperations: 1,
      activeAgentNames: ['gemini'],
      source: 'agent:gemini',
      activityId: 1,
    });

    expect(nextState.isWaiting).toBe(true);
    expect(nextState.activeAgent).toEqual({ name: 'Gemini', spriteIndex: 2 });
  });

  it('switches the active agent when response-end keeps processing active', () => {
    const state = createState({
      isWaiting: true,
      activeAgent: { name: 'Codex', spriteIndex: 1 },
    });

    const nextState = (worldUpdateHandlers['handleWorldActivity'] as any)(state, {
      type: 'response-end',
      pendingOperations: 1,
      activeAgentNames: ['gemini'],
      source: 'agent:codex',
      activityId: 2,
    });

    expect(nextState.isWaiting).toBe(true);
    expect(nextState.activeAgent).toEqual({ name: 'Gemini', spriteIndex: 2 });
  });

  it('uses a generic waiting label when no active agent is known', () => {
    expect(getWaitingAgentName(null)).toBe('Agent');
  });
});

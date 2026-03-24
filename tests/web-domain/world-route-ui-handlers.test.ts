/**
 * Web World Route-UI Handler Tests
 *
 * Purpose:
 * - Verify the extracted route-local World UI handler slice preserves current page behavior.
 *
 * Coverage:
 * - Agent filter toggling keeps stopPropagation and add/remove semantics.
 * - Responsive right-panel viewport sync closes the panel when leaving desktop mode.
 * - World settings open flow keeps the world tab selected.
 *
 * Recent Changes:
 * - 2026-03-24: Added regression coverage for the new `worldRouteUiHandlers` slice.
 */

import { describe, expect, it, vi } from 'vitest';
import { worldRouteUiHandlers } from '../../web/src/features/world/update';

function createBaseState(overrides: Record<string, unknown> = {}) {
  return {
    activeAgentFilters: [],
    rightPanelTab: 'chats',
    isRightPanelOpen: true,
    viewportMode: 'desktop',
    showWorldEdit: false,
    worldEditMode: 'edit',
    selectedWorldForEdit: null,
    world: { id: 'world-1', name: 'Demo World' },
    ...overrides,
  } as any;
}

describe('web/world-route-ui handlers', () => {
  it('toggles agent filters and stops propagation', () => {
    const stopPropagation = vi.fn();
    const state = createBaseState({ activeAgentFilters: ['agent-a'] });

    const removed = (worldRouteUiHandlers as any)['toggle-agent-filter'](state, 'agent-a', { stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(removed.activeAgentFilters).toEqual([]);

    const added = (worldRouteUiHandlers as any)['toggle-agent-filter'](removed, 'agent-b', { stopPropagation });
    expect(added.activeAgentFilters).toEqual(['agent-b']);
  });

  it('closes the right panel when viewport sync leaves desktop mode', () => {
    const state = createBaseState({ viewportMode: 'desktop', isRightPanelOpen: true });

    const nextState = (worldRouteUiHandlers as any)['sync-right-panel-viewport'](state, { width: 640 });

    expect(nextState.viewportMode).toBe('mobile');
    expect(nextState.isRightPanelOpen).toBe(false);
  });

  it('opens world settings on the world tab', () => {
    const state = createBaseState({ rightPanelTab: 'chats' });

    const nextState = (worldRouteUiHandlers as any)['open-world-edit'](state);

    expect(nextState.showWorldEdit).toBe(true);
    expect(nextState.worldEditMode).toBe('edit');
    expect(nextState.rightPanelTab).toBe('world');
    expect(nextState.selectedWorldForEdit).toEqual(state.world);
  });
});
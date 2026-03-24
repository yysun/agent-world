/**
 * Purpose:
 * - Own route-local World page UI handlers that do not belong in shared runtime slices.
 *
 * Key Features:
 * - Handles agent/world modal state, agent filter toggles, and responsive right-panel state.
 * - Keeps the World route entry focused on composition rather than inline handler ownership.
 *
 * Notes on Implementation:
 * - These handlers remain route-bound even though they live alongside the World feature update slices.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Extracted route-local World UI handlers into a dedicated update slice.
 */

import type { Agent, RightPanelTab, WorldComponentState } from '../../../types';
import { getViewportMode, resolveRightPanelViewportMode } from '../views/viewport';

export const worldRouteUiHandlers = {
  'open-agent-create': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    showAgentEdit: true,
    agentEditMode: 'create',
    selectedAgentForEdit: null,
  }),

  'open-agent-edit': (state: WorldComponentState, agent: Agent): WorldComponentState => ({
    ...state,
    showAgentEdit: true,
    agentEditMode: 'edit',
    selectedAgentForEdit: agent,
  }),

  'open-agent-delete': (state: WorldComponentState, agent: Agent): WorldComponentState => ({
    ...state,
    showAgentEdit: true,
    agentEditMode: 'delete',
    selectedAgentForEdit: agent,
  }),

  'close-agent-edit': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    showAgentEdit: false,
  }),

  'open-world-edit': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    showWorldEdit: true,
    worldEditMode: 'edit',
    selectedWorldForEdit: state.world,
    rightPanelTab: 'world',
  }),

  'close-world-edit': (state: WorldComponentState): WorldComponentState => ({
    ...state,
    showWorldEdit: false,
  }),

  'agent-saved': (): void => {
    location.reload();
  },

  'agent-deleted': (): void => {
    location.reload();
  },

  'toggle-agent-filter': (state: WorldComponentState, agentId: string, event?: Event): WorldComponentState => {
    event?.stopPropagation();

    const currentFilters = state.activeAgentFilters || [];
    const isActive = currentFilters.includes(agentId);

    return {
      ...state,
      activeAgentFilters: isActive
        ? currentFilters.filter((id) => id !== agentId)
        : [...currentFilters, agentId],
    };
  },

  'open-right-panel': (state: WorldComponentState, tab?: RightPanelTab): WorldComponentState => ({
    ...state,
    rightPanelTab: tab || state.rightPanelTab,
    isRightPanelOpen: true,
  }),

  'close-right-panel': (state: WorldComponentState): WorldComponentState => {
    const effectiveViewportMode = resolveRightPanelViewportMode(state.viewportMode);
    return {
      ...state,
      viewportMode: effectiveViewportMode,
      isRightPanelOpen: effectiveViewportMode === 'desktop',
    };
  },

  'toggle-right-panel': (state: WorldComponentState, tab?: RightPanelTab): WorldComponentState => ({
    ...state,
    rightPanelTab: tab || state.rightPanelTab,
    isRightPanelOpen: state.viewportMode === 'desktop' ? true : !state.isRightPanelOpen,
  }),

  'switch-right-panel-tab': (state: WorldComponentState, tab: RightPanelTab): WorldComponentState => ({
    ...state,
    rightPanelTab: tab,
    isRightPanelOpen: true,
  }),

  'sync-right-panel-viewport': (state: WorldComponentState, payload?: { width: number }): WorldComponentState => {
    const width = Number(payload?.width || 0);
    if (!width) return state;

    const nextViewportMode = getViewportMode(width);
    if (nextViewportMode === state.viewportMode) return state;

    const nextPanelOpen = nextViewportMode === 'desktop'
      ? true
      : state.viewportMode === 'desktop'
        ? false
        : state.isRightPanelOpen;

    return {
      ...state,
      viewportMode: nextViewportMode,
      isRightPanelOpen: nextPanelOpen,
    };
  },
};
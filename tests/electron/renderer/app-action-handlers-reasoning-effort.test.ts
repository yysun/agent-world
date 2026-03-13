/**
 * Renderer Reasoning Effort Action Tests
 * Purpose:
 * - Verify Electron renderer action handlers persist reasoning effort through world updates.
 *
 * Key Features:
 * - Confirms valid reasoning-effort values update world variables.
 * - Confirms the loaded world is refreshed with the sanitized response.
 *
 * Implementation Notes:
 * - Mocks `react` callback helpers so the hook can be exercised without a renderer runtime.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
}), { virtual: true });

import { useAppActionHandlers } from '../../../electron/renderer/src/hooks/useAppActionHandlers';

describe('electron/renderer reasoning-effort action', () => {
  it('persists reasoning_effort through updateWorld', async () => {
    const api = {
      updateWorld: vi.fn(async () => ({
        id: 'world-1',
        name: 'World 1',
        variables: '',
        refreshWarning: 'ignore me',
      })),
    };
    const setLoadedWorld = vi.fn();
    const setStatusText = vi.fn();

    const actions = useAppActionHandlers({
      api,
      loadedWorld: { id: 'world-1', variables: 'reasoning_effort=none' },
      worldAgents: [],
      editingAgent: {},
      creatingAgent: {},
      setStatusText,
      closePanelNeeds: {
        hasUnsavedWorldChanges: () => false,
        hasUnsavedAgentChanges: () => false,
        hasUnsavedSystemSettingsChanges: false,
      },
      panelMode: 'create-world',
      panelOpen: false,
      setPanelOpen: () => { },
      setPanelMode: () => { },
      setSelectedAgentId: () => { },
      setEditingWorld: () => { },
      getWorldFormFromWorld: () => ({}),
      setCreatingAgent: () => { },
      setEditingAgent: () => { },
      setSavingAgent: () => { },
      setDeletingAgent: () => { },
      refreshWorldDetails: async () => { },
      setLoadedWorld,
      setSelectedProjectPath: () => { },
      selectedSessionId: null,
      sendingSessionIds: new Set(),
      stoppingSessionIds: new Set(),
      pendingResponseSessionIds: new Set(),
      hasActiveHitlPrompt: false,
      composer: '',
      onSendMessage: async () => { },
      loadSystemSettings: async () => { },
      resetSystemSettings: () => { },
      saveSystemSettings: async () => ({ saved: false, needsRestart: false }),
      refreshSkillRegistry: async () => { },
    });

    await actions.onSetReasoningEffort('default');

    expect(api.updateWorld).toHaveBeenCalledWith('world-1', {
      variables: '',
    });
    expect(setLoadedWorld).toHaveBeenCalledWith({
      id: 'world-1',
      name: 'World 1',
      variables: '',
    });
    expect(setStatusText).not.toHaveBeenCalled();
  });
});
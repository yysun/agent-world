/**
 * Project Select Action Tests
 *
 * Purpose:
 * - Verify the Electron renderer persists world `working_directory` and refreshes the skill registry after project selection.
 *
 * Key Features:
 * - Confirms `working_directory` is written through `updateWorld`.
 * - Confirms skill-registry refresh runs after a successful project selection update.
 *
 * Implementation Notes:
 * - Mocks `react` callback helpers so the hook can be exercised without a renderer runtime.
 * - Uses deterministic mocked desktop API responses only.
 *
 * Recent Changes:
 * - 2026-03-19: Added regression coverage for project selection seeding the folder picker from the current world cwd while refreshing the skill registry.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
}), { virtual: true });

import { useAppActionHandlers } from '../../../electron/renderer/src/hooks/useAppActionHandlers';

describe('electron/renderer project select action', () => {
  it('persists working_directory and refreshes the skill registry', async () => {
    const api = {
      pickDirectory: vi.fn(async () => ({
        canceled: false,
        directoryPath: '/Users/test/project',
      })),
      updateWorld: vi.fn(async () => ({
        id: 'world-1',
        name: 'World 1',
        variables: 'working_directory=/Users/test/project',
        refreshWarning: 'ignore me',
      })),
    };
    const refreshSkillRegistry = vi.fn(async () => undefined);
    const setLoadedWorld = vi.fn();
    const setSelectedProjectPath = vi.fn();
    const setStatusText = vi.fn();

    const actions = useAppActionHandlers({
      api,
      loadedWorld: { id: 'world-1', variables: 'working_directory=/tmp/old-project' },
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
      setSelectedProjectPath,
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
      refreshSkillRegistry,
    });

    await actions.onSelectProject();

    expect(api.pickDirectory).toHaveBeenCalledWith('/tmp/old-project');
    expect(api.updateWorld).toHaveBeenCalledWith('world-1', {
      variables: 'working_directory=/Users/test/project',
    });
    expect(setLoadedWorld).toHaveBeenCalledWith({
      id: 'world-1',
      name: 'World 1',
      variables: 'working_directory=/Users/test/project',
    });
    expect(setSelectedProjectPath).toHaveBeenCalledWith('/Users/test/project');
    expect(refreshSkillRegistry).toHaveBeenCalledTimes(1);
  });
});

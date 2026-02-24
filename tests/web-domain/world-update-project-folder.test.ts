/**
 * Web World Update Project Folder Tests
 *
 * Purpose:
 * - Validate web composer Project-button update behavior.
 *
 * Coverage:
 * - Confirms world update handlers register project-folder selection event.
 * - Preserves UI-enriched agent fields when world update response lacks them.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../web/src/api';
import { worldUpdateHandlers } from '../../web/src/pages/World.update';
import { pickProjectFolderPath } from '../../web/src/domain/project-folder-picker';

vi.mock('../../web/src/domain/project-folder-picker', () => ({
  pickProjectFolderPath: vi.fn(),
}));

describe('web/world-update project-folder handler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers select-project-folder handler', () => {
    expect(typeof (worldUpdateHandlers as any)['select-project-folder']).toBe('function');
  });

  it('preserves sprite and message-count fields after project update', async () => {
    vi.mocked(pickProjectFolderPath).mockResolvedValue({
      canceled: false,
      directoryPath: '/Users/test/repo',
    });
    vi.spyOn(api, 'updateWorld').mockResolvedValue({
      id: 'world-1',
      name: 'world-1',
      variables: 'working_directory=/Users/test/repo',
      agents: [{ id: 'agent-1', name: 'Agent 1' }],
    } as any);

    const state = {
      worldName: 'world-1',
      selectedProjectPath: null,
      error: null,
      world: {
        id: 'world-1',
        name: 'world-1',
        variables: '',
        agents: [{ id: 'agent-1', name: 'Agent 1', spriteIndex: 7, messageCount: 3 }],
      },
    } as any;

    const nextState = await (worldUpdateHandlers as any)['select-project-folder'](state);

    expect(nextState.error).toBeNull();
    expect(nextState.selectedProjectPath).toBe('/Users/test/repo');
    expect(nextState.world?.agents?.[0]?.spriteIndex).toBe(7);
    expect(nextState.world?.agents?.[0]?.messageCount).toBe(3);
    expect(api.updateWorld).toHaveBeenCalledWith('world-1', {
      variables: 'working_directory=/Users/test/repo',
    });
  });
});

/**
 * Theme Settings Skill Autosave Tests
 * Purpose:
 * - Verify immediate persistence behavior for skill toggle changes in renderer settings.
 *
 * Key Features:
 * - Confirms autosave merges skill updates into the last saved settings baseline.
 * - Confirms refresh is triggered on successful autosave.
 * - Confirms save errors surface status feedback without mutating saved baseline.
 *
 * Implementation Notes:
 * - Tests exported pure helper from `useThemeSettings` to avoid hook runtime dependencies.
 * - Uses mocked desktop API/save and deterministic assertions.
 *
 * Recent Changes:
 * - 2026-02-28: Added regression coverage for skill-toggle autosave behavior.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: () => undefined,
  useMemo: (fn: () => unknown) => fn(),
  useRef: (value?: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, () => undefined],
}), { virtual: true });

import {
  deriveEnabledSkillSettingsUpdate,
  persistSkillSettingsAutosave,
} from '../../../electron/renderer/src/hooks/useThemeSettings';

describe('electron/renderer theme settings skill autosave helper', () => {
  it('enables a newly installed project skill and removes it from the disabled list', () => {
    const result = deriveEnabledSkillSettingsUpdate({
      enableGlobalSkills: true,
      enableProjectSkills: false,
      disabledGlobalSkillIds: [],
      disabledProjectSkillIds: ['planner', 'reviewer'],
    }, 'project', 'planner');

    expect(result.changed).toBe(true);
    expect(result.nextSkillSettings).toEqual({
      enableGlobalSkills: true,
      enableProjectSkills: true,
      disabledGlobalSkillIds: [],
      disabledProjectSkillIds: ['reviewer'],
    });
  });

  it('keeps settings unchanged when the installed global skill is already enabled', () => {
    const result = deriveEnabledSkillSettingsUpdate({
      enableGlobalSkills: true,
      enableProjectSkills: true,
      disabledGlobalSkillIds: [],
      disabledProjectSkillIds: [],
    }, 'global', 'pdf');

    expect(result.changed).toBe(false);
    expect(result.nextSkillSettings).toEqual({
      enableGlobalSkills: true,
      enableProjectSkills: true,
      disabledGlobalSkillIds: [],
      disabledProjectSkillIds: [],
    });
  });

  it('persists skill toggles using saved baseline and refreshes registry', async () => {
    const saveSettings = vi.fn(async () => { });
    const refreshSkillRegistry = vi.fn(async () => { });
    const setStatusText = vi.fn();

    const result = await persistSkillSettingsAutosave({
      api: { saveSettings },
      refreshSkillRegistry,
      setStatusText,
      savedSystemSettings: {
        storageType: 'sqlite',
        dataPath: '/tmp/old.json',
        sqliteDatabase: '/tmp/database.db',
        showToolMessages: true,
        enableGlobalSkills: true,
        enableProjectSkills: true,
        disabledGlobalSkillIds: ['old-global'],
        disabledProjectSkillIds: [],
      },
      nextSkillSettings: {
        enableGlobalSkills: false,
        enableProjectSkills: true,
        disabledGlobalSkillIds: ['alpha', 'beta'],
        disabledProjectSkillIds: ['proj-z'],
      },
    });

    expect(result.saved).toBe(true);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      restart: false,
      storageType: 'sqlite',
      showToolMessages: true,
      enableGlobalSkills: false,
      enableProjectSkills: true,
      disabledGlobalSkillIds: ['alpha', 'beta'],
      disabledProjectSkillIds: ['proj-z'],
    }));
    expect(refreshSkillRegistry).toHaveBeenCalledTimes(1);
    expect(setStatusText).not.toHaveBeenCalled();
  });

  it('returns saved=false and reports error when autosave fails', async () => {
    const saveSettings = vi.fn(async () => {
      throw new Error('save failed');
    });
    const refreshSkillRegistry = vi.fn(async () => { });
    const setStatusText = vi.fn();

    const result = await persistSkillSettingsAutosave({
      api: { saveSettings },
      refreshSkillRegistry,
      setStatusText,
      savedSystemSettings: {
        enableGlobalSkills: true,
        enableProjectSkills: true,
        disabledGlobalSkillIds: [],
        disabledProjectSkillIds: [],
      },
      nextSkillSettings: {
        enableGlobalSkills: false,
        enableProjectSkills: true,
        disabledGlobalSkillIds: ['x'],
        disabledProjectSkillIds: [],
      },
    });

    expect(result.saved).toBe(false);
    expect(refreshSkillRegistry).not.toHaveBeenCalled();
    expect(setStatusText).toHaveBeenCalledWith('save failed', 'error');
  });
});

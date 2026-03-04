/**
 * Settings Open Action Tests
 * Purpose:
 * - Verify the System Settings open flow refreshes the skill registry in Electron renderer actions.
 *
 * Key Features:
 * - Confirms panel mode/open state updates for settings.
 * - Confirms settings load and skill-registry refresh both run on open.
 *
 * Implementation Notes:
 * - Tests the exported pure helper to avoid React hook runtime coupling.
 * - Uses deterministic mocked async functions only.
 *
 * Recent Changes:
 * - 2026-02-28: Added coverage for header settings-button toggle-close behavior when settings mode is already active.
 * - 2026-02-28: Added regression coverage for settings-open skill-registry refresh behavior.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: () => undefined,
  useMemo: (fn: () => unknown) => fn(),
  useRef: (value?: unknown) => ({ current: value }),
  useState: (value: unknown) => [value, () => undefined],
}), { virtual: true });

import { openSettingsPanel } from '../../../electron/renderer/src/hooks/useAppActionHandlers';

describe('electron/renderer settings open action', () => {
  it('opens settings panel and refreshes skill registry', async () => {
    const setPanelMode = vi.fn();
    const setPanelOpen = vi.fn();
    const loadSystemSettings = vi.fn(async () => { });
    const refreshSkillRegistry = vi.fn(async () => { });

    await openSettingsPanel({
      setPanelMode,
      setPanelOpen,
      loadSystemSettings,
      refreshSkillRegistry,
    });

    expect(setPanelMode).toHaveBeenCalledWith('settings');
    expect(setPanelOpen).toHaveBeenCalledWith(true);
    expect(loadSystemSettings).toHaveBeenCalledTimes(1);
    expect(refreshSkillRegistry).toHaveBeenCalledTimes(1);
  });

  it('continues best-effort async work when one side fails', async () => {
    const setPanelMode = vi.fn();
    const setPanelOpen = vi.fn();
    const loadSystemSettings = vi.fn(async () => {
      throw new Error('settings load failed');
    });
    const refreshSkillRegistry = vi.fn(async () => {
      throw new Error('skill refresh failed');
    });

    await expect(openSettingsPanel({
      setPanelMode,
      setPanelOpen,
      loadSystemSettings,
      refreshSkillRegistry,
    })).resolves.toBeUndefined();

    expect(setPanelMode).toHaveBeenCalledWith('settings');
    expect(setPanelOpen).toHaveBeenCalledWith(true);
    expect(loadSystemSettings).toHaveBeenCalledTimes(1);
    expect(refreshSkillRegistry).toHaveBeenCalledTimes(1);
  });

  it('toggles right panel closed when settings panel is already active', async () => {
    const setPanelMode = vi.fn();
    const setPanelOpen = vi.fn();
    const loadSystemSettings = vi.fn(async () => { });
    const refreshSkillRegistry = vi.fn(async () => { });

    await openSettingsPanel({
      setPanelMode,
      setPanelOpen,
      loadSystemSettings,
      refreshSkillRegistry,
      panelMode: 'settings',
      panelOpen: true,
    });

    expect(setPanelOpen).toHaveBeenCalledWith(false);
    expect(setPanelMode).not.toHaveBeenCalled();
    expect(loadSystemSettings).not.toHaveBeenCalled();
    expect(refreshSkillRegistry).not.toHaveBeenCalled();
  });
});

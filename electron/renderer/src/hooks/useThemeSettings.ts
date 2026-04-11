/**
 * useThemeSettings Hook
 * Purpose:
 * - Manage renderer theme preference and system settings workflows.
 *
 * Key Features:
 * - Persists and applies theme selection (`light`|`dark`|`system`).
 * - Loads/saves normalized system settings via desktop API.
 * - Computes filtered skill-registry visibility from settings toggles.
 *
 * Implementation Notes:
 * - Keeps side effects localized (DOM theme + initial settings load).
 * - Preserves existing App.jsx behavior by returning state + action helpers.
 *
 * Recent Changes:
 * - 2026-04-11: Added post-install skill enable support so newly installed skills are enabled automatically in the matching scope.
 * - 2026-02-28: Added immediate autosave handlers for skill scope/row toggles with serialized persistence and registry refresh.
 * - 2026-02-27: Added unsaved-change tracking support for `showToolMessages` desktop setting.
 * - 2026-02-17: Extracted theme/settings logic from `App.jsx` for Phase 3.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_SYSTEM_SETTINGS } from '../constants/app-defaults';
import {
  THEME_STORAGE_KEY,
} from '../constants/ui-constants';
import {
  normalizeStringList,
  normalizeSystemSettings,
} from '../utils/data-transform';
import { safeMessage } from '../domain/desktop-api';

function getStoredThemePreference() {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

type SkillSettingsSnapshot = {
  enableGlobalSkills: boolean;
  enableProjectSkills: boolean;
  disabledGlobalSkillIds: string[];
  disabledProjectSkillIds: string[];
};

function extractSkillSettingsSnapshot(settings: any): SkillSettingsSnapshot {
  const normalized = normalizeSystemSettings(settings);
  return {
    enableGlobalSkills: normalized.enableGlobalSkills !== false,
    enableProjectSkills: normalized.enableProjectSkills !== false,
    disabledGlobalSkillIds: normalizeStringList(normalized.disabledGlobalSkillIds),
    disabledProjectSkillIds: normalizeStringList(normalized.disabledProjectSkillIds),
  };
}

export function deriveEnabledSkillSettingsUpdate(settings: any, sourceScope: string, skillId: string): {
  changed: boolean;
  nextSettings: any;
  nextSkillSettings: SkillSettingsSnapshot;
} {
  const normalizedSkillId = String(skillId || '').trim();
  const currentSettings = normalizeSystemSettings(settings);

  if (!normalizedSkillId) {
    return {
      changed: false,
      nextSettings: currentSettings,
      nextSkillSettings: extractSkillSettingsSnapshot(currentSettings),
    };
  }

  const projectScope = sourceScope === 'project';
  const enableKey = projectScope ? 'enableProjectSkills' : 'enableGlobalSkills';
  const disabledKey = projectScope ? 'disabledProjectSkillIds' : 'disabledGlobalSkillIds';
  const disabledIds = new Set(normalizeStringList(currentSettings[disabledKey]));
  const scopeWasEnabled = currentSettings[enableKey] !== false;
  const skillWasEnabled = !disabledIds.has(normalizedSkillId);

  disabledIds.delete(normalizedSkillId);

  const nextSettings = normalizeSystemSettings({
    ...currentSettings,
    [enableKey]: true,
    [disabledKey]: [...disabledIds].sort((left, right) => left.localeCompare(right)),
  });

  return {
    changed: !scopeWasEnabled || !skillWasEnabled,
    nextSettings,
    nextSkillSettings: extractSkillSettingsSnapshot(nextSettings),
  };
}

export async function persistSkillSettingsAutosave({
  api,
  refreshSkillRegistry,
  setStatusText,
  savedSystemSettings,
  nextSkillSettings,
}: {
  api: { saveSettings?: ((settings: any) => Promise<unknown>) | undefined };
  refreshSkillRegistry: () => Promise<unknown>;
  setStatusText: (text: string, kind?: string) => void;
  savedSystemSettings: any;
  nextSkillSettings: SkillSettingsSnapshot;
}): Promise<{ saved: boolean; nextSavedSystemSettings: any }> {
  const savedBaseline = normalizeSystemSettings(savedSystemSettings);
  if (typeof api?.saveSettings !== 'function') {
    return { saved: false, nextSavedSystemSettings: savedBaseline };
  }

  const payload = normalizeSystemSettings({
    ...savedBaseline,
    ...nextSkillSettings,
  });

  try {
    await api.saveSettings({ ...payload, restart: false });
    await refreshSkillRegistry();
    return { saved: true, nextSavedSystemSettings: payload };
  } catch (error) {
    setStatusText(safeMessage(error, 'Failed to save settings.'), 'error');
    return { saved: false, nextSavedSystemSettings: savedBaseline };
  }
}

export function useThemeSettings({
  api,
  panelMode,
  skillRegistryEntries,
  refreshSkillRegistry,
  setStatusText,
}) {
  const [themePreference, setThemePreference] = useState(getStoredThemePreference);
  const [systemSettings, setSystemSettings] = useState(DEFAULT_SYSTEM_SETTINGS);
  const savedSystemSettingsRef = useRef(DEFAULT_SYSTEM_SETTINGS);
  const systemSettingsRef = useRef(DEFAULT_SYSTEM_SETTINGS);
  const skillAutosaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSkillAutosaveCountRef = useRef(0);
  const [savingSystemSettings, setSavingSystemSettings] = useState(false);

  useEffect(() => {
    systemSettingsRef.current = systemSettings;
  }, [systemSettings]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    if (themePreference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', themePreference);
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
    }
  }, [themePreference]);

  const loadSystemSettings = useCallback(async () => {
    if (!api.getSettings) return;
    const loaded = normalizeSystemSettings(await api.getSettings());
    systemSettingsRef.current = loaded;
    setSystemSettings(loaded);
    savedSystemSettingsRef.current = loaded;
  }, [api]);

  useEffect(() => {
    loadSystemSettings().catch(() => { });
  }, [loadSystemSettings]);

  const settingsNeedRestart = useMemo(() => {
    const saved = savedSystemSettingsRef.current;
    return (
      systemSettings.storageType !== saved.storageType ||
      systemSettings.dataPath !== saved.dataPath ||
      systemSettings.sqliteDatabase !== saved.sqliteDatabase
    );
  }, [systemSettings]);

  const hasUnsavedSystemSettingsChanges = useMemo(() => {
    if (panelMode !== 'settings') {
      return false;
    }

    const saved = normalizeSystemSettings(savedSystemSettingsRef.current);
    const current = normalizeSystemSettings(systemSettings);

    return (
      current.storageType !== saved.storageType ||
      current.dataPath !== saved.dataPath ||
      current.sqliteDatabase !== saved.sqliteDatabase ||
      current.showToolMessages !== saved.showToolMessages ||
      current.allowPrereleaseUpdates !== saved.allowPrereleaseUpdates ||
      current.enableGlobalSkills !== saved.enableGlobalSkills ||
      current.enableProjectSkills !== saved.enableProjectSkills ||
      normalizeStringList(current.disabledGlobalSkillIds).join('|') !== normalizeStringList(saved.disabledGlobalSkillIds).join('|') ||
      normalizeStringList(current.disabledProjectSkillIds).join('|') !== normalizeStringList(saved.disabledProjectSkillIds).join('|')
    );
  }, [panelMode, systemSettings]);

  const disabledGlobalSkillIdSet = useMemo(
    () => new Set(normalizeStringList(systemSettings.disabledGlobalSkillIds)),
    [systemSettings.disabledGlobalSkillIds],
  );

  const disabledProjectSkillIdSet = useMemo(
    () => new Set(normalizeStringList(systemSettings.disabledProjectSkillIds)),
    [systemSettings.disabledProjectSkillIds],
  );

  const visibleSkillRegistryEntries = useMemo(() => {
    return skillRegistryEntries.filter((entry) => {
      const isProject = entry.sourceScope === 'project';
      if (isProject) {
        if (systemSettings.enableProjectSkills === false) return false;
        return !disabledProjectSkillIdSet.has(entry.skillId);
      }

      if (systemSettings.enableGlobalSkills === false) return false;
      return !disabledGlobalSkillIdSet.has(entry.skillId);
    });
  }, [disabledGlobalSkillIdSet, disabledProjectSkillIdSet, skillRegistryEntries, systemSettings.enableGlobalSkills, systemSettings.enableProjectSkills]);

  const globalSkillEntries = useMemo(
    () => skillRegistryEntries.filter((entry) => entry.sourceScope !== 'project'),
    [skillRegistryEntries],
  );

  const projectSkillEntries = useMemo(
    () => skillRegistryEntries.filter((entry) => entry.sourceScope === 'project'),
    [skillRegistryEntries],
  );

  const enqueueSkillSettingsAutosave = useCallback((nextSkillSettings: SkillSettingsSnapshot): Promise<boolean> => {
    pendingSkillAutosaveCountRef.current += 1;
    setSavingSystemSettings(true);

    const queuedSave = skillAutosaveQueueRef.current
      .then(async () => {
        const result = await persistSkillSettingsAutosave({
          api,
          refreshSkillRegistry,
          setStatusText,
          savedSystemSettings: savedSystemSettingsRef.current,
          nextSkillSettings,
        });

        if (result.saved) {
          savedSystemSettingsRef.current = result.nextSavedSystemSettings;
          return true;
        }

        systemSettingsRef.current = result.nextSavedSystemSettings;
        setSystemSettings(result.nextSavedSystemSettings);
        return false;
      })
      .finally(() => {
        pendingSkillAutosaveCountRef.current = Math.max(0, pendingSkillAutosaveCountRef.current - 1);
        if (pendingSkillAutosaveCountRef.current === 0) {
          setSavingSystemSettings(false);
        }
      });

    skillAutosaveQueueRef.current = queuedSave.then(() => undefined);
    return queuedSave;
  }, [api, refreshSkillRegistry, setStatusText]);

  const setGlobalSkillsEnabled = useCallback((enabled: boolean) => {
    const currentSettings = normalizeSystemSettings(systemSettingsRef.current);
    const nextSettings = normalizeSystemSettings({
      ...currentSettings,
      enableGlobalSkills: enabled,
    });
    systemSettingsRef.current = nextSettings;
    setSystemSettings(nextSettings);
    void enqueueSkillSettingsAutosave(extractSkillSettingsSnapshot(nextSettings));
  }, [enqueueSkillSettingsAutosave]);

  const setProjectSkillsEnabled = useCallback((enabled: boolean) => {
    const currentSettings = normalizeSystemSettings(systemSettingsRef.current);
    const nextSettings = normalizeSystemSettings({
      ...currentSettings,
      enableProjectSkills: enabled,
    });
    systemSettingsRef.current = nextSettings;
    setSystemSettings(nextSettings);
    void enqueueSkillSettingsAutosave(extractSkillSettingsSnapshot(nextSettings));
  }, [enqueueSkillSettingsAutosave]);

  const toggleSkillEnabled = useCallback((sourceScope, skillId) => {
    const normalizedSkillId = String(skillId || '').trim();
    if (!normalizedSkillId) return;

    const currentSettings = normalizeSystemSettings(systemSettingsRef.current);
    const key = sourceScope === 'project' ? 'disabledProjectSkillIds' : 'disabledGlobalSkillIds';
    const existing = new Set(normalizeStringList(currentSettings[key]));
    if (existing.has(normalizedSkillId)) {
      existing.delete(normalizedSkillId);
    } else {
      existing.add(normalizedSkillId);
    }

    const nextSettings = normalizeSystemSettings({
      ...currentSettings,
      [key]: [...existing].sort((left, right) => left.localeCompare(right)),
    });

    systemSettingsRef.current = nextSettings;
    setSystemSettings(nextSettings);
    void enqueueSkillSettingsAutosave(extractSkillSettingsSnapshot(nextSettings));
  }, [enqueueSkillSettingsAutosave]);

  const ensureSkillEnabled = useCallback(async (sourceScope: string, skillId: string) => {
    const nextUpdate = deriveEnabledSkillSettingsUpdate(systemSettingsRef.current, sourceScope, skillId);
    if (!nextUpdate.changed) {
      return { changed: false, saved: true };
    }

    systemSettingsRef.current = nextUpdate.nextSettings;
    setSystemSettings(nextUpdate.nextSettings);
    const saved = await enqueueSkillSettingsAutosave(nextUpdate.nextSkillSettings);
    return { changed: true, saved };
  }, [enqueueSkillSettingsAutosave]);

  const resetSystemSettings = useCallback(() => {
    const reset = normalizeSystemSettings(savedSystemSettingsRef.current);
    systemSettingsRef.current = reset;
    setSystemSettings(reset);
  }, []);

  const saveSystemSettings = useCallback(async () => {
    if (!api.saveSettings || savingSystemSettings) {
      return { saved: false, needsRestart: false };
    }

    const needsRestart = settingsNeedRestart;
    if (needsRestart) {
      const confirmed = window.confirm('Changes require a restart to take effect. Continue?');
      if (!confirmed) {
        return { saved: false, needsRestart };
      }
    }

    setSavingSystemSettings(true);
    try {
      await api.saveSettings({ ...systemSettings, restart: needsRestart });
      savedSystemSettingsRef.current = { ...systemSettings };
      if (!needsRestart) {
        await refreshSkillRegistry();
        setStatusText('Settings saved.', 'success');
      }
      return { saved: true, needsRestart };
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to save settings.'), 'error');
      return { saved: false, needsRestart };
    } finally {
      setSavingSystemSettings(false);
    }
  }, [api, refreshSkillRegistry, savingSystemSettings, setStatusText, settingsNeedRestart, systemSettings]);

  return {
    themePreference,
    setThemePreference,
    systemSettings,
    setSystemSettings,
    savingSystemSettings,
    settingsNeedRestart,
    hasUnsavedSystemSettingsChanges,
    disabledGlobalSkillIdSet,
    disabledProjectSkillIdSet,
    visibleSkillRegistryEntries,
    globalSkillEntries,
    projectSkillEntries,
    setGlobalSkillsEnabled,
    setProjectSkillsEnabled,
    toggleSkillEnabled,
    ensureSkillEnabled,
    loadSystemSettings,
    resetSystemSettings,
    saveSystemSettings,
  };
}

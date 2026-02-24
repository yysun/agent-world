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
 * - 2026-02-17: Extracted theme/settings logic from `App.jsx` for Phase 3.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_SYSTEM_SETTINGS,
  THEME_STORAGE_KEY,
} from '../constants/app-constants';
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
  const [savingSystemSettings, setSavingSystemSettings] = useState(false);

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

  const toggleSkillEnabled = useCallback((sourceScope, skillId) => {
    const normalizedSkillId = String(skillId || '').trim();
    if (!normalizedSkillId) return;

    setSystemSettings((settings) => {
      const key = sourceScope === 'project' ? 'disabledProjectSkillIds' : 'disabledGlobalSkillIds';
      const existing = new Set(normalizeStringList(settings[key]));
      if (existing.has(normalizedSkillId)) {
        existing.delete(normalizedSkillId);
      } else {
        existing.add(normalizedSkillId);
      }

      return {
        ...settings,
        [key]: [...existing].sort((left, right) => left.localeCompare(right)),
      };
    });
  }, []);

  const resetSystemSettings = useCallback(() => {
    setSystemSettings(normalizeSystemSettings(savedSystemSettingsRef.current));
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
    toggleSkillEnabled,
    loadSystemSettings,
    resetSystemSettings,
    saveSystemSettings,
  };
}

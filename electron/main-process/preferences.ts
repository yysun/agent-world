/**
 * Electron Workspace Preference Storage
 *
 * Features:
 * - Reads and writes persisted workspace path preference.
 * - Reads and writes persisted last-selected world ID preference.
 *
 * Implementation Notes:
 * - Persists preferences in Electron `userData/workspace-preferences.json`.
 * - Uses tolerant JSON parsing and returns safe defaults on corruption.
 *
 * Recent Changes:
 * - 2026-02-12: Extracted preference read/write helpers from `electron/main.ts`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const WORKSPACE_PREFS_FILE = 'workspace-preferences.json';

interface AppUserDataLike {
  getPath: (name: 'userData') => string;
}

function getWorkspacePrefsPath(appLike: AppUserDataLike): string {
  return path.join(appLike.getPath('userData'), WORKSPACE_PREFS_FILE);
}

function readPreferences(appLike: AppUserDataLike): Record<string, unknown> {
  const prefsPath = getWorkspacePrefsPath(appLike);
  if (!fs.existsSync(prefsPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(prefsPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writePreferences(appLike: AppUserDataLike, prefs: Record<string, unknown>): void {
  const prefsPath = getWorkspacePrefsPath(appLike);
  const content = JSON.stringify(prefs, null, 2);
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
  fs.writeFileSync(prefsPath, content, 'utf-8');
}

export function readWorkspacePreference(appLike: AppUserDataLike): string | null {
  const prefs = readPreferences(appLike);
  const workspacePath = prefs.workspacePath;
  return typeof workspacePath === 'string' && workspacePath.length > 0
    ? workspacePath
    : null;
}

export function writeWorkspacePreference(appLike: AppUserDataLike, workspacePath: string): void {
  const prefs = readPreferences(appLike);
  prefs.workspacePath = workspacePath;
  writePreferences(appLike, prefs);
}

export function readWorldPreference(appLike: AppUserDataLike): string | null {
  const prefs = readPreferences(appLike);
  const lastWorldId = prefs.lastWorldId;
  return typeof lastWorldId === 'string' && lastWorldId.length > 0
    ? lastWorldId
    : null;
}

export function writeWorldPreference(appLike: AppUserDataLike, worldId: string): void {
  const prefs = readPreferences(appLike);
  prefs.lastWorldId = worldId;
  writePreferences(appLike, prefs);
}

export interface SystemSettings {
  storageType?: string;
  dataPath?: string;
  sqliteDatabase?: string;
  enableGlobalSkills?: boolean;
  enableProjectSkills?: boolean;
  disabledGlobalSkillIds?: string[];
  disabledProjectSkillIds?: string[];
}

export function readSystemSettings(appLike: AppUserDataLike): SystemSettings {
  const prefs = readPreferences(appLike);
  const settings = prefs.systemSettings;
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    return settings as SystemSettings;
  }
  return {};
}

export function writeSystemSettings(appLike: AppUserDataLike, settings: SystemSettings): void {
  const prefs = readPreferences(appLike);
  prefs.systemSettings = settings;
  writePreferences(appLike, prefs);
}


/**
 * Renderer Data Transform Utilities
 * Purpose:
 * - Provide pure helpers for normalization and ordering of renderer data.
 *
 * Key Features:
 * - Normalizes skill/settings string lists.
 * - Normalizes system settings payload shape.
 * - Upserts env-style key/value entries in world variable text.
 * - Sorts sessions by most recent update/create timestamp.
 *
 * Implementation Notes:
 * - Functions are side-effect free and safe to unit test in isolation.
 * - Returned objects/arrays are newly allocated to avoid mutation bugs.
 *
 * Recent Changes:
 * - 2026-02-16: Extracted from App.jsx into dedicated utility module.
 */

import { DEFAULT_SYSTEM_SETTINGS } from '../constants/app-constants.js';

export function normalizeStringList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const unique = new Set(
    values
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0)
  );
  return [...unique].sort((left, right) => left.localeCompare(right));
}

export function normalizeSystemSettings(settings) {
  if (!settings || typeof settings !== 'object') {
    return { ...DEFAULT_SYSTEM_SETTINGS };
  }

  return {
    storageType: String(settings.storageType || ''),
    dataPath: String(settings.dataPath || ''),
    sqliteDatabase: String(settings.sqliteDatabase || ''),
    enableGlobalSkills: settings.enableGlobalSkills !== false,
    enableProjectSkills: settings.enableProjectSkills !== false,
    disabledGlobalSkillIds: normalizeStringList(settings.disabledGlobalSkillIds),
    disabledProjectSkillIds: normalizeStringList(settings.disabledProjectSkillIds),
  };
}

function getSessionTimestamp(session) {
  const updatedAt = session?.updatedAt ? new Date(session.updatedAt).getTime() : Number.NaN;
  if (Number.isFinite(updatedAt)) return updatedAt;
  const createdAt = session?.createdAt ? new Date(session.createdAt).getTime() : Number.NaN;
  if (Number.isFinite(createdAt)) return createdAt;
  return 0;
}

export function upsertEnvVariable(variablesText, key, value) {
  const lines = String(variablesText || '').split(/\r?\n/);
  const updatedLines = [];
  let replaced = false;

  for (const rawLine of lines) {
    const line = String(rawLine);
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      updatedLines.push(line);
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) {
      updatedLines.push(line);
      continue;
    }

    const envKey = line.slice(0, eqIndex).trim();
    if (envKey === key) {
      if (!replaced) {
        updatedLines.push(`${key}=${value}`);
        replaced = true;
      }
      continue;
    }

    updatedLines.push(line);
  }

  if (!replaced) {
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1].trim() !== '') {
      updatedLines.push('');
    }
    updatedLines.push(`${key}=${value}`);
  }

  return updatedLines.join('\n');
}

export function sortSessionsByNewest(sessions) {
  if (!Array.isArray(sessions)) return [];
  return [...sessions].sort((left, right) => getSessionTimestamp(right) - getSessionTimestamp(left));
}

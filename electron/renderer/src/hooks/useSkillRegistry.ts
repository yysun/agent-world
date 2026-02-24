/**
 * useSkillRegistry Hook
 * Purpose:
 * - Load and refresh renderer-visible skill registry entries for current workspace/world context.
 *
 * Key Features:
 * - Fetches skill summaries from desktop API with scoped project path support.
 * - Exposes loading/error state for UI feedback.
 * - Normalizes/filters raw API payload shape into stable entry objects.
 *
 * Implementation Notes:
 * - Keeps API-loading side effects outside `App.jsx`.
 * - Sorting is deterministic by `skillId` for stable rendering.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 3 custom hook migration.
 */

import { useCallback, useEffect, useState } from 'react';
import { safeMessage } from '../domain/desktop-api';

function normalizeSkillSummaryEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) return [];

  const normalized = rawEntries
    .map((entry) => {
      const skillId = String(entry?.skill_id || entry?.name || '').trim();
      if (!skillId) return null;
      const description = String(entry?.description || '').trim();
      const sourceScope = String(entry?.sourceScope || '').trim() === 'project' ? 'project' : 'global';
      return { skillId, description, sourceScope };
    })
    .filter(Boolean);

  normalized.sort((left, right) => left.skillId.localeCompare(right.skillId));
  return normalized;
}

export function useSkillRegistry({ api, selectedProjectPath, workspacePath, loadedWorldId }) {
  const [skillRegistryEntries, setSkillRegistryEntries] = useState([]);
  const [loadingSkillRegistry, setLoadingSkillRegistry] = useState(false);
  const [skillRegistryError, setSkillRegistryError] = useState('');

  const refreshSkillRegistry = useCallback(async () => {
    if (typeof api?.listSkills !== 'function') {
      setSkillRegistryEntries([]);
      setSkillRegistryError('Skills are not available in this desktop build.');
      return;
    }

    setLoadingSkillRegistry(true);
    setSkillRegistryError('');
    try {
      const scopedProjectPath = String(selectedProjectPath || workspacePath || '').trim();
      const rawEntries = await api.listSkills({
        includeGlobalSkills: true,
        includeProjectSkills: true,
        projectPath: scopedProjectPath || undefined,
      });
      setSkillRegistryEntries(normalizeSkillSummaryEntries(rawEntries));
    } catch (error) {
      setSkillRegistryEntries([]);
      setSkillRegistryError(safeMessage(error, 'Failed to load skill registry.'));
    } finally {
      setLoadingSkillRegistry(false);
    }
  }, [api, selectedProjectPath, workspacePath]);

  useEffect(() => {
    refreshSkillRegistry();
  }, [refreshSkillRegistry, workspacePath, loadedWorldId]);

  return {
    skillRegistryEntries,
    loadingSkillRegistry,
    skillRegistryError,
    refreshSkillRegistry,
  };
}

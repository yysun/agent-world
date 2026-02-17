/**
 * useWorldManagement Hook
 * Purpose:
 * - Manage world lifecycle state and CRUD flows in the desktop renderer.
 *
 * Key Features:
 * - Owns world list/loading/error and create/edit form state.
 * - Handles select/create/update/delete/import and world-info refresh actions.
 * - Synchronizes edit-form state from currently loaded world.
 *
 * Implementation Notes:
 * - Preserves existing App.jsx behavior and status messaging semantics.
 * - Accepts required collaborators (session/message setters and panel controls) via args.
 *
 * Recent Changes:
 * - 2026-02-17: Extracted from `App.jsx` as part of Phase 3 custom hook migration.
 */

import { useCallback, useEffect, useState } from 'react';
import { safeMessage } from '../domain/desktop-api';
import { resolveSelectedSessionId } from '../domain/session-selection';
import { sortSessionsByNewest } from '../utils/data-transform';
import { getRefreshWarning } from '../utils/formatting';
import { validateWorldForm } from '../utils/validation';

export function useWorldManagement({
  api,
  setStatusText,
  setSessions,
  setSelectedSessionId,
  setMessages,
  setSelectedAgentId,
  setPanelOpen,
  setPanelMode,
  getDefaultWorldForm,
  getWorldFormFromWorld,
}) {
  const [loadedWorld, setLoadedWorld] = useState(null);
  const [worldLoadError, setWorldLoadError] = useState(null);
  const [loadingWorld, setLoadingWorld] = useState(false);
  const [availableWorlds, setAvailableWorlds] = useState([]);
  const [creatingWorld, setCreatingWorld] = useState(getDefaultWorldForm);
  const [editingWorld, setEditingWorld] = useState(getDefaultWorldForm);
  const [updatingWorld, setUpdatingWorld] = useState(false);
  const [deletingWorld, setDeletingWorld] = useState(false);
  const [refreshingWorldInfo, setRefreshingWorldInfo] = useState(false);

  useEffect(() => {
    if (!loadedWorld) {
      setEditingWorld(getDefaultWorldForm());
      return;
    }

    setEditingWorld(getWorldFormFromWorld(loadedWorld));
  }, [getDefaultWorldForm, getWorldFormFromWorld, loadedWorld]);

  const onSelectWorld = useCallback(async (worldId) => {
    if (!worldId) return;

    try {
      setLoadingWorld(true);
      const result = await api.loadWorld(worldId);

      if (result.success) {
        const nextSessions = sortSessionsByNewest(result.sessions || []);
        const backendCurrentChatId = String(result.world?.currentChatId || '').trim();
        setLoadedWorld(result.world);
        setSelectedAgentId(null);
        setSessions(nextSessions);
        setSelectedSessionId(
          resolveSelectedSessionId({
            sessions: nextSessions,
            backendCurrentChatId,
            currentSelectedSessionId: null
          })
        );
        setWorldLoadError(null);
        setStatusText(`World loaded: ${result.world.id}`, 'success');
        await api.saveLastSelectedWorld(worldId);
      } else {
        setLoadedWorld(null);
        setSelectedAgentId(null);
        setSessions([]);
        setWorldLoadError(result.message || result.error);
        setStatusText(result.message || 'Failed to load world', 'error');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to load world.'), 'error');
    } finally {
      setLoadingWorld(false);
    }
  }, [api, setSelectedAgentId, setSelectedSessionId, setSessions, setStatusText]);

  const onCreateWorld = useCallback(async (event) => {
    event.preventDefault();

    const validation = validateWorldForm(creatingWorld);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }

    try {
      const created = await api.createWorld(validation.data);
      setCreatingWorld(getDefaultWorldForm());
      setAvailableWorlds((worlds) => [...worlds, { id: created.id, name: created.name }]);

      setLoadedWorld(created);
      setSelectedAgentId(null);
      const nextSessions = sortSessionsByNewest(await api.listSessions(created.id));
      const backendCurrentChatId = String(created?.currentChatId || '').trim();
      setSessions(nextSessions);
      setSelectedSessionId(
        resolveSelectedSessionId({
          sessions: nextSessions,
          backendCurrentChatId,
          currentSelectedSessionId: null
        })
      );
      setWorldLoadError(null);
      await api.saveLastSelectedWorld(created.id);

      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`World created: ${created.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create world.'), 'error');
    }
  }, [api, creatingWorld, getDefaultWorldForm, setPanelMode, setPanelOpen, setSelectedAgentId, setSelectedSessionId, setSessions, setStatusText]);

  const refreshWorldDetails = useCallback(async (worldId) => {
    const result = await api.loadWorld(worldId);
    if (!result?.success || !result?.world) {
      throw new Error(result?.message || result?.error || 'Failed to refresh world.');
    }
    setLoadedWorld(result.world);
    if (Array.isArray(result.sessions)) {
      const nextSessions = sortSessionsByNewest(result.sessions);
      setSessions(nextSessions);
      const backendCurrentChatId = String(result.world?.currentChatId || '').trim();
      setSelectedSessionId((currentId) =>
        resolveSelectedSessionId({
          sessions: nextSessions,
          backendCurrentChatId,
          currentSelectedSessionId: currentId
        })
      );
    }
    return result.world;
  }, [api, setSelectedSessionId, setSessions]);

  const onRefreshWorldInfo = useCallback(async () => {
    if (!loadedWorld?.id) {
      return;
    }

    setRefreshingWorldInfo(true);
    try {
      const refreshedWorld = await refreshWorldDetails(loadedWorld.id);
      setAvailableWorlds((worlds) =>
        worlds.map((world) =>
          world.id === refreshedWorld.id
            ? { id: refreshedWorld.id, name: refreshedWorld.name }
            : world
        )
      );
      setStatusText('World info refreshed.', 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to refresh world info.'), 'error');
    } finally {
      setRefreshingWorldInfo(false);
    }
  }, [loadedWorld?.id, refreshWorldDetails, setStatusText]);

  const onUpdateWorld = useCallback(async (event) => {
    event.preventDefault();
    if (!loadedWorld?.id) {
      setStatusText('No world loaded to update.', 'error');
      return;
    }

    const validation = validateWorldForm(editingWorld);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }

    setUpdatingWorld(true);
    try {
      const updated = await api.updateWorld(loadedWorld.id, validation.data);
      const warning = getRefreshWarning(updated);
      const updatedWorld = { ...updated };
      delete updatedWorld.refreshWarning;

      setLoadedWorld(updatedWorld);
      setAvailableWorlds((worlds) =>
        worlds.map((world) => (world.id === updatedWorld.id ? { id: updatedWorld.id, name: updatedWorld.name } : world))
      );
      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(
        warning ? `World updated: ${updatedWorld.name}. ${warning}` : `World updated: ${updatedWorld.name}`,
        warning ? 'error' : 'success'
      );
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to update world.'), 'error');
    } finally {
      setUpdatingWorld(false);
    }
  }, [api, editingWorld, loadedWorld, setPanelMode, setPanelOpen, setStatusText]);

  const onDeleteWorld = useCallback(async () => {
    if (!loadedWorld?.id) {
      setStatusText('No world loaded to delete.', 'error');
      return;
    }

    const worldName = loadedWorld.name || loadedWorld.id;
    const shouldDelete = window.confirm(`Delete world "${worldName}"? This action cannot be undone.`);
    if (!shouldDelete) return;

    setDeletingWorld(true);
    try {
      await api.deleteWorld(loadedWorld.id);

      const worldsState = await api.loadWorldFromFolder();
      if (worldsState.success && Array.isArray(worldsState.worlds) && worldsState.worlds.length > 0) {
        setAvailableWorlds(worldsState.worlds);
        await onSelectWorld(worldsState.worlds[0].id);
      } else {
        setLoadedWorld(null);
        setSelectedAgentId(null);
        setAvailableWorlds([]);
        setSessions([]);
        setSelectedSessionId(null);
        setMessages([]);
        setWorldLoadError(worldsState.message || worldsState.error || 'No worlds found in this folder.');
      }

      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`World deleted: ${worldName}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to delete world.'), 'error');
    } finally {
      setDeletingWorld(false);
    }
  }, [api, loadedWorld, onSelectWorld, setMessages, setPanelMode, setPanelOpen, setSelectedAgentId, setSelectedSessionId, setSessions, setStatusText]);

  const onImportWorld = useCallback(async () => {
    try {
      const result = await api.importWorld();
      if (result.success) {
        setAvailableWorlds((worlds) => [...worlds, { id: result.world.id, name: result.world.name }]);

        const nextSessions = sortSessionsByNewest(result.sessions || []);
        const backendCurrentChatId = String(result.world?.currentChatId || '').trim();
        setLoadedWorld(result.world);
        setSelectedAgentId(null);
        setSessions(nextSessions);
        setSelectedSessionId(
          resolveSelectedSessionId({
            sessions: nextSessions,
            backendCurrentChatId,
            currentSelectedSessionId: null
          })
        );
        setWorldLoadError(null);

        setStatusText(`World imported: ${result.world.name}`, 'success');
        await api.saveLastSelectedWorld(result.world.id);
      } else {
        setStatusText(result.message || result.error || 'Failed to import world', 'error');
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to import world.'), 'error');
    }
  }, [api, setSelectedAgentId, setSelectedSessionId, setSessions, setStatusText]);

  return {
    loadedWorld,
    setLoadedWorld,
    worldLoadError,
    setWorldLoadError,
    loadingWorld,
    setLoadingWorld,
    availableWorlds,
    setAvailableWorlds,
    creatingWorld,
    setCreatingWorld,
    editingWorld,
    setEditingWorld,
    updatingWorld,
    deletingWorld,
    refreshingWorldInfo,
    onSelectWorld,
    onCreateWorld,
    refreshWorldDetails,
    onRefreshWorldInfo,
    onUpdateWorld,
    onDeleteWorld,
    onImportWorld,
  };
}

/**
 * useAppActionHandlers Hook
 * Purpose:
 * - Encapsulate UI action callbacks used by the desktop App orchestrator.
 *
 * Key Features:
 * - Handles settings/world/agent panel open-close flows.
 * - Handles agent CRUD callbacks and project-path selection updates.
 * - Handles composer Enter-key send behavior with per-session pending state checks.
 *
 * Implementation Notes:
 * - Preserves existing App behavior and status messaging semantics.
 * - Uses dependency injection for state setters and collaborators.
 *
 * Recent Changes:
 * - 2026-02-27: Updated Enter-key stop/send gating to include status-registry `working` state so keyboard behavior matches stop-button visibility.
 * - 2026-02-28: Updated settings-header action to toggle the right panel closed when settings mode is already active.
 * - 2026-02-28: Added settings-open flow helper that refreshes skill registry when System Settings panel is opened.
 * - 2026-02-27: Updated `onOpenLogsPanel` to toggle the right panel when logs mode is already active.
 * - 2026-02-27: Added `onOpenLogsPanel` action to open the right panel in unified logs mode from the header.
 * - 2026-02-26: Added `onOpenImportWorldPanel` to route world-import action into right-panel import form mode.
 * - 2026-02-20: Blocked Enter-to-send while HITL prompt queue is non-empty.
 * - 2026-02-18: Updated create-agent panel defaults to inherit world chat LLM provider/model and default auto-reply to false.
 * - 2026-02-17: Extracted from App.tsx during CC pass.
 */

import { useCallback } from 'react';
import {
  DEFAULT_AGENT_FORM,
  DEFAULT_WORLD_CHAT_LLM_MODEL,
  DEFAULT_WORLD_CHAT_LLM_PROVIDER,
} from '../constants/app-constants';
import { computeCanStopCurrentSession } from '../domain/chat-stop-state';
import { safeMessage } from '../domain/desktop-api';
import { getChatStatus, getRegistry } from '../domain/status-registry';
import { upsertEnvVariable } from '../utils/data-transform';
import { getRefreshWarning } from '../utils/formatting';
import { validateAgentForm } from '../utils/validation';

type OpenSettingsPanelArgs = {
  setPanelMode: (mode: string) => void;
  setPanelOpen: (open: boolean) => void;
  loadSystemSettings: () => Promise<void>;
  refreshSkillRegistry?: () => Promise<void>;
  panelMode?: string;
  panelOpen?: boolean;
};

async function runBestEffortAsync(task: (() => Promise<void>) | undefined): Promise<void> {
  if (!task) return;
  try {
    await task();
  } catch { }
}

export async function openSettingsPanel({
  setPanelMode,
  setPanelOpen,
  loadSystemSettings,
  refreshSkillRegistry,
  panelMode,
  panelOpen,
}: OpenSettingsPanelArgs): Promise<void> {
  if (panelOpen && panelMode === 'settings') {
    setPanelOpen(false);
    return;
  }

  setPanelMode('settings');
  setPanelOpen(true);
  await Promise.all([
    runBestEffortAsync(loadSystemSettings),
    runBestEffortAsync(refreshSkillRegistry),
  ]);
}

export function useAppActionHandlers({
  api,
  loadedWorld,
  worldAgents,
  editingAgent,
  creatingAgent,
  setStatusText,
  closePanelNeeds,
  panelMode,
  panelOpen,
  setPanelOpen,
  setPanelMode,
  setSelectedAgentId,
  setEditingWorld,
  getWorldFormFromWorld,
  setCreatingAgent,
  setEditingAgent,
  setSavingAgent,
  setDeletingAgent,
  refreshWorldDetails,
  setLoadedWorld,
  setSelectedProjectPath,
  selectedSessionId,
  sendingSessionIds,
  stoppingSessionIds,
  pendingResponseSessionIds,
  hasActiveHitlPrompt,
  composer,
  onSendMessage,
  onAddToQueue,
  loadSystemSettings,
  resetSystemSettings,
  saveSystemSettings,
  refreshSkillRegistry,
}) {
  const closePanel = useCallback(() => {
    const {
      hasUnsavedWorldChanges,
      hasUnsavedAgentChanges,
      hasUnsavedSystemSettingsChanges,
    } = closePanelNeeds;

    const hasWorldChanges = hasUnsavedWorldChanges();
    const hasAgentChanges = hasUnsavedAgentChanges();
    const hasSettingsChanges = hasUnsavedSystemSettingsChanges;

    if (hasWorldChanges || hasAgentChanges || hasSettingsChanges) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close this panel?');
      if (!confirmed) return;
    }

    setPanelOpen(false);
    setPanelMode('create-world');
    setSelectedAgentId(null);
  }, [closePanelNeeds, setPanelMode, setPanelOpen, setSelectedAgentId]);

  const onOpenSettingsPanel = useCallback(async () => {
    await openSettingsPanel({
      setPanelMode,
      setPanelOpen,
      loadSystemSettings,
      refreshSkillRegistry,
      panelMode,
      panelOpen,
    });
  }, [loadSystemSettings, panelMode, panelOpen, refreshSkillRegistry, setPanelMode, setPanelOpen]);

  const onCancelSettings = useCallback(() => {
    resetSystemSettings();
    closePanel();
  }, [closePanel, resetSystemSettings]);

  const onSaveSettings = useCallback(async () => {
    const result = await saveSystemSettings();
    if (result.saved && !result.needsRestart) {
      setPanelOpen(false);
      setPanelMode('create-world');
    }
  }, [saveSystemSettings, setPanelMode, setPanelOpen]);

  const onOpenCreateWorldPanel = useCallback(() => {
    setPanelMode('create-world');
    setPanelOpen(true);
  }, [setPanelMode, setPanelOpen]);

  const onOpenImportWorldPanel = useCallback(() => {
    setPanelMode('import-world');
    setPanelOpen(true);
  }, [setPanelMode, setPanelOpen]);

  const onOpenLogsPanel = useCallback(() => {
    if (panelOpen && panelMode === 'logs') {
      setPanelOpen(false);
      return;
    }
    setPanelMode('logs');
    setPanelOpen(true);
  }, [panelMode, panelOpen, setPanelMode, setPanelOpen]);

  const onOpenWorldEditPanel = useCallback(() => {
    if (!loadedWorld) return;
    setEditingWorld(getWorldFormFromWorld(loadedWorld));
    setPanelMode('edit-world');
    setPanelOpen(true);
  }, [getWorldFormFromWorld, loadedWorld, setEditingWorld, setPanelMode, setPanelOpen]);

  const onOpenCreateAgentPanel = useCallback(() => {
    if (!loadedWorld?.id) {
      setStatusText('Load a world before creating an agent.', 'error');
      return;
    }

    const worldProvider = String(loadedWorld.chatLLMProvider || '').trim() || DEFAULT_WORLD_CHAT_LLM_PROVIDER;
    const worldModel = String(loadedWorld.chatLLMModel || '').trim() || DEFAULT_WORLD_CHAT_LLM_MODEL;

    setSelectedAgentId(null);
    setCreatingAgent({
      ...DEFAULT_AGENT_FORM,
      provider: worldProvider,
      model: worldModel,
      autoReply: false,
    });
    setPanelMode('create-agent');
    setPanelOpen(true);
  }, [loadedWorld, setCreatingAgent, setPanelMode, setPanelOpen, setSelectedAgentId, setStatusText]);

  const onOpenEditAgentPanel = useCallback((agentId) => {
    const targetAgent = worldAgents.find((agent) => agent.id === agentId);
    if (!targetAgent) {
      setStatusText('Agent not found.', 'error');
      return;
    }

    const worldProvider = String(loadedWorld?.chatLLMProvider || '').trim() || DEFAULT_WORLD_CHAT_LLM_PROVIDER;
    const worldModel = String(loadedWorld?.chatLLMModel || '').trim() || DEFAULT_WORLD_CHAT_LLM_MODEL;

    setSelectedAgentId(targetAgent.id);
    setEditingAgent({
      id: targetAgent.id,
      name: targetAgent.name,
      autoReply: targetAgent.autoReply !== false,
      provider: targetAgent.provider || worldProvider,
      model: targetAgent.model || worldModel,
      systemPrompt: targetAgent.systemPrompt || '',
      temperature: targetAgent.temperature ?? '',
      maxTokens: targetAgent.maxTokens ?? ''
    });
    setPanelMode('edit-agent');
    setPanelOpen(true);
  }, [loadedWorld?.chatLLMModel, loadedWorld?.chatLLMProvider, setEditingAgent, setPanelMode, setPanelOpen, setSelectedAgentId, setStatusText, worldAgents]);

  const onCreateAgent = useCallback(async (event) => {
    event.preventDefault();
    if (!loadedWorld?.id) {
      setStatusText('No world loaded for agent creation.', 'error');
      return;
    }

    const validation = validateAgentForm(creatingAgent);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }

    setSavingAgent(true);
    try {
      await api.createAgent(loadedWorld.id, validation.data);

      await refreshWorldDetails(loadedWorld.id);
      setCreatingAgent(DEFAULT_AGENT_FORM);
      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`Agent created: ${validation.data.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to create agent.'), 'error');
    } finally {
      setSavingAgent(false);
    }
  }, [api, creatingAgent, loadedWorld, refreshWorldDetails, setCreatingAgent, setPanelMode, setPanelOpen, setSavingAgent, setStatusText]);

  const onUpdateAgent = useCallback(async (event) => {
    event.preventDefault();
    if (!loadedWorld?.id || !editingAgent.id) {
      setStatusText('Select an agent to update.', 'error');
      return;
    }

    const validation = validateAgentForm(editingAgent);
    if (!validation.valid) {
      setStatusText(validation.error, 'error');
      return;
    }

    setSavingAgent(true);
    try {
      await api.updateAgent(loadedWorld.id, editingAgent.id, validation.data);

      await refreshWorldDetails(loadedWorld.id);
      setPanelOpen(false);
      setPanelMode('create-world');
      setStatusText(`Agent updated: ${validation.data.name}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to update agent.'), 'error');
    } finally {
      setSavingAgent(false);
    }
  }, [api, editingAgent, loadedWorld, refreshWorldDetails, setPanelMode, setPanelOpen, setSavingAgent, setStatusText]);

  const onDeleteAgent = useCallback(async () => {
    if (!loadedWorld?.id || !editingAgent.id) {
      setStatusText('No agent selected to delete.', 'error');
      return;
    }

    const agentName = editingAgent.name || editingAgent.id;
    const shouldDelete = window.confirm(`Delete agent "${agentName}"? This action cannot be undone.`);
    if (!shouldDelete) return;

    setDeletingAgent(true);
    try {
      await api.deleteAgent(loadedWorld.id, editingAgent.id);

      await refreshWorldDetails(loadedWorld.id);
      setPanelOpen(false);
      setPanelMode('create-world');
      setSelectedAgentId(null);
      setStatusText(`Agent deleted: ${agentName}`, 'success');
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to delete agent.'), 'error');
    } finally {
      setDeletingAgent(false);
    }
  }, [api, editingAgent, loadedWorld, refreshWorldDetails, setDeletingAgent, setPanelMode, setPanelOpen, setSelectedAgentId, setStatusText]);

  const onSelectProject = useCallback(async () => {
    if (!loadedWorld?.id) {
      setStatusText('Load a world before selecting a project folder.', 'error');
      return;
    }

    try {
      const result = await api.openWorkspace();
      if (!result.canceled && result.workspacePath) {
        const selectedPath = String(result.workspacePath).trim();
        const nextVariables = upsertEnvVariable(loadedWorld.variables || '', 'working_directory', selectedPath);
        const updated = await api.updateWorld(loadedWorld.id, { variables: nextVariables });
        const warning = getRefreshWarning(updated);
        const updatedWorld = { ...updated };
        delete updatedWorld.refreshWarning;

        setLoadedWorld(updatedWorld);
        setSelectedProjectPath(selectedPath);
        setStatusText(
          warning ? `Project selected: ${selectedPath}. ${warning}` : `Project selected: ${selectedPath}`,
          warning ? 'error' : 'info'
        );
      }
    } catch (error) {
      setStatusText(safeMessage(error, 'Failed to select project folder.'), 'error');
    }
  }, [api, loadedWorld, setLoadedWorld, setSelectedProjectPath, setStatusText]);

  const onComposerKeyDown = useCallback((event) => {
    if (event.nativeEvent?.isComposing || event.keyCode === 229) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (hasActiveHitlPrompt) {
        return;
      }
      const isCurrentSessionSending = selectedSessionId && sendingSessionIds.has(selectedSessionId);
      const isCurrentSessionStopping = selectedSessionId && stoppingSessionIds.has(selectedSessionId);
      const isCurrentSessionPendingResponse = selectedSessionId && pendingResponseSessionIds.has(selectedSessionId);
      const isCurrentSessionWorking = Boolean(
        loadedWorld?.id
        && selectedSessionId
        && getChatStatus(getRegistry(), loadedWorld.id, selectedSessionId) === 'working'
      );
      const canStopCurrentSession = computeCanStopCurrentSession({
        selectedSessionId,
        isCurrentSessionSending: Boolean(isCurrentSessionSending),
        isCurrentSessionStopping: Boolean(isCurrentSessionStopping),
        isCurrentSessionPendingResponse: Boolean(isCurrentSessionPendingResponse),
        isCurrentSessionWorking,
      });

      if (canStopCurrentSession) {
        if (composer.trim() && onAddToQueue) {
          onAddToQueue(composer);
        }
        return;
      }
      if (composer.trim() && !isCurrentSessionSending) {
        onSendMessage();
      }
    }
  }, [
    composer,
    hasActiveHitlPrompt,
    loadedWorld?.id,
    onAddToQueue,
    onSendMessage,
    pendingResponseSessionIds,
    selectedSessionId,
    sendingSessionIds,
    stoppingSessionIds,
  ]);

  return {
    closePanel,
    onOpenSettingsPanel,
    onCancelSettings,
    onSaveSettings,
    onOpenCreateWorldPanel,
    onOpenImportWorldPanel,
    onOpenLogsPanel,
    onOpenWorldEditPanel,
    onOpenCreateAgentPanel,
    onOpenEditAgentPanel,
    onCreateAgent,
    onUpdateAgent,
    onDeleteAgent,
    onSelectProject,
    onComposerKeyDown,
  };
}

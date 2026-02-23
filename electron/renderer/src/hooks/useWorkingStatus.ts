/**
 * useWorkingStatus Hook
 * Purpose:
 * - React bridge to the centralized status registry.
 * - Returns per-agent and aggregated chat/world working status.
 *
 * Key Features:
 * - Subscribes to registry pub/sub; re-renders on any registry change.
 * - Merges agent display names from the loaded world's agent list.
 * - Returns stable shape regardless of whether agents are registered.
 *
 * Implementation Notes:
 * - Reads from the singleton registry store — no IPC, no side effects.
 * - Agents not yet in the registry default to `idle`.
 *
 * Recent Changes:
 * - 2026-02-22: Created as part of status-registry migration (Phase 5).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getRegistry,
  getChatStatus,
  getWorldStatus,
  getAgentStatus,
  subscribeToRegistry,
} from '../domain/status-registry';
import type { WorkingStatus } from '../domain/status-types';

export interface AgentStatusDisplay {
  id: string;
  name: string;
  status: WorkingStatus;
}

export interface WorkingStatusResult {
  chatStatus: WorkingStatus;
  worldStatus: WorkingStatus;
  agentStatuses: AgentStatusDisplay[];
}

function computeStatus(
  worldId: string | null | undefined,
  chatId: string | null | undefined,
  agents: { id: string; name: string }[],
): WorkingStatusResult {
  const registry = getRegistry();
  const wId = worldId || '';
  const cId = chatId || '';

  const chatStatus = wId && cId ? getChatStatus(registry, wId, cId) : 'idle';
  const worldStatus = wId ? getWorldStatus(registry, wId) : 'idle';

  const agentStatuses: AgentStatusDisplay[] = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    status: wId && cId ? getAgentStatus(registry, wId, cId, agent.id) : 'idle',
  }));

  return { chatStatus, worldStatus, agentStatuses };
}

export function useWorkingStatus(
  worldId: string | null | undefined,
  chatId: string | null | undefined,
  agents: { id: string; name: string }[],
): WorkingStatusResult {
  const [result, setResult] = useState<WorkingStatusResult>(() =>
    computeStatus(worldId, chatId, agents)
  );

  const refresh = useCallback(() => {
    setResult(computeStatus(worldId, chatId, agents));
  }, [worldId, chatId, agents]);

  // Re-compute when params change
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribe to registry mutations
  useEffect(() => {
    return subscribeToRegistry(refresh);
  }, [refresh]);

  return result;
}

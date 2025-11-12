/**
 * useAgentData Hook - Agent CRUD operations for a world
 * 
 * Purpose: Manage agents within a specific world via REST API
 * 
 * Features:
 * - List agents for world
 * - Create/update/delete agents
 * - Loading and error states
 * - Auto-refetch when worldId changes
 * 
 * Usage:
 * ```tsx
 * function AgentList({ worldId }: { worldId: string }) {
 *   const { agents, loading, createAgent } = useAgentData(worldId);
 *   
 *   if (loading) return <div>Loading...</div>;
 *   return (
 *     <div>
 *       {agents.map(agent => <div key={agent.id}>{agent.name}</div>)}
 *       <button onClick={() => createAgent({ name: 'New Agent', type: 'assistant' })}>
 *         Create
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 * 
 * Changes:
 * - 2025-11-12: Updated to use REST API instead of WebSocket
 * - 2025-11-03: Initial hook implementation
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';
import type { Agent, UseAgentDataReturn } from '@/types';

export function useAgentData(worldId: string): UseAgentDataReturn {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!worldId) return;

    setLoading(true);
    setError(null);

    try {
      const worldData = await api.getWorld(worldId);
      setAgents(worldData?.agents || []);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, [worldId]);

  // Auto-fetch when worldId changes
  useEffect(() => {
    if (worldId) {
      refetch();
    }
  }, [worldId, refetch]);

  const createAgent = useCallback(
    async (data: Partial<Agent>): Promise<Agent> => {
      const agent = await api.createAgent(worldId, data);
      await refetch(); // Refresh list
      return agent;
    },
    [worldId, refetch]
  );

  const updateAgent = useCallback(
    async (agentId: string, data: Partial<Agent>): Promise<Agent> => {
      const agent = await api.updateAgent(worldId, agentId, data);
      await refetch(); // Refresh list
      return agent;
    },
    [worldId, refetch]
  );

  const deleteAgent = useCallback(
    async (agentId: string): Promise<void> => {
      await api.deleteAgent(worldId, agentId);
      await refetch(); // Refresh list
    },
    [worldId, refetch]
  );

  const getAgent = useCallback(
    async (agentId: string): Promise<Agent | null> => {
      const worldData = await api.getWorld(worldId);
      return worldData?.agents?.find(a => a.id === agentId) || null;
    },
    [worldId]
  );

  return {
    agents,
    loading,
    error,
    createAgent,
    updateAgent,
    deleteAgent,
    getAgent,
    refetch
  };
}

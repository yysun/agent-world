/**
 * useAgentData Hook - Agent CRUD operations for a world
 * 
 * Purpose: Manage agents within a specific world via WebSocket commands
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
 * - 2025-11-03: Initial hook implementation
 */

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import type { Agent, UseAgentDataReturn } from '@/types';

export function useAgentData(worldId: string): UseAgentDataReturn {
  const { client, state } = useWebSocket();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!client || state !== 'connected' || !worldId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await client.sendCommand(worldId, 'list-agents');
      setAgents(data || []);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, [client, state, worldId]);

  // Auto-fetch when worldId changes or when connected
  useEffect(() => {
    if (state === 'connected' && worldId) {
      refetch();
    }
  }, [state, worldId, refetch]);

  const createAgent = useCallback(
    async (data: Partial<Agent>): Promise<Agent> => {
      if (!client) throw new Error('Client not connected');

      const agent = await client.sendCommand(worldId, 'create-agent', data);
      await refetch(); // Refresh list
      return agent;
    },
    [client, worldId, refetch]
  );

  const updateAgent = useCallback(
    async (agentId: string, data: Partial<Agent>): Promise<Agent> => {
      if (!client) throw new Error('Client not connected');

      const agent = await client.sendCommand(worldId, 'update-agent', { agentId, ...data });
      await refetch(); // Refresh list
      return agent;
    },
    [client, worldId, refetch]
  );

  const deleteAgent = useCallback(
    async (agentId: string): Promise<void> => {
      if (!client) throw new Error('Client not connected');

      await client.sendCommand(worldId, 'delete-agent', { agentId });
      await refetch(); // Refresh list
    },
    [client, worldId, refetch]
  );

  const getAgent = useCallback(
    async (agentId: string): Promise<Agent | null> => {
      if (!client) throw new Error('Client not connected');

      return await client.sendCommand(worldId, 'get-agent', { agentId });
    },
    [client, worldId]
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

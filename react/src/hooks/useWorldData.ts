/**
 * useWorldData Hook - World CRUD operations
 * 
 * Purpose: Manage worlds via WebSocket commands
 * 
 * Features:
 * - List worlds
 * - Create/update/delete worlds
 * - Loading and error states
 * - Auto-refetch on mount
 * 
 * Usage:
 * ```tsx
 * function WorldList() {
 *   const { worlds, loading, createWorld } = useWorldData();
 *   
 *   if (loading) return <div>Loading...</div>;
 *   return (
 *     <div>
 *       {worlds.map(world => <div key={world.id}>{world.name}</div>)}
 *       <button onClick={() => createWorld({ name: 'New World' })}>
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
import type { World, UseWorldDataReturn } from '@/types';

export function useWorldData(): UseWorldDataReturn {
  const { client, state } = useWebSocket();
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!client || state !== 'connected') return;

    setLoading(true);
    setError(null);

    try {
      const data = await client.sendCommand(undefined, 'list-worlds');
      setWorlds(data || []);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch worlds:', err);
    } finally {
      setLoading(false);
    }
  }, [client, state]);

  // Auto-fetch on mount and when connected
  useEffect(() => {
    if (state === 'connected') {
      refetch();
    }
  }, [state, refetch]);

  const createWorld = useCallback(
    async (data: { name: string; description?: string }): Promise<World> => {
      if (!client) throw new Error('Client not connected');

      const world = await client.sendCommand(undefined, 'create-world', data);
      await refetch(); // Refresh list
      return world;
    },
    [client, refetch]
  );

  const updateWorld = useCallback(
    async (worldId: string, data: { name?: string; description?: string }): Promise<World> => {
      if (!client) throw new Error('Client not connected');

      const world = await client.sendCommand(undefined, 'update-world', { worldId, ...data });
      await refetch(); // Refresh list
      return world;
    },
    [client, refetch]
  );

  const deleteWorld = useCallback(
    async (worldId: string): Promise<void> => {
      if (!client) throw new Error('Client not connected');

      await client.sendCommand(undefined, 'delete-world', { worldId });
      await refetch(); // Refresh list
    },
    [client, refetch]
  );

  const getWorld = useCallback(
    async (worldId: string): Promise<World | null> => {
      if (!client) throw new Error('Client not connected');

      return await client.sendCommand(undefined, 'get-world', { worldId });
    },
    [client]
  );

  return {
    worlds,
    loading,
    error,
    createWorld,
    updateWorld,
    deleteWorld,
    getWorld,
    refetch
  };
}

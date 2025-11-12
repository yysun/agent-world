/**
 * useWorldData Hook - World CRUD operations
 * 
 * Purpose: Manage worlds via REST API
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
 * - 2025-11-12: Updated to use REST API instead of WebSocket
 * - 2025-11-03: Initial hook implementation
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '@/lib/api';
import type { World, UseWorldDataReturn } from '@/types';

export function useWorldData(): UseWorldDataReturn {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.getWorlds();
      setWorlds(data || []);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch worlds:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    refetch();
  }, [refetch]);

  const createWorld = useCallback(
    async (data: { name: string; description?: string }): Promise<World> => {
      const world = await api.createWorld(data);
      await refetch(); // Refresh list
      return world;
    },
    [refetch]
  );

  const updateWorld = useCallback(
    async (worldId: string, data: { name?: string; description?: string }): Promise<World> => {
      const world = await api.updateWorld(worldId, data);
      await refetch(); // Refresh list
      return world;
    },
    [refetch]
  );

  const deleteWorld = useCallback(
    async (worldId: string): Promise<void> => {
      await api.deleteWorld(worldId);
      await refetch(); // Refresh list
    },
    [refetch]
  );

  const getWorld = useCallback(
    async (worldId: string): Promise<World | null> => {
      return await api.getWorld(worldId);
    },
    []
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

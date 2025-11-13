/**
 * Agent Management Hooks - Agent CRUD and memory operations
 * 
 * Source: Replaces web/src/domain/agent-management.ts API functions
 * Created for: React 19.2.0
 * 
 * Features:
 * - useDeleteAgent - Delete agent with cleanup
 * - useClearAgentMemory - Clear single agent's memory
 * - useClearWorldMemory - Clear all agents' memory
 * 
 * Changes from source:
 * - Converted API-heavy functions to React hooks
 * - Added loading and error states
 * - Uses useCallback for stable references
 */

import { useState, useCallback } from 'react';
import * as api from '../lib/api';
import type { Agent } from '../types';

/**
 * Hook for deleting an agent
 * 
 * @param worldName - Name of the world
 * @returns Delete function and state
 */
export function useDeleteAgent(worldName: string) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteAgent = useCallback(async (agent: Agent) => {
    setIsDeleting(true);
    setError(null);
    try {
      await api.deleteAgent(worldName, agent.name);
      return { success: true };
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to delete agent';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsDeleting(false);
    }
  }, [worldName]);

  return { deleteAgent, isDeleting, error };
}

/**
 * Hook for clearing an agent's memory
 * 
 * @param worldName - Name of the world
 * @returns Clear memory function and state
 */
export function useClearAgentMemory(worldName: string) {
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearMemory = useCallback(async (agent: Agent) => {
    setIsClearing(true);
    setError(null);
    try {
      await api.clearAgentMemory(worldName, agent.name);
      return { success: true };
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to clear agent memory';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsClearing(false);
    }
  }, [worldName]);

  return { clearMemory, isClearing, error };
}

/**
 * Hook for clearing all agents' memory in a world
 * 
 * @param worldName - Name of the world
 * @returns Clear all memory function and state
 */
export function useClearWorldMemory(worldName: string) {
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearAllMemory = useCallback(async (agents: Agent[]) => {
    setIsClearing(true);
    setError(null);
    try {
      await Promise.all(
        agents.map(agent => api.clearAgentMemory(worldName, agent.name))
      );
      return { success: true };
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to clear world memory';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsClearing(false);
    }
  }, [worldName]);

  return { clearAllMemory, isClearing, error };
}

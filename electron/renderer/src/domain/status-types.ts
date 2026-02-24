/**
 * Status Types
 * Purpose:
 * - Defines the shared data model for the centralized agent working-status registry.
 *
 * Key Types:
 * - `WorkingStatus`: tri-state per agent/chat/world: idle | working | complete.
 * - `AgentStatusEntry`: per-agent in-flight counters and rolled-up status.
 * - `ChatStatusEntry`, `WorldStatusEntry`, `StatusRegistry`: hierarchical containers.
 *
 * Implementation Notes:
 * - All types are plain data (no classes, no React); safe to use in pure functions and tests.
 *
 * Recent Changes:
 * - 2026-02-22: Created as part of status-registry migration (Phase 2).
 */

export type WorkingStatus = 'idle' | 'working' | 'complete';

export interface AgentStatusEntry {
  agentId: string;
  status: WorkingStatus;
}

export interface ChatStatusEntry {
  chatId: string;
  agents: Map<string, AgentStatusEntry>;
}

export interface WorldStatusEntry {
  worldId: string;
  chats: Map<string, ChatStatusEntry>;
}

export interface StatusRegistry {
  worlds: Map<string, WorldStatusEntry>;
}

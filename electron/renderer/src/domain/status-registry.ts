/**
 * Status Registry
 * Purpose:
 * - Pure-function registry for per-agent/chat/world working status.
 * - Singleton mutable store with lightweight pub/sub for React integration.
 *
 * Key Exports:
 * - Pure query/mutation functions: `createStatusRegistry`, `getAgentStatus`,
 *   `getChatStatus`, `getWorldStatus`, `clearChatAgents`, `syncWorldRoster`.
 * - Singleton store: `updateRegistry`, `subscribeToRegistry`, `getRegistry`.
 *
 * Implementation Notes:
 * - Pure functions return new registry objects (no mutation).
 * - Rollup: any child `working` → parent `working`; any `complete` (none `working`) → `complete`; otherwise `idle`.
 * - `syncWorldRoster` is non-destructive: `working`/`complete` agents survive syncs.
 *
 * Recent Changes:
 * - 2026-02-24: Added `completeWorkingChatAgents` to mark lingering `working`
 *   agents as `complete` when HITL prompts arrive without an agent name.
 * - 2026-02-22: Created as part of status-registry migration (Phase 2).
 */

import type {
  AgentStatusEntry,
  ChatStatusEntry,
  StatusRegistry,
  WorkingStatus,
  WorldStatusEntry,
} from './status-types';

// ─── Pure registry factory ────────────────────────────────────────────────────

export function createStatusRegistry(): StatusRegistry {
  return { worlds: new Map() };
}

// ─── Rollup helpers ───────────────────────────────────────────────────────────

function rollupStatuses(statuses: WorkingStatus[]): WorkingStatus {
  if (statuses.some((s) => s === 'working')) return 'working';
  if (statuses.some((s) => s === 'complete')) return 'complete';
  return 'idle';
}

// ─── Pure query functions ─────────────────────────────────────────────────────

export function getAgentStatus(
  registry: StatusRegistry,
  worldId: string,
  chatId: string,
  agentId: string,
): WorkingStatus {
  return registry.worlds.get(worldId)?.chats.get(chatId)?.agents.get(agentId)?.status ?? 'idle';
}

export function getChatStatus(
  registry: StatusRegistry,
  worldId: string,
  chatId: string,
): WorkingStatus {
  const chat = registry.worlds.get(worldId)?.chats.get(chatId);
  if (!chat) return 'idle';
  return rollupStatuses([...chat.agents.values()].map((a) => a.status));
}

export function getWorldStatus(
  registry: StatusRegistry,
  worldId: string,
): WorkingStatus {
  const world = registry.worlds.get(worldId);
  if (!world) return 'idle';
  const chatStatuses = [...world.chats.keys()].map((chatId) =>
    getChatStatus(registry, worldId, chatId)
  );
  return rollupStatuses(chatStatuses);
}

// ─── Pure mutation functions ──────────────────────────────────────────────────

export function clearChatAgents(
  registry: StatusRegistry,
  worldId: string,
  chatId: string,
): StatusRegistry {
  const world = registry.worlds.get(worldId);
  if (!world) return registry;
  const chat = world.chats.get(chatId);
  if (!chat) return registry;

  const newChat: ChatStatusEntry = { chatId, agents: new Map() };
  const newChats = new Map(world.chats);
  newChats.set(chatId, newChat);
  const newWorld: WorldStatusEntry = { worldId, chats: newChats };
  const newWorlds = new Map(registry.worlds);
  newWorlds.set(worldId, newWorld);
  return { worlds: newWorlds };
}

/**
 * Post-replay normalization: force any agent still at `working` to `complete`.
 * Used after DB event replay to handle incomplete sequences (e.g. sse/end missing
 * because the session was interrupted before it could be persisted).
 */
export function finalizeReplayedChat(
  registry: StatusRegistry,
  worldId: string,
  chatId: string,
): StatusRegistry {
  const world = registry.worlds.get(worldId);
  const chat = world?.chats.get(chatId);
  if (!chat) return registry;

  let changed = false;
  const agents = new Map(chat.agents);
  for (const [id, agent] of agents) {
    if (agent.status === 'working') {
      agents.set(id, { ...agent, status: 'complete' });
      changed = true;
    }
  }
  if (!changed) return registry;

  const chats = new Map(world!.chats);
  chats.set(chatId, { chatId, agents });
  const worlds = new Map(registry.worlds);
  worlds.set(worldId, { worldId, chats });
  return { worlds };
}

/**
 * Mark only currently-working agents in a chat as complete.
 * Used for HITL pause events that may not include a specific agent identity.
 */
export function completeWorkingChatAgents(
  registry: StatusRegistry,
  worldId: string,
  chatId: string,
): StatusRegistry {
  const world = registry.worlds.get(worldId);
  const chat = world?.chats.get(chatId);
  if (!chat) return registry;

  let changed = false;
  const agents = new Map(chat.agents);
  for (const [id, agent] of agents) {
    if (agent.status === 'working') {
      agents.set(id, { ...agent, status: 'complete' });
      changed = true;
    }
  }
  if (!changed) return registry;

  const chats = new Map(world!.chats);
  chats.set(chatId, { chatId, agents });
  const worlds = new Map(registry.worlds);
  worlds.set(worldId, { worldId, chats });
  return { worlds };
}

/**
 * Non-destructive sync: adds new chats/agents as `idle`, removes stale ones,
 * leaves `working`/`complete` agents untouched.
 */
export function syncWorldRoster(
  registry: StatusRegistry,
  worldId: string,
  chatIds: string[],
  agentIds: string[],
): StatusRegistry {
  const existingWorld = registry.worlds.get(worldId);
  const agentIdSet = new Set(agentIds);
  const chatIdSet = new Set(chatIds);

  // Build updated chat map (keep existing statuses, add/remove as needed)
  const newChats = new Map<string, ChatStatusEntry>();
  for (const chatId of chatIds) {
    const existingChat = existingWorld?.chats.get(chatId);
    const newAgents = new Map<string, AgentStatusEntry>();

    for (const agentId of agentIds) {
      const existing = existingChat?.agents.get(agentId);
      if (existing) {
        newAgents.set(agentId, existing);
      } else {
        newAgents.set(agentId, { agentId, status: 'idle' });
      }
    }

    // Preserve in-flight working agents not in the new roster (edge case)
    if (existingChat) {
      for (const [agentId, entry] of existingChat.agents) {
        if (!agentIdSet.has(agentId) && (entry.status === 'working' || entry.status === 'complete')) {
          newAgents.set(agentId, entry);
        }
      }
    }

    newChats.set(chatId, { chatId, agents: newAgents });
  }

  // Preserve in-flight working chats not in the new roster (edge case)
  if (existingWorld) {
    for (const [chatId, chat] of existingWorld.chats) {
      if (!chatIdSet.has(chatId)) {
        const hasActive = [...chat.agents.values()].some(
          (a) => a.status === 'working' || a.status === 'complete'
        );
        if (hasActive) {
          newChats.set(chatId, chat);
        }
      }
    }
  }

  const newWorld: WorldStatusEntry = { worldId, chats: newChats };
  const newWorlds = new Map(registry.worlds);
  newWorlds.set(worldId, newWorld);
  return { worlds: newWorlds };
}

// ─── Singleton mutable store with pub/sub ────────────────────────────────────

let _registry: StatusRegistry = createStatusRegistry();
const _listeners = new Set<() => void>();

export function getRegistry(): StatusRegistry {
  return _registry;
}

export function updateRegistry(fn: (r: StatusRegistry) => StatusRegistry): void {
  _registry = fn(_registry);
  for (const listener of _listeners) {
    listener();
  }
}

export function subscribeToRegistry(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

/**
 * Status Updater
 * Purpose:
 * - Pure reducer: maps a single realtime event to a registry state transition.
 *
 * Key Exports:
 * - `applyEventToRegistry(registry, worldId, chatId, agentId, eventType, subtype)` — pure reducer.
 * - `parseStoredEventReplayArgs(storedEvent)` — extracts replay args from a raw DB event; returns
 *   null for events that should be skipped (human/user messages, unknown types, missing fields).
 *
 * Event → Transition Table:
 * | eventType | subtype           | Effect on agent              |
 * |-----------|-------------------|------------------------------|
 * | sse       | start             | status → working             |
 * | sse       | end / error       | status → complete            |
 * | tool      | tool-start        | status → working             |
 * | tool      | tool-result/error | status → complete            |
 * | system    | hitl-option-req.  | status → complete            |
 * | message   | (any)             | status → complete            |
 *
 * Implementation Notes:
 * - No counters: direct state transitions. The activity event handler
 *   (response-end/idle) calls clearChatAgents which is the authoritative
 *   reset to idle. The complete state is an intermediate signal ("just
 *   finished") visible between stream end and the activity event arrival.
 * - Correct for DB replay (getChatEvents on chat entry): replayed events
 *   end in `complete`, not stuck at `working`.
 * - Ensures registry world/chat/agent entries exist before mutation.
 *
 * Recent Changes:
 * - 2026-02-24: Removed inFlightSse/inFlightTools counter arithmetic; status is
 *   now set directly on start events and cleared by activity events via
 *   clearChatAgents (matches web app's pendingOperations-driven approach).
 * - 2026-02-22: Created as part of status-registry migration (Phase 3).
 */

import type { AgentStatusEntry, ChatStatusEntry, StatusRegistry, WorldStatusEntry } from './status-types';

export type RegistryEventType = 'sse' | 'tool' | 'system' | 'message';

export type ReplayEventArgs = {
  agentName: string;
  eventType: RegistryEventType;
  subtype: string;
};

/**
 * Parse a raw stored DB event into the arguments needed for applyEventToRegistry.
 * Returns null for events that should be skipped during replay:
 * - message events from human/user senders
 * - events with missing agentName or subtype
 * - unknown event categories (world, system, etc.)
 */
export function parseStoredEventReplayArgs(storedEvent: unknown): ReplayEventArgs | null {
  const event = storedEvent as Record<string, unknown> | null;
  if (!event) return null;

  const eventCategory = String(event?.type || '').trim();
  const payload = (event?.payload || {}) as Record<string, unknown>;

  if (eventCategory === 'message') {
    const sender = String(payload?.sender || '').trim();
    if (!sender || sender === 'human' || sender === 'user') return null;
    return { agentName: sender, eventType: 'message', subtype: 'received' };
  }

  if (eventCategory !== 'sse' && eventCategory !== 'tool') return null;

  const agentName = String(payload?.agentName || '').trim();
  if (!agentName) return null;
  const subtype = String(payload?.type || '').trim();
  if (!subtype) return null;

  return { agentName, eventType: eventCategory as RegistryEventType, subtype };
}
export type RegistryEventSubtype =
  | 'start' | 'end' | 'error'
  | 'tool-start' | 'tool-result' | 'tool-error'
  | 'hitl-option-request'
  | string;

function ensureAgent(registry: StatusRegistry, worldId: string, chatId: string, agentId: string): {
  entry: AgentStatusEntry;
  registry: StatusRegistry;
} {
  const worlds = new Map(registry.worlds);
  const existingWorld = worlds.get(worldId);
  const chats = existingWorld ? new Map(existingWorld.chats) : new Map<string, ChatStatusEntry>();
  const existingChat = chats.get(chatId);
  const agents = existingChat ? new Map(existingChat.agents) : new Map<string, AgentStatusEntry>();

  const existingEntry = agents.get(agentId);
  const entry: AgentStatusEntry = existingEntry
    ? { ...existingEntry }
    : { agentId, status: 'idle' };

  agents.set(agentId, entry);
  chats.set(chatId, { chatId, agents });
  worlds.set(worldId, { worldId, chats });
  return { entry, registry: { worlds } };
}

export function applyEventToRegistry(
  registry: StatusRegistry,
  worldId: string,
  chatId: string,
  agentId: string,
  eventType: RegistryEventType,
  subtype: RegistryEventSubtype,
): StatusRegistry {
  const { entry, registry: r } = ensureAgent(registry, worldId, chatId, agentId);
  const agent = entry;

  if (eventType === 'sse' && subtype === 'start') {
    agent.status = 'working';
  } else if (eventType === 'sse' && (subtype === 'end' || subtype === 'error')) {
    agent.status = 'complete';
  } else if (eventType === 'tool' && subtype === 'tool-start') {
    agent.status = 'working';
  } else if (eventType === 'tool' && (subtype === 'tool-result' || subtype === 'tool-error')) {
    agent.status = 'complete';
  } else if (eventType === 'system' && subtype === 'hitl-option-request') {
    // Agent is paused waiting for human input — mark complete until activity event resets.
    agent.status = 'complete';
  } else if (eventType === 'message') {
    agent.status = 'complete';
  }
  // clearChatAgents via the activity event handler is the authoritative reset to idle.

  return r;
}

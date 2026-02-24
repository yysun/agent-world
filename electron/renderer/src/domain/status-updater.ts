/**
 * Status Updater
 * Purpose:
 * - Pure reducer: maps a single realtime event to a registry state transition.
 *
 * Key Exports:
 * - `applyEventToRegistry(registry, worldId, chatId, agentId, eventType, subtype)` — pure reducer.
 *
 * Event → Transition Table:
 * | eventType | subtype           | Effect on agent                          |
 * |-----------|-------------------|------------------------------------------|
 * | sse       | start             | inFlightSse++, status → working          |
 * | sse       | end               | inFlightSse--, counters=0 → complete     |
 * | sse       | error             | inFlightSse--, counters=0 → complete     |
 * | tool      | start             | inFlightTools++, status → working        |
 * | tool      | result            | inFlightTools--, counters=0 → complete   |
 * | tool      | error             | inFlightTools--, counters=0 → complete   |
 * | system    | hitl-option-req.  | status → complete (reset counters)       |
 * | reset     | *                 | status → idle (reset counters)           |
 *
 * Implementation Notes:
 * - Counters never go below 0 (guarded with Math.max(0, counter - 1)).
 * - Ensures registry world/chat/agent entries exist before mutation.
 *
 * Recent Changes:
 * - 2026-02-22: Created as part of status-registry migration (Phase 3).
 */

import type { AgentStatusEntry, ChatStatusEntry, StatusRegistry, WorldStatusEntry } from './status-types';

export type RegistryEventType = 'sse' | 'tool' | 'system' | 'reset';
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
    : { agentId, status: 'idle', inFlightSse: 0, inFlightTools: 0 };

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

  if (eventType === 'sse') {
    if (subtype === 'start') {
      agent.inFlightSse++;
      agent.status = 'working';
    } else if (subtype === 'end' || subtype === 'error') {
      agent.inFlightSse = Math.max(0, agent.inFlightSse - 1);
      if (agent.inFlightSse <= 0 && agent.inFlightTools <= 0) {
        agent.status = 'complete';
      }
    }
  } else if (eventType === 'tool') {
    if (subtype === 'tool-start') {
      agent.inFlightTools++;
      agent.status = 'working';
    } else if (subtype === 'tool-result' || subtype === 'tool-error') {
      agent.inFlightTools = Math.max(0, agent.inFlightTools - 1);
      if (agent.inFlightSse <= 0 && agent.inFlightTools <= 0) {
        agent.status = 'complete';
      }
    }
  } else if (eventType === 'system' && subtype === 'hitl-option-request') {
    agent.inFlightSse = 0;
    agent.inFlightTools = 0;
    agent.status = 'complete';
  } else if (eventType === 'reset') {
    agent.inFlightSse = 0;
    agent.inFlightTools = 0;
    agent.status = 'idle';
  }

  return r;
}

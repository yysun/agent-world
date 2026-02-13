/**
 * Electron Preload Payload Helpers
 *
 * Purpose:
 * - Normalize bridge payloads into stable object shapes before IPC invocation.
 *
 * Key Features:
 * - String normalization for world/chat/message/subscription identifiers.
 * - Shared payload builders for world/chat/session/agent operations.
 *
 * Implementation Notes:
 * - Uses best-effort conversion to strings to preserve existing behavior.
 * - Main-process handlers remain responsible for hard validation.
 *
 * Recent Changes:
 * - 2026-02-13: Added message-edit payload helper (`toMessageEditPayload`) for core-driven edit IPC.
 * - 2026-02-12: Added preload payload helpers for Phase 4 bridge modularization.
 */

import type {
  AgentPayload,
  MessageEditPayload,
  ChatSubscribePayload,
  ChatUnsubscribePayload,
  MessageDeletePayload,
  WorldChatPayload,
  WorldIdPayload,
  WorldLastSelectedPayload
} from '../shared/ipc-contracts.js';

function toId(value: unknown): string {
  return String(value ?? '');
}

export function toWorldPayload(worldId: unknown): WorldIdPayload {
  return { worldId: toId(worldId) };
}

export function toWorldLastSelectedPayload(worldId: unknown): WorldLastSelectedPayload {
  return { worldId: toId(worldId) };
}

export function toWorldChatPayload(worldId: unknown, chatId: unknown): WorldChatPayload {
  return {
    worldId: toId(worldId),
    chatId: toId(chatId)
  };
}

export function toAgentPayload(
  worldId: unknown,
  agentId: unknown,
  payload: Record<string, unknown> = {}
): AgentPayload {
  return {
    worldId: toId(worldId),
    agentId: toId(agentId),
    ...payload
  };
}

export function toWorldWithPayload(
  worldId: unknown,
  payload: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    worldId: toId(worldId),
    ...payload
  };
}

export function toMessageDeletePayload(
  worldId: unknown,
  messageId: unknown,
  chatId: unknown
): MessageDeletePayload {
  return {
    worldId: toId(worldId),
    messageId: toId(messageId),
    chatId: toId(chatId)
  };
}

export function toMessageEditPayload(
  worldId: unknown,
  messageId: unknown,
  newContent: unknown,
  chatId: unknown
): MessageEditPayload {
  return {
    worldId: toId(worldId),
    messageId: toId(messageId),
    newContent: String(newContent ?? ''),
    chatId: toId(chatId)
  };
}

export function toSubscribePayload(
  worldId: unknown,
  chatId: unknown,
  subscriptionId: unknown
): ChatSubscribePayload {
  return {
    worldId: toId(worldId),
    chatId: toId(chatId),
    subscriptionId: toId(subscriptionId)
  };
}

export function toUnsubscribePayload(subscriptionId: unknown): ChatUnsubscribePayload {
  return {
    subscriptionId: toId(subscriptionId)
  };
}

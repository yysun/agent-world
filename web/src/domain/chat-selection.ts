/**
 * Chat Selection Domain Helpers
 *
 * Purpose:
 * - Resolve the active chat ID using stable precedence for web world initialization.
 *
 * Key Features:
 * - Prioritizes current UI-selected chat ID when it exists in world chats.
 * - Falls back to backend `world.currentChatId` when current selection is unavailable.
 * - Supports world chat collections represented as arrays, maps, or plain objects.
 *
 * Implementation Notes:
 * - Pure function helpers with no side effects.
 * - Keeps selection rules aligned with Electron renderer behavior.
 *
 * Recent Changes:
 * - 2026-02-15: Added current-selection-first chat resolution for web app parity with desktop.
 */

import type { World } from '../types';

function hasChatId(world: Pick<World, 'chats'> | null | undefined, chatId: string): boolean {
  const normalizedChatId = String(chatId || '').trim();
  if (!normalizedChatId) return false;

  const chats = world?.chats as unknown;

  if (Array.isArray(chats)) {
    return chats.some((chat) => String((chat as any)?.id || '').trim() === normalizedChatId);
  }

  if (chats instanceof Map) {
    return chats.has(normalizedChatId);
  }

  if (chats && typeof chats === 'object') {
    const chatObject = chats as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(chatObject, normalizedChatId)) {
      return true;
    }
    return Object.values(chatObject).some((chat) => String((chat as any)?.id || '').trim() === normalizedChatId);
  }

  return false;
}

export function resolveActiveChatId(
  world: Pick<World, 'chats' | 'currentChatId'> | null | undefined,
  currentSelectedChatId?: string | null
): string | null {
  const normalizedCurrentSelectedChatId = String(currentSelectedChatId || '').trim();
  if (normalizedCurrentSelectedChatId && hasChatId(world, normalizedCurrentSelectedChatId)) {
    return normalizedCurrentSelectedChatId;
  }

  const normalizedBackendCurrentChatId = String(world?.currentChatId || '').trim();
  if (normalizedBackendCurrentChatId && hasChatId(world, normalizedBackendCurrentChatId)) {
    return normalizedBackendCurrentChatId;
  }

  return null;
}

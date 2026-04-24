/**
 * Message Cutoff Helpers
 *
 * Purpose:
 * - Provide reusable, storage-agnostic chat-tail cutoff logic based on a target
 *   message identity and timestamp.
 *
 * Key Features:
 * - Trims same-chat items from a target message onward.
 * - Uses timestamp cutoff when available and falls back to index-based trimming.
 * - Operates on minimal message-like records so core, Electron, CLI, and API
 *   callers can share the same semantics.
 *
 * Notes:
 * - This module is intentionally dependency-free so renderer code can import it
 *   without dragging in Node-specific core runtime modules.
 *
 * Recent Changes:
 * - 2026-04-23: Preserve earlier same-timestamp rows that still precede the edited message while continuing to trim later same-chat rows with equal-or-later timestamps.
 * - 2026-04-23: Made timestamp-bearing rows authoritative during cutoff trimming so stale
 *   HITL/tool rows are removed even when their local array order drifts ahead of the edited
 *   user turn; index fallback now applies only to rows without usable timestamps.
 * - 2026-03-10: Extracted generic chat-tail cutoff logic from Electron renderer
 *   message updates so edit/delete flows can share one cutoff policy.
 */

export interface ChatCutoffItemLike {
  messageId?: string | null;
  chatId?: string | null;
  createdAt?: string | Date | null;
}

export function getChatCutoffItemTimestamp(item: ChatCutoffItemLike): number {
  const value = item?.createdAt;
  if (!value) return 0;

  const timestamp = value instanceof Date
    ? value.getTime()
    : new Date(value).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function trimChatItemsFromCutoff<T extends ChatCutoffItemLike>(
  items: T[],
  messageId: string,
  chatId: string | null,
): T[] {
  const normalizedMessageId = String(messageId || '').trim();
  const normalizedChatId = String(chatId || '').trim() || null;
  if (!normalizedMessageId) {
    return items;
  }

  const targetIndex = items.findIndex(
    (item) => String(item?.messageId || '').trim() === normalizedMessageId
  );
  if (targetIndex < 0) {
    return items;
  }

  const targetItem = items[targetIndex];
  const targetChatId = normalizedChatId || String(targetItem?.chatId || '').trim() || null;
  const cutoffTimestamp = getChatCutoffItemTimestamp(targetItem);

  const next = items.filter((item, index) => {
    const itemChatId = String(item?.chatId || '').trim() || null;
    if (targetChatId && itemChatId !== targetChatId) {
      return true;
    }

    if (cutoffTimestamp <= 0) {
      return index < targetIndex;
    }

    const itemTimestamp = getChatCutoffItemTimestamp(item);
    if (itemTimestamp <= 0) {
      return index < targetIndex;
    }

    if (itemTimestamp < cutoffTimestamp) {
      return true;
    }

    if (itemTimestamp > cutoffTimestamp) {
      return false;
    }

    return index < targetIndex;
  });

  return next.length === items.length ? items : next;
}

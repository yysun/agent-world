/**
 * Title Scheduler Module
 *
 * Purpose:
 * - Encapsulate all chat-title auto-generation logic (Layer 4).
 * - Previously embedded in subscribers.ts (Layer 6); extracted so persistence.ts (Layer 4) can
 *   call title-scheduling directly without a cross-layer import violation.
 *
 * Key Features:
 * - Idle-triggered title generation on world activity events.
 * - In-flight deduplication and compare-and-set storage commit.
 * - World teardown cleanup helper that preserves the listener contract.
 *
 * Implementation Notes:
 * - All state (in-flight set, storage cache) is module-level to preserve
 *   singleton semantics previously in subscribers.ts.
 *
 * Recent Changes:
 * - 2026-03-10: Removed the human-message debounce trigger so idle activity is the sole
 *   automatic chat-title generation entry point.
 * - 2026-03-03: Extracted from subscribers.ts to eliminate duplicate world-level EventEmitter
 *   listeners (persistence + activity + title-scheduler each had their own handler per channel).
 */

import type { World, StorageAPI } from '../types.js';
import { createCategoryLogger } from '../logger.js';
import { createStorageWithWrappers } from '../storage/storage-factory.js';
import { generateChatTitleFromMessages } from './memory-manager.js';
import { publishEvent } from './publishers.js';
import { isDefaultChatTitle, NEW_CHAT_TITLE, TITLE_PROVENANCE_AUTO } from '../chat-constants.js';

const loggerChatTitle = createCategoryLogger('chattitle');

const titleGenerationInFlight = new Set<string>();

let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers!;
}

function getTitleGenerationKey(worldId: string, chatId: string): string {
  return `${worldId}:${chatId}`;
}

export function isHumanSender(sender?: string): boolean {
  const normalized = String(sender ?? '').trim().toLowerCase();
  return normalized === 'human' || normalized === 'world' || normalized.startsWith('user');
}

export async function runIdleTitleUpdate(world: World, event: any): Promise<void> {
  if (event.type !== 'idle' || event.pendingOperations !== 0) {
    return;
  }
  const targetChatIdRaw = typeof event?.chatId === 'string' ? event.chatId.trim() : '';
  const targetChatId = targetChatIdRaw || null;
  if (!targetChatId) {
    loggerChatTitle.debug('Skipping idle title update due to missing chatId on activity event', {
      worldId: world.id,
      eventType: event?.type,
      pendingOperations: event?.pendingOperations
    });
    return;
  }
  try {
    await tryGenerateAndApplyTitle(world, targetChatId, '', 'idle');
  } catch (err) {
    loggerChatTitle.warn('Activity-based title update failed', { error: err instanceof Error ? err.message : err });
  }
}

export function clearWorldTitleTimers(worldId: string): void {
  void worldId;
}

async function commitChatTitleIfDefault(
  world: World,
  chatId: string,
  nextTitle: string
): Promise<boolean> {
  const storage = await getStorageWrappers();

  if (typeof storage.updateChatNameIfCurrent === 'function') {
    return storage.updateChatNameIfCurrent(world.id, chatId, NEW_CHAT_TITLE, nextTitle, TITLE_PROVENANCE_AUTO);
  }

  // Legacy fallback when storage backend does not provide compare-and-set helper.
  const persistedChat = await storage.loadChatData(world.id, chatId);
  if (!persistedChat || !isDefaultChatTitle(persistedChat.name)) {
    return false;
  }

  const updated = await storage.updateChatData(world.id, chatId, { name: nextTitle, titleProvenance: TITLE_PROVENANCE_AUTO });
  return !!updated;
}

async function tryGenerateAndApplyTitle(
  world: World,
  targetChatId: string,
  content: string,
  source: 'idle'
): Promise<void> {
  const inFlightKey = getTitleGenerationKey(world.id, targetChatId);
  if (titleGenerationInFlight.has(inFlightKey)) {
    loggerChatTitle.debug('Skipping title update because generation is already in flight', {
      worldId: world.id,
      chatId: targetChatId,
      source
    });
    return;
  }

  const chat = world.chats.get(targetChatId);
  if (!chat || !isDefaultChatTitle(chat.name)) {
    return;
  }

  titleGenerationInFlight.add(inFlightKey);

  try {
    const title = await generateChatTitleFromMessages(world, content, targetChatId);
    if (!title) {
      return;
    }

    // Re-check in-memory state before commit.
    const currentChat = world.chats.get(targetChatId);
    if (!currentChat || !isDefaultChatTitle(currentChat.name)) {
      loggerChatTitle.debug('Skipping title commit because in-memory chat title is no longer default', {
        worldId: world.id,
        chatId: targetChatId,
        source,
        currentName: currentChat?.name
      });
      return;
    }

    const committed = await commitChatTitleIfDefault(world, targetChatId, title);
    if (!committed) {
      loggerChatTitle.debug('Skipping title commit because persisted chat title no longer matches default', {
        worldId: world.id,
        chatId: targetChatId,
        source
      });
      return;
    }

    currentChat.name = title;
    currentChat.titleProvenance = TITLE_PROVENANCE_AUTO;
    publishEvent(world, 'system', {
      eventType: 'chat-title-updated',
      chatId: targetChatId,
      title,
      source,
      message: `Chat title updated: ${title}`,
    }, targetChatId);
  } finally {
    titleGenerationInFlight.delete(inFlightKey);
  }
}

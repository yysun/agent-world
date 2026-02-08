/**
 * Subscribers Module
 * 
 * Provides event subscription handlers for agents and world.
 * Handles message routing, tool result processing, and world activity tracking.
 * 
 * Features:
 * - Agent message subscription with automatic response processing
 * - Tool message subscription with security checks
 * - World message subscription for title generation
 * - World activity listener for chat title updates on idle
 * 
 * Dependencies (Layer 6):
 * - types.ts (Layer 1)
 * - publishers.ts (Layer 3)
 * - persistence.ts, memory-manager.ts (Layer 4)
 * - orchestrator.ts (Layer 5)
 * - utils.ts, logger.ts
 * - storage (runtime)
 * 
 * Changes:
 * - 2026-02-08: Removed legacy manual tool-intervention request handling from message subscription
 * - 2025-11-09: Extracted from events.ts for modular architecture
 */

import type {
  World,
  Agent,
  WorldMessageEvent,
  StorageAPI
} from '../types.js';
import { parseMessageContent } from '../message-prep.js';
import { createCategoryLogger } from '../logger.js';
import { createStorageWithWrappers } from '../storage/storage-factory.js';
import {
  publishEvent,
  subscribeToMessages
} from './publishers.js';
import {
  saveIncomingMessageToMemory,
  resetLLMCallCountIfNeeded,
  generateChatTitleFromMessages
} from './memory-manager.js';
import { processAgentMessage, shouldAgentRespond } from './orchestrator.js';

const loggerAgent = createCategoryLogger('agent');
const loggerChatTitle = createCategoryLogger('chattitle');

// Storage wrapper instance - initialized lazily
let storageWrappers: StorageAPI | null = null;
async function getStorageWrappers(): Promise<StorageAPI> {
  if (!storageWrappers) {
    storageWrappers = await createStorageWithWrappers();
  }
  return storageWrappers!;
}

/**
 * Agent subscription with automatic message processing
 */
export function subscribeAgentToMessages(world: World, agent: Agent): () => void {
  const handler = async (messageEvent: WorldMessageEvent) => {
    loggerAgent.debug('[subscribeAgentToMessages] ENTRY - Agent received message', {
      agentId: agent.id,
      sender: messageEvent.sender,
      messageId: messageEvent.messageId,
      contentPreview: messageEvent.content?.substring(0, 200)
    });

    if (!messageEvent.messageId) {
      loggerAgent.error('Received message WITHOUT messageId', {
        agentId: agent.id,
        sender: messageEvent.sender,
        worldId: world.id
      });
    }

    // Check if this is a tool result message
    // Parse enhanced format first to detect tool messages
    const { message: parsedMessage, targetAgentId } = parseMessageContent(messageEvent.content, 'user');

    loggerAgent.debug('[subscribeAgentToMessages] After parseMessageContent', {
      agentId: agent.id,
      parsedRole: parsedMessage.role,
      targetAgentId,
      toolCallId: parsedMessage.role === 'tool' ? parsedMessage.tool_call_id : undefined,
      isToolMessage: parsedMessage.role === 'tool' && !!parsedMessage.tool_call_id
    });

    // Tool messages are now handled by subscribeAgentToToolMessages (separate handler)
    // This keeps the message handler focused on user/assistant/system messages only
    if (parsedMessage.role === 'tool') {
      loggerAgent.debug('[subscribeAgentToMessages] Skipping tool message - handled by tool handler', {
        agentId: agent.id,
        toolCallId: parsedMessage.tool_call_id
      });
      return;
    }

    // Skip messages from this agent itself
    if (messageEvent.sender === agent.id) {
      loggerAgent.debug('Skipping own message in handler', { agentId: agent.id, sender: messageEvent.sender });
      return;
    }

    // Reset LLM call count if needed (for human/system messages)
    await resetLLMCallCountIfNeeded(world, agent, messageEvent);

    // Process message if agent should respond
    loggerAgent.debug('Checking if agent should respond', { agentId: agent.id, sender: messageEvent.sender });
    const shouldRespond = await shouldAgentRespond(world, agent, messageEvent);

    if (shouldRespond) {
      // Save incoming messages to agent memory only when they plan to respond
      await saveIncomingMessageToMemory(world, agent, messageEvent);

      loggerAgent.debug('Agent will respond - processing message', { agentId: agent.id, sender: messageEvent.sender });
      await processAgentMessage(world, agent, messageEvent);
    } else {
      loggerAgent.debug('Agent will NOT respond - skipping memory save and SSE publishing', {
        agentId: agent.id,
        sender: messageEvent.sender
      });
    }
  };

  return subscribeToMessages(world, handler);
}

/**
 * Subscribe world to messages with cleanup function
 */
export function subscribeWorldToMessages(world: World): () => void {
  return subscribeToMessages(world, async (_event: WorldMessageEvent) => {
    // No-op - title updates handled by setupWorldActivityListener on idle
  });
}

/**
 * Setup world activity listener for chat title updates
 * Triggers title generation when world becomes idle (pendingOperations === 0)
 */
export function setupWorldActivityListener(world: World): () => void {
  const handler = async (event: any) => {
    // Only update title when world becomes idle (all agents done)
    if (event.type === 'idle' && event.pendingOperations === 0) {
      try {
        if (!world.currentChatId) return;
        const chat = world.chats.get(world.currentChatId);
        if (!chat) return;
        // Only update if still default title
        if (chat.name === 'New Chat') {
          const title = await generateChatTitleFromMessages(world, '');
          if (title) {
            chat.name = title;
            const storage = await getStorageWrappers();
            await storage.updateChatData(world.id, world.currentChatId, { name: title });
            publishEvent(world, 'system', `chat-title-updated`);
          }
        }
      } catch (err) {
        loggerChatTitle.warn('Activity-based title update failed', { error: err instanceof Error ? err.message : err });
      }
    }
  };

  world.eventEmitter.on('world', handler);
  return () => world.eventEmitter.off('world', handler);
}

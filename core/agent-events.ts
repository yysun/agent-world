/**
 * Agent Events Module - Agent Message Processing and Subscriptions
 *
 * Features:
 * - Automatic agent subscription to World.eventEmitter messages
 * - Agent message processing logic without existing event dependencies
 * - Message filtering and response logic
 * - Memory auto-sync integration
 * - LLM streaming integration with SSE events
 *
 * Core Functions:
 * - subscribeAgentToMessages: Auto-subscribe agent to world messages
 * - processAgentMessage: Handle agent message processing and LLM calls
 * - shouldAgentRespond: Message filtering logic for agent responses
 *
 * Implementation:
 * - Uses World.eventEmitter for all event operations
 * - Reimplements agent processing logic from scratch
 * - Integrates with new LLM manager for streaming
 * - Supports configurable memory auto-sync
 * - Zero dependencies on existing agent.ts or event systems
 */

import { World, Agent, AgentMessage } from './types.js';
import { subscribeToMessages, publishMessage, publishSSE } from './world-events.js';
import { saveAgentToDisk } from './agent-storage.js';
import { streamAgentResponse } from './llm-manager.js';
import { WorldMessageEvent } from './utils.js';

/**
 * Agent subscription with automatic processing
 */
export function subscribeAgentToMessages(world: World, agent: Agent): () => void {
  const handler = async (messageEvent: WorldMessageEvent) => {
    // Skip messages from this agent itself
    if (messageEvent.sender === agent.id) return;

    // Automatic message processing
    if (shouldAgentRespond(agent, messageEvent)) {
      await processAgentMessage(world, agent, messageEvent);
    }
  };

  return subscribeToMessages(world, handler);
}

/**
 * Agent message processing logic (reimplemented from src/agent.ts)
 */
async function processAgentMessage(
  world: World,
  agent: Agent,
  messageEvent: WorldMessageEvent
): Promise<void> {
  try {
    // Add message to agent memory
    const agentMessage: AgentMessage = {
      role: 'user',
      content: messageEvent.content,
      sender: messageEvent.sender,
      createdAt: messageEvent.timestamp
    };

    agent.memory.push(agentMessage);

    // Call LLM for response
    const response = await streamAgentResponse(world, agent, agent.memory);

    // Add response to memory
    agent.memory.push({
      role: 'assistant',
      content: response,
      createdAt: new Date()
    });

    // Auto-sync memory to file (if enabled)
    if (agent.config.autoSyncMemory !== false) {
      await saveAgentToDisk(world.id, agent);
    }

    // Publish agent response
    publishMessage(world, response, agent.id);

  } catch (error) {
    console.error(`Agent ${agent.id} failed to process message:`, error);
  }
}

/**
 * Message filtering logic
 */
function shouldAgentRespond(agent: Agent, messageEvent: WorldMessageEvent): boolean {
  // Check for direct mentions (@agentName)
  if (messageEvent.content.includes(`@${agent.id}`)) return true;

  // Check for direct messages (implement direct message logic)
  // Add other filtering criteria as needed

  return false; // Default: don't respond unless mentioned
}

/**
 * World State Management - Shared State for World and Agent Operations
 *
 * Features:
 * - Centralized world storage using Map-based structure
 * - Agent subscription tracking for event system integration
 * - Shared state access for world and agent management modules
 * - Clean separation of state from business logic
 * - Agent message subscription management with world-scoped event buses
 * - Per-world event bus isolation preventing cross-world event pollution
 *
 * Core State:
 * - worlds: Map<string, WorldState> - In-memory world storage keyed by world name
 * - agentSubscriptions: Map<string, () => void> - Track agent message subscriptions
 *
 * Usage:
 * - Import worlds Map and agentSubscriptions from other modules
 * - Provides centralized access to shared application state
 * - Enables clean separation between state management and business logic
 * - Each world uses its own isolated event bus for complete event isolation
 */

import { World, Agent, EventType, MessageEventPayload } from './types';
import { subscribeToMessages } from './event-bus';
import { processAgentMessage } from './agent';
import { _clearAllWorldEventBusesForTesting } from './world-event-bus';

// Global world storage - keyed by world name
export const worlds: Map<string, World> = new Map();

// Track agent message subscriptions to prevent double subscription
export const agentSubscriptions: Map<string, () => void> = new Map();

/**
 * Subscribe an agent to message events if not already subscribed
 * Uses the world-specific event bus for complete isolation
 */
export function subscribeAgentToMessages(worldName: string, agent: Agent): void {
  const subscriptionKey = `${worldName}:${agent.id}`;

  // Check if already subscribed
  if (agentSubscriptions.has(subscriptionKey)) {
    return; // Already subscribed, skip
  }

  // Subscribe agent to MESSAGE events from world-specific event bus
  const unsubscribe = subscribeToMessages(async (event) => {
    // Only process MESSAGE events with MessageEventPayload
    if (event.type === EventType.MESSAGE && event.payload && 'content' in event.payload && 'sender' in event.payload) {
      const payload = event.payload as MessageEventPayload;

      // Don't process messages from this agent itself
      if (payload.sender !== agent.id) {
        try {
          // Ensure agent config has name field
          const agentConfigWithName = {
            ...agent.config,
            name: agent.id
          };
          await processAgentMessage(agentConfigWithName, {
            name: 'message',
            id: event.id,
            content: payload.content,
            sender: payload.sender,
            payload: payload
          }, undefined, worldName);

        } catch (error) {
          console.error(`Agent ${agent.id} failed to process message:`, error);
        }
      }
    }
  }, undefined, worldName); // Pass worldName to subscribe to world-specific event bus

  // Store the unsubscribe function
  agentSubscriptions.set(subscriptionKey, unsubscribe);
}

/**
 * Unsubscribe an agent from message events
 */
export function unsubscribeAgentFromMessages(worldName: string, agentName: string): void {
  const subscriptionKey = `${worldName}:${agentName}`;
  const unsubscribe = agentSubscriptions.get(subscriptionKey);

  if (unsubscribe) {
    unsubscribe();
    agentSubscriptions.delete(subscriptionKey);
  }
}

/**
 * Test helper: Clear all worlds and subscriptions (for testing only)
 * @internal
 */
export function _clearAllWorldsForTesting(): void {
  // Clean up all subscriptions
  for (const unsubscribe of agentSubscriptions.values()) {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }
  agentSubscriptions.clear();

  worlds.clear();

  // Clear all world event buses
  _clearAllWorldEventBusesForTesting();
}

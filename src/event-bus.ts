/**
 * Event Bus - Simplified Function-Based Event System
 * 
 * Features:
 * - Function-based API replacing class-based EventManager
 * - 3 event types: MESSAGE, WORLD, SSE with dedicated topics
 * - Provider pattern for local (EventEmitter) vs future Dapr modes
 * - Maintains all EventManager functionality with simpler API
 * - Topic-based publishing: messages, world, sse
 * - Agent-specific event routing and filtering
 * - Event history and statistics tracking
 * - Structured logging with pino
 * - Strict typing for event payloads with TypeScript interfaces
 * 
 * Recent Changes:
 * - Updated event publishing functions to use flat payload structure
 * - Added support for MessageEventPayload, SystemEventPayload, and SSEEventPayload types
 * - Refactored publishMessage to use HUMAN as default sender
 * - Removed nested payload.payload structure from all event publishing
 * - Updated event filtering and routing logic for new payload format
 * 
 * Logic:
 * - Uses provider pattern to abstract local vs distributed event handling
 * - Local provider uses EventEmitter (current behavior)
 * - Dapr provider ready for future distributed events
 * - Topic naming: messages, world, sse (maps to dapr-world-* in Dapr mode)
 * - All functions are async for consistency with future Dapr integration
 * - Maintains backward compatibility through simple function API
 * 
 * Changes:
 * - Created as simplified replacement for EventManager class
 * - Function-based API instead of class methods
 * - Provider abstraction for easy Dapr migration
 * - Topic-specific helper functions for common operations
 * - Maintains all existing functionality in simpler form
 */

import { Event, EventType, MessageEventPayload, SystemEventPayload, SSEEventPayload } from './types';
import {
  EventBusProvider,
  EventFilter,
  EventStats,
  LocalProviderOptions,
  createLocalProvider
} from './providers/local-provider';
import {
  DaprProviderOptions,
  createDaprProvider
} from './providers/dapr-provider';

// Event bus configuration
export interface EventBusConfig {
  provider: 'local' | 'dapr';
  maxEventHistory?: number;
  enableLogging?: boolean;
  daprHost?: string;
  daprPort?: number;
  pubsubName?: string;
}

// Global event bus instance
let eventBusProvider: EventBusProvider;
let eventBusConfig: EventBusConfig;

// Topic constants
export const TOPICS = {
  MESSAGES: 'messages',
  WORLD: 'world',
  SSE: 'sse'
} as const;

/**
 * Initialize the event bus with configuration
 */
export function initializeEventBus(config: EventBusConfig = { provider: 'local' }): void {
  eventBusConfig = config;

  if (config.provider === 'dapr') {
    eventBusProvider = createDaprProvider({
      daprHost: config.daprHost,
      daprPort: config.daprPort,
      pubsubName: config.pubsubName,
      enableLogging: config.enableLogging
    });
  } else {
    eventBusProvider = createLocalProvider({
      maxEventHistory: config.maxEventHistory,
      enableLogging: config.enableLogging
    });
  }
}

/**
 * Get the current event bus provider (initialize if needed)
 */
function getProvider(): EventBusProvider {
  if (!eventBusProvider) {
    initializeEventBus();
  }
  return eventBusProvider;
}

/**
 * Core event publishing function
 */
export async function publishEvent(topic: string, eventData: Omit<Event, 'id' | 'timestamp'>): Promise<Event> {
  return getProvider().publish(topic, eventData);
}

/**
 * Subscribe to events on a specific topic
 */
export function subscribeToTopic(
  topic: string,
  handler: (event: Event) => void,
  filter?: EventFilter
): () => void {
  const provider = getProvider();

  if (!filter) {
    return provider.subscribe(topic, handler);
  }

  // Apply client-side filtering
  const filteredHandler = (event: Event) => {
    if (matchesFilter(event, filter)) {
      handler(event);
    }
  };

  return provider.subscribe(topic, filteredHandler);
}

/**
 * Subscribe to events for a specific agent
 */
export function subscribeToAgent(agentId: string, handler: (event: Event) => void): () => void {
  return getProvider().subscribeToAgent(agentId, handler);
}

/**
 * Get event history with optional filtering
 */
export function getEventHistory(filter?: EventFilter): Event[] {
  return getProvider().getHistory(filter);
}

/**
 * Get event statistics
 */
export function getEventStats(): EventStats {
  return getProvider().getStats();
}

/**
 * Clear event history
 */
export function clearEventHistory(): void {
  getProvider().clearHistory();
}

/**
 * Topic-specific helper functions
 */

// MESSAGE events - structured message objects
export async function publishMessageEvent(payload: MessageEventPayload): Promise<Event> {
  return publishEvent(TOPICS.MESSAGES, {
    type: EventType.MESSAGE,
    payload: payload
  });
}

// WORLD events - system events, agent lifecycle, etc.
export async function publishWorldEvent(payload: SystemEventPayload): Promise<Event> {
  return publishEvent(TOPICS.WORLD, {
    type: EventType.WORLD,
    payload
  });
}

// SSE events - streaming data for real-time updates
export async function publishSSE(payload: SSEEventPayload): Promise<Event> {
  return publishEvent(TOPICS.SSE, {
    type: EventType.SSE,
    payload
  });
}

/**
 * Topic-specific subscription helpers
 */

// Subscribe to MESSAGE events
export function subscribeToMessages(
  handler: (event: Event) => void,
  filter?: EventFilter
): () => void {
  return subscribeToTopic(TOPICS.MESSAGES, handler, filter);
}

// Subscribe to WORLD events  
export function subscribeToWorld(
  handler: (event: Event) => void,
  filter?: EventFilter
): () => void {
  return subscribeToTopic(TOPICS.WORLD, handler, filter);
}

// Subscribe to SSE events
export function subscribeToSSE(
  handler: (event: Event) => void,
  filter?: EventFilter
): () => void {
  return subscribeToTopic(TOPICS.SSE, handler, filter);
}

/**
 * Subscribe to all events (for backward compatibility)
 */
export function subscribeToAll(handler: (event: Event) => void): () => void {
  const provider = getProvider();
  const unsubscribers = [
    provider.subscribe(TOPICS.MESSAGES, handler),
    provider.subscribe(TOPICS.WORLD, handler),
    provider.subscribe(TOPICS.SSE, handler)
  ];

  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}

/**
 * Helper function to check if event matches filter criteria
 */
function matchesFilter(event: Event, filter: EventFilter): boolean {
  // Check type filter
  if (filter.types && !filter.types.includes(event.type)) {
    return false;
  }

  // Check agent filter - check for agentId or sender in payload
  if (filter.agentId) {
    const payload = event.payload;
    let hasMatchingAgent = false;

    if ('agentId' in payload && payload.agentId === filter.agentId) {
      hasMatchingAgent = true;
    }
    if ('sender' in payload && payload.sender === filter.agentId) {
      hasMatchingAgent = true;
    }

    if (!hasMatchingAgent) {
      return false;
    }
  }

  // Check time filter
  if (filter.since) {
    const eventTime = new Date(event.timestamp).getTime();
    const sinceTime = filter.since.getTime();
    if (eventTime < sinceTime) {
      return false;
    }
  }

  return true;
}

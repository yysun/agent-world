/**
 * Event Bus - World-Scoped Event System
 * 
 * Features:
 * - Per-world event bus isolation for complete event scoping
 * - Function-based API with world context support
 * - 3 event types: MESSAGE, WORLD, SSE with dedicated topics
 * - Provider pattern for local (EventEmitter) vs future Dapr modes
 * - Backward compatibility for functions without world context
 * - Topic-based publishing: messages, world, sse
 * - Agent-specific event routing and filtering within worlds
 * - Event history and statistics tracking per world
 * - Structured logging with pino
 * - Strict typing for event payloads with TypeScript interfaces
 * 
 * Architecture Changes:
 * - Each world has its own isolated event bus instance
 * - Events are scoped to specific worlds, preventing cross-world pollution
 * - World context required for most operations (with fallbacks for compatibility)
 * - Automatic event bus creation for worlds when needed
 * - Resource cleanup when worlds are destroyed
 * 
 * Recent Changes:
 * - Added world-scoped event bus support via WorldEventBusManager
 * - Updated all functions to accept optional worldName parameter
 * - Maintained backward compatibility for global event bus usage
 * - Added automatic world event bus creation and management
 * - Updated event filtering and routing for world-specific contexts
 * 
 * Logic:
 * - Uses WorldEventBusManager to route operations to correct world event bus
 * - Falls back to global event bus for backward compatibility when no world specified
 * - Topic naming remains the same but scoped per world
 * - All functions are async for consistency with future Dapr integration
 * - Maintains all existing functionality in world-scoped form
 * 
 * Migration:
 * - Functions now accept optional worldName parameter
 * - When worldName provided, operations are scoped to that world
 * - When worldName not provided, falls back to global behavior (deprecated)
 * - Existing code continues to work but should be migrated to world-scoped usage
 */

import { Event, EventType, MessageEventPayload, SystemEventPayload, SSEEventPayload, SenderType } from './types';
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
import {
  createWorldEventBus,
  getWorldEventBusOrNull,
  getWorldEventBus,
  destroyWorldEventBus,
  WorldEventBusConfig
} from './world-event-bus';

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
  SSE: 'sse',
  SYSTEM: 'system'
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
 * Get the event bus provider for a specific world or fall back to global
 */
function getProvider(worldName?: string): EventBusProvider {
  if (worldName) {
    // Try to get world-specific event bus
    let worldProvider = getWorldEventBusOrNull(worldName);
    if (!worldProvider) {
      // Create world event bus if it doesn't exist
      worldProvider = createWorldEventBus(worldName, { provider: 'local', enableLogging: true });
    }
    return worldProvider;
  }

  // Fall back to global event bus for backward compatibility
  if (!eventBusProvider) {
    initializeEventBus();
  }
  return eventBusProvider;
}

/**
 * Core event publishing function with world context
 */
export async function publishEvent(topic: string, eventData: Omit<Event, 'id' | 'timestamp'>, worldName?: string): Promise<Event> {
  return getProvider(worldName).publish(topic, eventData);
}

/**
 * Subscribe to events on a specific topic with world context
 */
export function subscribeToTopic(
  topic: string,
  handler: (event: Event) => void,
  filter?: EventFilter,
  worldName?: string
): () => void {
  const provider = getProvider(worldName);

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
 * Subscribe to events for a specific agent with world context
 */
export function subscribeToAgent(agentName: string, handler: (event: Event) => void, worldName?: string): () => void {
  return getProvider(worldName).subscribeToAgent(agentName, handler);
}

/**
 * Get event history with optional filtering and world context
 */
export function getEventHistory(filter?: EventFilter, worldName?: string): Event[] {
  return getProvider(worldName).getHistory(filter);
}

/**
 * Get event statistics for a specific world
 */
export function getEventStats(worldName?: string): EventStats {
  return getProvider(worldName).getStats();
}

/**
 * Clear event history for a specific world
 */
export function clearEventHistory(worldName?: string): void {
  getProvider(worldName).clearHistory();
}

/**
 * Determine sender type based on sender name
 */
function determineSenderType(sender: string): SenderType {
  if (sender === 'HUMAN' || sender === 'human' || sender === 'user') {
    return SenderType.HUMAN;
  }
  if (sender === 'system' || sender === 'world') {
    return SenderType.WORLD;
  }
  return SenderType.AGENT;
}

/**
 * Topic-specific helper functions
 */

// MESSAGE events - structured message objects
export async function publishMessageEvent(payload: MessageEventPayload, sender?: string, worldName?: string): Promise<Event> {
  // Validate payload to prevent ZodError
  if (!payload || typeof payload.content !== 'string' || typeof payload.sender !== 'string') {
    throw new Error(`Invalid MessageEventPayload: content and sender must be strings`);
  }

  return publishEvent(TOPICS.MESSAGES, {
    type: EventType.MESSAGE,
    sender: sender || payload.sender,
    senderType: determineSenderType(sender || payload.sender),
    payload: payload
  }, worldName);
}

// WORLD events - system events, agent lifecycle, etc.
export async function publishWorldEvent(payload: SystemEventPayload, sender?: string, worldName?: string): Promise<Event> {
  const senderName = sender || payload.agentName || 'world';
  return publishEvent(TOPICS.WORLD, {
    type: EventType.WORLD,
    sender: senderName,
    senderType: determineSenderType(senderName),
    payload
  }, worldName);
}

// SSE events - streaming data for real-time updates
export async function publishSSE(payload: SSEEventPayload, sender?: string, worldName?: string): Promise<Event> {
  // Validate payload to prevent ZodError
  if (!payload || typeof payload.agentName !== 'string' || !['start', 'chunk', 'end', 'error'].includes(payload.type)) {
    throw new Error(`Invalid SSEEventPayload: agentName must be string and type must be start|chunk|end|error`);
  }

  const senderName = sender || payload.agentName || 'world';
  return publishEvent(TOPICS.SSE, {
    type: EventType.SSE,
    sender: senderName,
    senderType: determineSenderType(senderName),
    payload
  }, worldName);
}

// System events - debug and logging information
export async function publishSystemEvent(payload: SystemEventPayload, sender?: string, worldName?: string): Promise<Event> {
  // Validate payload to prevent ZodError
  if (!payload || typeof payload.action !== 'string') {
    throw new Error(`Invalid SystemEventPayload: action must be a string`);
  }

  const senderName = sender || payload.agentName || 'system';
  return publishEvent(TOPICS.SYSTEM, {
    type: EventType.SYSTEM,
    sender: senderName,
    senderType: determineSenderType(senderName),
    payload
  }, worldName);
}

// Helper function for debug events
export async function publishDebugEvent(content: string, context?: { [key: string]: any }, worldName?: string): Promise<Event> {
  const agentName = context?.agentName;
  return publishSystemEvent({
    action: 'debug',
    content,
    timestamp: new Date().toISOString(),
    ...context
  }, agentName || 'system', worldName);
}

/**
 * Topic-specific subscription helpers
 */

// Subscribe to MESSAGE events
export function subscribeToMessages(
  handler: (event: Event) => void,
  filter?: EventFilter,
  worldName?: string
): () => void {
  return subscribeToTopic(TOPICS.MESSAGES, handler, filter, worldName);
}

// Subscribe to WORLD events  
export function subscribeToWorld(
  handler: (event: Event) => void,
  filter?: EventFilter,
  worldName?: string
): () => void {
  return subscribeToTopic(TOPICS.WORLD, handler, filter, worldName);
}

// Subscribe to SSE events
export function subscribeToSSE(
  handler: (event: Event) => void,
  filter?: EventFilter,
  worldName?: string
): () => void {
  return subscribeToTopic(TOPICS.SSE, handler, filter, worldName);
}

// Subscribe to SYSTEM events
export function subscribeToSystem(
  handler: (event: Event) => void,
  filter?: EventFilter,
  worldName?: string
): () => void {
  return subscribeToTopic(TOPICS.SYSTEM, handler, filter, worldName);
}

/**
 * Subscribe to all events (for backward compatibility) with world context
 */
export function subscribeToAll(handler: (event: Event) => void, worldName?: string): () => void {
  const provider = getProvider(worldName);
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

/**
 * World Event Bus Management Functions
 */

/**
 * Create event bus for a world with specific configuration
 */
export function createEventBusForWorld(worldName: string, config?: WorldEventBusConfig): void {
  createWorldEventBus(worldName, config);
}

/**
 * Destroy event bus for a world and clean up resources
 */
export function destroyEventBusForWorld(worldName: string): boolean {
  return destroyWorldEventBus(worldName);
}

/**
 * Check if a world has an event bus
 */
export function hasEventBusForWorld(worldName: string): boolean {
  return getWorldEventBusOrNull(worldName) !== null;
}

/*
 * Local Event Bus Provider - Function-Based EventEmitter Implementation
 * 
 * Features:
 * - Function-based EventEmitter local event handling (current behavior)
 * - Event history management with configurable limits
 * - Event statistics tracking by type
 * - Agent-specific event routing and filtering
 * - Structured event validation using Zod schemas
 * - Pino-based structured logging
 * 
 * Logic:
 * - Function-based provider for local mode (no classes)
 * - Uses Node.js EventEmitter for in-memory event handling
 * - Maintains event history with size limits
 * - Tracks statistics per event type
 * - Provides agent-specific event routing
 * - Validates all events using shared Zod schemas
 * 
 * Changes:
 * - Converted from class-based to function-based provider
 * - Maintains all existing EventManager functionality
 * - Designed for easy swapping with future Dapr provider
 * - Consistent with overall function-based event bus architecture
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Event, EventSchema, EventType } from '../types';
import { worldLogger } from '../logger';

export interface EventBusProvider {
  publish(topic: string, event: Omit<Event, 'id' | 'timestamp'>): Promise<Event>;
  subscribe(topic: string, handler: (event: Event) => void): () => void;
  subscribeToAgent(agentId: string, handler: (event: Event) => void): () => void;
  getHistory(filter?: EventFilter): Event[];
  getStats(): EventStats;
  clearHistory(): void;
}

export interface EventFilter {
  types?: EventType[];
  agentId?: string;
  since?: Date;
  limit?: number;
}

export interface EventStats {
  totalEvents: number;
  eventsByType: Record<EventType, number>;
  historySize: number;
  activeSubscriptions: number;
}

export interface LocalProviderOptions {
  maxEventHistory?: number;
  enableLogging?: boolean;
}

// Provider state (isolated per provider instance)
interface LocalProviderState {
  emitter: EventEmitter;
  eventHistory: Event[];
  eventStats: {
    totalEvents: number;
    eventsByType: Record<EventType, number>;
  };
  options: Required<LocalProviderOptions>;
}

const providerInstances = new Map<string, LocalProviderState>();
let defaultProviderId = 'default';

/**
 * Initialize the local event provider
 */
export function initializeLocalProvider(providerOptions: LocalProviderOptions = {}, providerId: string = 'default'): void {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0); // Unlimited listeners

  const options = {
    maxEventHistory: providerOptions.maxEventHistory ?? 5000,
    enableLogging: providerOptions.enableLogging ?? true
  };

  const eventStats = {
    totalEvents: 0,
    eventsByType: {} as Record<EventType, number>
  };

  // Initialize event type counters
  Object.values(EventType).forEach(type => {
    eventStats.eventsByType[type] = 0;
  });

  providerInstances.set(providerId, {
    emitter,
    eventHistory: [],
    eventStats,
    options
  });

  defaultProviderId = providerId;
}

/**
 * Get provider instance
 */
function getProviderInstance(providerId: string = defaultProviderId): LocalProviderState {
  let instance = providerInstances.get(providerId);
  if (!instance) {
    initializeLocalProvider({}, providerId);
    instance = providerInstances.get(providerId)!;
  }
  return instance;
}

/**
 * Publish an event to a topic
 */
export async function publishToLocal(topic: string, eventData: Omit<Event, 'id' | 'timestamp'>, providerId?: string): Promise<Event> {
  const instance = getProviderInstance(providerId);

  try {
    // Create full event with ID and timestamp
    const event: Event = {
      ...eventData,
      id: uuidv4(),
      timestamp: new Date().toISOString()
    };

    // Validate event using Zod schema
    const validatedEvent = EventSchema.parse(event);

    // Add to history
    addToHistory(validatedEvent, instance);

    // Update statistics
    instance.eventStats.totalEvents++;
    instance.eventStats.eventsByType[validatedEvent.type]++;

    // Emit events
    instance.emitter.emit(`topic:${topic}`, validatedEvent);
    instance.emitter.emit('event', validatedEvent);

    // Emit agent-specific events if agentId is present in payload
    const agentId = validatedEvent.payload?.agentId;
    if (agentId) {
      instance.emitter.emit(`agent:${agentId}`, validatedEvent);
    }

    return validatedEvent;

  } catch (error) {
    if (instance.options.enableLogging) {
      worldLogger.error({ error, eventData, topic }, 'Failed to publish event');
    }
    throw error;
  }
}

/**
 * Subscribe to events on a topic
 */
export function subscribeToLocal(topic: string, handler: (event: Event) => void, providerId?: string): () => void {
  const instance = getProviderInstance(providerId);

  const eventName = `topic:${topic}`;
  instance.emitter.on(eventName, handler);

  return () => {
    instance.emitter.off(eventName, handler);
  };
}

/**
 * Subscribe to events for a specific agent
 */
export function subscribeToLocalAgent(agentId: string, handler: (event: Event) => void, providerId?: string): () => void {
  const instance = getProviderInstance(providerId);

  const eventName = `agent:${agentId}`;
  instance.emitter.on(eventName, handler);

  return () => {
    instance.emitter.off(eventName, handler);
  };
}

/**
 * Get event history with optional filtering
 */
export function getLocalHistory(filter?: EventFilter, providerId?: string): Event[] {
  const instance = getProviderInstance(providerId);
  let events = [...instance.eventHistory];

  if (filter) {
    // Apply type filter
    if (filter.types) {
      events = events.filter(event => filter.types!.includes(event.type));
    }

    // Apply agent filter - only check payload
    if (filter.agentId) {
      events = events.filter(event => event.payload.agentId === filter.agentId);
    }

    // Apply time filter
    if (filter.since) {
      const sinceTime = filter.since.getTime();
      events = events.filter(event => new Date(event.timestamp).getTime() >= sinceTime);
    }

    // Apply limit
    if (filter.limit) {
      events = events.slice(-filter.limit);
    }
  }

  return events;
}

/**
 * Get event statistics
 */
export function getLocalStats(providerId?: string): EventStats {
  const instance = getProviderInstance(providerId);
  return {
    ...instance.eventStats,
    historySize: instance.eventHistory.length,
    activeSubscriptions: instance.emitter.listenerCount('event')
  };
}

/**
 * Clear event history
 */
export function clearLocalHistory(providerId?: string): void {
  const instance = getProviderInstance(providerId);
  instance.eventHistory = [];
  if (instance.options.enableLogging) {
    worldLogger.info('Event history cleared');
  }
}

/**
 * Create a local provider instance (for compatibility with provider pattern)
 */
export function createLocalProvider(providerOptions: LocalProviderOptions = {}): EventBusProvider {
  const providerId = `provider-${Date.now()}-${Math.random()}`;
  initializeLocalProvider(providerOptions, providerId);

  return {
    publish: (topic: string, eventData: Omit<Event, 'id' | 'timestamp'>) => publishToLocal(topic, eventData, providerId),
    subscribe: (topic: string, handler: (event: Event) => void) => subscribeToLocal(topic, handler, providerId),
    subscribeToAgent: (agentId: string, handler: (event: Event) => void) => subscribeToLocalAgent(agentId, handler, providerId),
    getHistory: (filter?: EventFilter) => getLocalHistory(filter, providerId),
    getStats: () => getLocalStats(providerId),
    clearHistory: () => clearLocalHistory(providerId)
  };
}

/**
 * Add event to history with size management
 */
function addToHistory(event: Event, instance: LocalProviderState): void {
  instance.eventHistory.push(event);

  // Maintain history size limit
  if (instance.eventHistory.length > instance.options.maxEventHistory) {
    instance.eventHistory = instance.eventHistory.slice(-instance.options.maxEventHistory);
  }
}

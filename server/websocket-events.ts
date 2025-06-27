/**
 * WebSocket Events - Event Bus Integration and Message Mapping
 *
 * Features:
 * - Map event bus events to WebSocket messages
 * - Handle real-time event streaming to clients
 * - Filter events by world and client subscriptions
 * - Provide event transformation and formatting
 * - Support selective event broadcasting
 *
 * Event Flow:
 * 1. Event bus emits event -> Event mapper processes
 * 2. Mapper filters by world and client subscriptions
 * 3. Mapper transforms event to WebSocket message format
 * 4. Message sent to relevant WebSocket clients
 *
 * Core Functions:
 * - mapEventToWebSocket: Transform event bus event to WebSocket message
 * - broadcastEventToWorld: Send event to all clients in world
 * - subscribeClientToEvents: Set up client event subscription
 * - filterEventForClient: Check if client should receive event
 *
 * Implementation:
 * - Integrates with existing event bus system
 * - Provides efficient event filtering and routing
 * - Supports per-client event subscriptions
 * - Handles event transformation and formatting
 * - Manages subscription lifecycle
 */

import {
  Event,
  EventType,
  SSEEventPayload,
  MessageEventPayload,
  SystemEventPayload,
  SenderType
} from '../src/types';
import {
  WebSocketMessage,
  ServerMessageType,
  EventStreamPayload,
  ChatResponsePayload,
  ClientConnection
} from './websocket-types';
import {
  getWorldConnections,
  sendToConnection,
  addSubscription
} from './websocket-manager';
import { subscribeToWorld } from '../src/event-bus';
import { v4 as uuidv4 } from 'uuid';

/**
 * Map event bus event to WebSocket message
 */
export function mapEventToWebSocket(
  event: Event,
  worldName: string
): WebSocketMessage | null {
  try {
    switch (event.type) {
      case EventType.SSE:
        return createChatResponseMessage(event, worldName);

      case EventType.MESSAGE:
        return createEventStreamMessage(event, worldName);

      case EventType.WORLD:
      case EventType.SYSTEM:
        return createSystemMessage(event, worldName);

      default:
        // Unknown event type, create generic event stream message
        return createEventStreamMessage(event, worldName);
    }
  } catch (error) {
    console.error('Error mapping event to WebSocket message:', error);
    return null;
  }
}

/**
 * Create chat response message from SSE event
 */
function createChatResponseMessage(event: Event, worldName: string): WebSocketMessage {
  const payload = event.payload as SSEEventPayload;

  const chatResponse: ChatResponsePayload = {
    worldName,
    agentName: payload.agentName,
    content: payload.content || '',
    messageId: payload.messageId || event.id,
    complete: payload.type === 'end'
  };

  return {
    id: uuidv4(),
    type: ServerMessageType.CHAT_RESPONSE,
    timestamp: event.timestamp,
    payload: chatResponse
  };
}

/**
 * Create event stream message from any event
 */
function createEventStreamMessage(event: Event, worldName: string): WebSocketMessage {
  const eventStream: EventStreamPayload = {
    worldName,
    event,
    eventType: event.type
  };

  return {
    id: uuidv4(),
    type: ServerMessageType.EVENT_STREAM,
    timestamp: event.timestamp,
    payload: eventStream
  };
}

/**
 * Create system message from world/system event
 */
function createSystemMessage(event: Event, worldName: string): WebSocketMessage {
  return createEventStreamMessage(event, worldName);
}

/**
 * Broadcast event to all clients in a world
 */
export function broadcastEventToWorld(
  worldName: string,
  event: Event,
  filter?: (connection: ClientConnection) => boolean
): number {
  const worldConnections = getWorldConnections(worldName);
  let sentCount = 0;

  for (const connection of worldConnections) {
    // Apply optional filter
    if (filter && !filter(connection)) {
      continue;
    }

    // Map event to WebSocket message
    const message = mapEventToWebSocket(event, worldName);
    if (!message) {
      continue;
    }

    // Send to connection
    if (sendToConnection(connection.clientId, message)) {
      sentCount++;
    }
  }

  return sentCount;
}

/**
 * Subscribe client to world events with filtering
 */
export function subscribeClientToEvents(
  clientId: string,
  worldName: string,
  options: {
    eventTypes?: EventType[];
    agentFilter?: string;
    messageFilter?: (event: Event) => boolean;
  } = {}
): () => void {
  const { eventTypes, agentFilter, messageFilter } = options;

  // Subscribe to world events
  const unsubscribe = subscribeToWorld((event) => {
    try {
      // Check if client should receive this event
      if (!shouldClientReceiveEvent(event, worldName, { eventTypes, agentFilter, messageFilter })) {
        return;
      }

      // Map and send event
      const message = mapEventToWebSocket(event, worldName);
      if (message) {
        sendToConnection(clientId, message);
      }
    } catch (error) {
      console.error(`Error sending event to client ${clientId}:`, error);
    }
  });

  // Add subscription to connection for cleanup
  addSubscription(clientId, unsubscribe);

  return unsubscribe;
}

/**
 * Check if client should receive event based on filters
 */
function shouldClientReceiveEvent(
  event: Event,
  worldName: string,
  filters: {
    eventTypes?: EventType[];
    agentFilter?: string;
    messageFilter?: (event: Event) => boolean;
  }
): boolean {
  const { eventTypes, agentFilter, messageFilter } = filters;

  // Filter by event types
  if (eventTypes && eventTypes.length > 0 && !eventTypes.includes(event.type)) {
    return false;
  }

  // Filter by agent (check payload for agent information)
  if (agentFilter) {
    const payload = event.payload as any;
    if (payload.agentName && payload.agentName !== agentFilter) {
      return false;
    }
  }

  // Apply custom message filter
  if (messageFilter && !messageFilter(event)) {
    return false;
  }

  return true;
}

/**
 * Create event subscription for multiple clients
 */
export function subscribeClientsToEvents(
  clientIds: string[],
  worldName: string,
  options: {
    eventTypes?: EventType[];
    agentFilter?: string;
    messageFilter?: (event: Event) => boolean;
  } = {}
): () => void {
  const unsubscribeFunctions = clientIds.map(clientId =>
    subscribeClientToEvents(clientId, worldName, options)
  );

  // Return function to unsubscribe all
  return () => {
    unsubscribeFunctions.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        console.error('Error unsubscribing client:', error);
      }
    });
  };
}

/**
 * Broadcast system message to world
 */
export function broadcastSystemMessage(
  worldName: string,
  action: string,
  content?: string,
  metadata?: Record<string, any>
): number {
  const systemEvent: Event = {
    id: uuidv4(),
    type: EventType.SYSTEM,
    timestamp: new Date().toISOString(),
    sender: 'SYSTEM',
    senderType: SenderType.WORLD,
    payload: {
      action,
      worldName,
      content,
      timestamp: new Date().toISOString(),
      ...metadata
    } as SystemEventPayload
  };

  return broadcastEventToWorld(worldName, systemEvent);
}

/**
 * Send custom event to specific client
 */
export function sendCustomEventToClient(
  clientId: string,
  worldName: string,
  eventType: string,
  payload: any
): boolean {
  const message: WebSocketMessage = {
    id: uuidv4(),
    type: ServerMessageType.EVENT_STREAM,
    timestamp: new Date().toISOString(),
    payload: {
      worldName,
      event: {
        id: uuidv4(),
        type: eventType as EventType,
        timestamp: new Date().toISOString(),
        sender: 'SYSTEM',
        senderType: SenderType.WORLD,
        payload
      },
      eventType
    } as EventStreamPayload
  };

  return sendToConnection(clientId, message);
}

/**
 * Get event statistics for a world
 */
export interface EventStats {
  worldName: string;
  totalEvents: number;
  eventsByType: Record<string, number>;
  clientCount: number;
  subscriptionCount: number;
}

// Simple in-memory event counting (for basic statistics)
const eventCounts = new Map<string, Map<string, number>>();

/**
 * Track event for statistics
 */
export function trackEvent(worldName: string, eventType: string): void {
  if (!eventCounts.has(worldName)) {
    eventCounts.set(worldName, new Map());
  }

  const worldCounts = eventCounts.get(worldName)!;
  const currentCount = worldCounts.get(eventType) || 0;
  worldCounts.set(eventType, currentCount + 1);
}

/**
 * Get event statistics for a world
 */
export function getEventStats(worldName: string): EventStats {
  const worldCounts = eventCounts.get(worldName) || new Map();
  const eventsByType: Record<string, number> = {};
  let totalEvents = 0;

  for (const [eventType, count] of worldCounts) {
    eventsByType[eventType] = count;
    totalEvents += count;
  }

  const worldConnections = getWorldConnections(worldName);
  const clientCount = worldConnections.length;
  const subscriptionCount = worldConnections.reduce(
    (total, conn) => total + conn.subscriptions.length,
    0
  );

  return {
    worldName,
    totalEvents,
    eventsByType,
    clientCount,
    subscriptionCount
  };
}

/**
 * Clear event statistics (for testing)
 * @internal
 */
export function _clearEventStatsForTesting(): void {
  eventCounts.clear();
}

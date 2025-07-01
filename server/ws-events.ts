/**
 * Event Handling Module for Agent World
 *
 * Features:
 * - World subscription lifecycle management with automatic cleanup
 * - Event listener setup and teardown for world objects
 * - Message event handling with command routing and world publishing
 * - World refresh logic after command execution
 * - Generic event forwarding from world events to clients
 * - Message validation and error handling
 * - Sender normalization for user messages
 *
 * Event Types Handled:
 * - subscribe: Create world subscription with event listeners
 * - unsubscribe: Clean up world subscription and listeners
 * - event: Handle commands or publish messages to world
 * - system: Execute commands only (requires '/' prefix)
 * - world: Execute commands only (requires '/' prefix)
 * - message: Execute commands if starts with '/', otherwise publish message to world
 *
 * Implementation:
 * - Uses generic ClientConnection interface for transport-agnostic event handling
 * - Implements comprehensive cleanup to prevent memory leaks
 * - Forwards all world events with eventType field added for client identification
 * - Filters out user message echoes to prevent feedback loops
 * - Supports automatic world refresh after add/update operations
 */

import { z } from 'zod';
import { World } from '../core/types.js';
import { getWorld } from '../core/world-manager.js';
import { publishMessage } from '../core/world-events.js';
import { toKebabCase } from '../core/utils.js';
import { executeCommand } from './commands/index.js';

const ROOT_PATH = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

// Generic client connection interface for transport-agnostic event handling
export interface ClientConnection {
  send: (data: string) => void;
  isOpen: boolean;
  world?: World;
  worldEventListeners?: Map<string, (...args: any[]) => void>;
}

// Zod validation schema for messages
export const MessageSchema = z.object({
  type: z.enum(["event", "subscribe", "unsubscribe", "system", "world", "message"]),
  payload: z.object({
    worldName: z.string().optional(),
    message: z.string().optional(),
    sender: z.string().optional()
  })
});

// Helper function to add root path to commands that need it
export function prepareCommandWithRootPath(message: string): string {
  const commandLine = message.slice(1).trim(); // Remove leading '/'
  if (!commandLine) return message;

  const parts = commandLine.split(/\s+/);
  const commandName = parts[0].toLowerCase();

  // Commands that require root path as first argument
  const commandsRequiringRootPath = ['getworlds', 'addworld', 'updateworld'];

  if (commandsRequiringRootPath.includes(commandName)) {
    // Insert ROOT_PATH as first argument
    const args = parts.slice(1);
    return `/${commandName} ${ROOT_PATH} ${args.join(' ')}`.trim();
  }

  return message;
}

// Clean up world subscription and event listeners
export async function cleanupWorldSubscription(client: ClientConnection): Promise<void> {
  if (client.world && client.worldEventListeners) {
    // Remove all event listeners
    for (const [eventName, listener] of client.worldEventListeners) {
      client.world.eventEmitter.off(eventName, listener);
    }
    client.worldEventListeners.clear();
  }

  // Clear world reference
  client.world = undefined;
  client.worldEventListeners = undefined;
}

// Set up event listeners for world events
export function setupWorldEventListeners(client: ClientConnection, world: World): void {
  if (!client.worldEventListeners) {
    client.worldEventListeners = new Map();
  }

  // Generic handler that forwards events to client with filtering
  const handler = (eventType: string) => (eventData: any) => {
    // Skip echoing user messages back to client
    // Only forward agent responses, system messages, and SSE events
    if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender.startsWith('user'))) {
      return;
    }

    if (client.isOpen) {
      // Add the event type to the payload so client knows what kind of event this is
      client.send(JSON.stringify({
        ...eventData,
        eventType
      }));
    }
  };

  // List of event types to forward
  const eventTypes = ['system', 'world', 'message', 'sse'];

  // Set up listeners for all event types
  for (const eventType of eventTypes) {
    const eventHandler = handler(eventType);
    world.eventEmitter.on(eventType, eventHandler);
    client.worldEventListeners.set(eventType, eventHandler);
  }
}

// Refresh world subscription after command execution
async function refreshWorldSubscription(client: ClientConnection, worldName: string): Promise<void> {
  try {
    const worldId = toKebabCase(worldName);
    const refreshedWorld = await getWorld(ROOT_PATH, worldId);
    if (refreshedWorld) {
      // Clean up existing world subscription
      await cleanupWorldSubscription(client);

      // Attach refreshed world
      client.world = refreshedWorld;
      client.worldEventListeners = new Map();

      // Set up event listeners
      setupWorldEventListeners(client, refreshedWorld);

      client.send(JSON.stringify({
        type: 'subscribed',
        worldName,
        timestamp: new Date().toISOString()
      }));
    }
  } catch (error) {
    console.error('Failed to refresh world:', error);
  }
}

// Handle subscribe event
export async function handleSubscribe(client: ClientConnection, worldName: string): Promise<void> {
  // Load and attach world to client
  const worldId = toKebabCase(worldName);
  const world = await getWorld(ROOT_PATH, worldId);
  if (!world) {
    client.send(JSON.stringify({
      type: 'error',
      error: 'Failed to load world'
    }));
    return;
  }

  // Clean up existing world subscription if any
  await cleanupWorldSubscription(client);

  // Attach world to client
  client.world = world;
  client.worldEventListeners = new Map();

  // Set up event listeners
  setupWorldEventListeners(client, world);

  client.send(JSON.stringify({
    type: 'subscribed',
    worldName,
    timestamp: new Date().toISOString()
  }));
}

// Handle unsubscribe event
export async function handleUnsubscribe(client: ClientConnection): Promise<void> {
  // Clean up world subscription
  await cleanupWorldSubscription(client);

  client.send(JSON.stringify({
    type: 'unsubscribed',
    timestamp: new Date().toISOString()
  }));
}

// Handle event type message
export async function handleEvent(client: ClientConnection, worldName: string, eventMessage: string, sender?: string): Promise<void> {
  // Use attached world object if available
  if (!client.world || client.world.name !== worldName) {
    client.send(JSON.stringify({
      type: 'error',
      error: 'Event requires worldName and message'
    }));
    return;
  }

  // Check for command messages (starting with '/')
  if (eventMessage && eventMessage.trim().startsWith('/')) {
    const preparedCommand = prepareCommandWithRootPath(eventMessage.trim());
    const result = await executeCommand(preparedCommand, client.world);

    // Send command result
    client.send(JSON.stringify(result));

    // Refresh world if needed
    if (result.refreshWorld) {
      await refreshWorldSubscription(client, worldName);
    }

    return;
  }

  // Normalize user senders to 'HUMAN' for public messages that agents should respond to
  const normalizedSender = sender && sender.startsWith('user') ? 'HUMAN' : (sender || 'HUMAN');
  eventMessage && publishMessage(client.world, eventMessage, normalizedSender);
}

// Handle system and world type messages (commands only)
export async function handleSystemOrWorld(client: ClientConnection, type: string, worldName: string, eventMessage: string): Promise<void> {
  if (!client.world || client.world.name !== worldName) {
    client.send(JSON.stringify({
      type: 'error',
      error: `${type} event requires valid world subscription`
    }));
    return;
  }

  if (eventMessage && eventMessage.trim().startsWith('/')) {
    const preparedCommand = prepareCommandWithRootPath(eventMessage.trim());
    const result = await executeCommand(preparedCommand, client.world);

    // Send command result
    client.send(JSON.stringify(result));

    // Refresh world if needed
    if (result.refreshWorld) {
      await refreshWorldSubscription(client, worldName);
    }
  } else {
    client.send(JSON.stringify({
      type: 'error',
      error: `${type} event requires command message starting with '/'`
    }));
  }
}

// Handle message type (commands if starts with '/', otherwise publish to world)
export async function handleMessage(client: ClientConnection, worldName: string, eventMessage: string, sender?: string): Promise<void> {
  if (!client.world || client.world.name !== worldName) {
    client.send(JSON.stringify({
      type: 'error',
      error: 'Message event requires valid world subscription'
    }));
    return;
  }

  if (eventMessage && eventMessage.trim().startsWith('/')) {
    // Handle as command
    const preparedCommand = prepareCommandWithRootPath(eventMessage.trim());
    const result = await executeCommand(preparedCommand, client.world);

    // Send command result
    client.send(JSON.stringify(result));

    // Refresh world if needed
    if (result.refreshWorld) {
      await refreshWorldSubscription(client, worldName);
    }
  } else {
    // Handle as regular message - publish to world
    const msgNormalizedSender = sender && sender.startsWith('user') ? 'HUMAN' : (sender || 'HUMAN');
    eventMessage && publishMessage(client.world, eventMessage, msgNormalizedSender);
  }
}

/**
 * Stateless Event Handling Module for Agent World
 *
 * Features:
 * - Pure stateless command execution and message publishing
 * - Transport-agnostic event handling functions
 * - Command routing and validation
 * - Message normalization and publishing
 * - Standardized response helpers
 * - World subscription management with centralized logic
 * - No connection state management (handled by transport layer)
 *
 * World Subscription:
 * - subscribeWorld(): Centralized world loading and event listener setup
 * - getWorld(): Simple world loading wrapper with kebab-case conversion
 * - ClientConnection interface for transport abstraction
 * - Event filtering and forwarding to client connections
 * - Automatic cleanup on unsubscribe
 *
 * Message Schemas:
 * - InboundMessageSchema: Validates messages received from clients
 * - OutboundMessageSchema: Defines structure for messages sent to clients
 * - Supports success/error responses and command results
 *
 * Event Functions:
 * - handleCommand: Execute commands and return results with refresh flags
 * - handleMessagePublish: Publish messages to world events
 * - All functions are pure and stateless
 *
 * Response Helpers:
 * - sendSuccess(client, message, data?): Send standardized success response
 * - sendError(client, error, details?): Send standardized error response
 * - sendCommandResult(client, commandResult): Send standardized command execution result
 * - All helpers automatically add timestamp and proper type fields
 *
 * Implementation:
 * - Uses enhanced ClientConnection interface for world event handling
 * - Centralizes world subscription logic from CLI and WebSocket transports
 * - Handles toKebabCase conversion internally for world identifiers
 * - Pure functions that take explicit parameters
 * - Command results indicate if world refresh is needed
 *
 * Changes:
 * - Added subscribeWorld() and getWorld() functions for centralized world management
 * - Enhanced ClientConnection interface with onWorldEvent and onError callbacks
 * - Moved world event listener setup logic from transport layers
 * - Integrated toKebabCase conversion to eliminate transport layer dependency
 */

import { z } from 'zod';
import { World } from '../core/types.js';
import { publishMessage } from '../core/world-events.js';
import { executeCommand } from './commands.js';
import { getWorld as coreGetWorld } from '../core/world-manager.js';
import { toKebabCase } from '../core/utils.js';

// Enhanced client connection interface for world subscription management
export interface ClientConnection {
  send: (data: string) => void;
  isOpen: boolean;
  // Optional event handler for world events
  onWorldEvent?: (eventType: string, eventData: any) => void;
  onError?: (error: string) => void;
}

// World subscription object with cleanup methods
export interface WorldSubscription {
  world: World;
  unsubscribe: () => Promise<void>;
  refresh: (rootPath: string) => Promise<World>;
}

// Minimal client connection interface for stateless event handling
export interface ClientConnection {
  send: (data: string) => void;
  isOpen: boolean;
}

// Zod validation schemas for inbound and outbound messages

// Schema for messages received from clients (only event-related messages)
export const InboundMessageSchema = z.object({
  type: z.enum(["system", "world", "message"]),
  payload: z.object({
    worldName: z.string().optional(),
    message: z.string().optional(),
    sender: z.string().optional()
  })
});

// Schema for messages sent to clients
export const OutboundMessageSchema = z.union([
  // Success response (used for subscriptions, general operations, and command results)
  z.object({
    type: z.literal('success'),
    message: z.string(),
    data: z.any().optional(), // Command results go here
    timestamp: z.string()
  }),
  // Error response
  z.object({
    type: z.literal('error'),
    error: z.string(),
    details: z.any().optional(),
    timestamp: z.string()
  }),
  // World event forwarding
  z.object({
    eventType: z.enum(['system', 'world', 'message', 'sse']),
    sender: z.string().optional(),
    message: z.string().optional(),
    timestamp: z.string().optional()
  }).passthrough() // Allow additional properties for event data
]);

// Type aliases for convenience
export type InboundMessage = z.infer<typeof InboundMessageSchema>;
export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;

// Legacy alias for backward compatibility - still supports only event-related messages
export const MessageSchema = InboundMessageSchema;

// Helper functions for standardized responses
export function sendSuccess(client: ClientConnection, message: string, data?: any) {
  client.send(JSON.stringify({
    type: 'success',
    message,
    data,
    timestamp: new Date().toISOString()
  }));
}

export function sendError(client: ClientConnection, error: string, details?: any) {
  client.send(JSON.stringify({
    type: 'error',
    error,
    details,
    timestamp: new Date().toISOString()
  }));
}

export function sendCommandResult(client: ClientConnection, commandResult: any) {
  const message = commandResult.error ? 'Command failed' : 'Command executed successfully';

  // Handle simplified data responses (no double nesting)
  if (commandResult.data !== undefined && commandResult.message && !commandResult.type) {
    // This is a simplified data response - send data directly
    client.send(JSON.stringify({
      type: 'success',
      message: commandResult.message,
      data: commandResult.data, // Direct data access - no nesting
      refreshWorld: commandResult.refreshWorld,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Handle traditional command results
  client.send(JSON.stringify({
    type: 'success',
    message,
    data: commandResult, // Traditional nested structure for backward compatibility
    timestamp: new Date().toISOString()
  }));
}

// Helper function to add root path to commands that need it
export function prepareCommandWithRootPath(message: string, rootPath: string): string {
  const commandLine = message.slice(1).trim(); // Remove leading '/'
  if (!commandLine) return message;

  const parts = commandLine.split(/\s+/);
  const commandName = parts[0].toLowerCase();

  // Commands that require root path as first argument
  const commandsRequiringRootPath = ['getworlds', 'addworld', 'updateworld', 'getworld'];

  if (commandsRequiringRootPath.includes(commandName)) {
    // Insert rootPath as first argument
    const args = parts.slice(1);
    return `/${commandName} ${rootPath} ${args.join(' ')}`.trim();
  }

  return message;
}

// Stateless command execution
export async function handleCommand(world: World | null, eventMessage: string, rootPath: string): Promise<any> {
  if (!eventMessage?.trim().startsWith('/')) {
    return { error: 'Commands must start with /' };
  }

  const preparedCommand = prepareCommandWithRootPath(eventMessage.trim(), rootPath);
  return await executeCommand(preparedCommand, world);
}

// Stateless message publishing
export function handleMessagePublish(world: World, eventMessage: string, sender?: string): void {
  if (!eventMessage) return;

  // Normalize user senders to 'HUMAN' for public messages that agents should respond to
  const normalizedSender = sender && sender.startsWith('user') ? 'HUMAN' : (sender || 'HUMAN');
  publishMessage(world, eventMessage, normalizedSender);
}

// World subscription management functions

/**
 * Set up event listeners for world events with client connection forwarding
 */
function setupWorldEventListeners(world: World, client: ClientConnection): Map<string, (...args: any[]) => void> {
  const worldEventListeners = new Map<string, (...args: any[]) => void>();

  // Generic handler that forwards events to client with filtering
  const handler = (eventType: string) => (eventData: any) => {
    // Skip echoing user messages back to client
    // Only forward agent responses, system messages, and SSE events
    if (eventData.sender && (eventData.sender === 'HUMAN' || eventData.sender.startsWith('user'))) {
      return;
    }

    // Forward event to client if handler is provided
    if (client.onWorldEvent && client.isOpen) {
      client.onWorldEvent(eventType, eventData);
    }
  };

  // List of event types to forward
  const eventTypes = ['system', 'world', 'message', 'sse'];

  // Set up listeners for all event types
  for (const eventType of eventTypes) {
    const eventHandler = handler(eventType);
    world.eventEmitter.on(eventType, eventHandler);
    worldEventListeners.set(eventType, eventHandler);
  }

  return worldEventListeners;
}

/**
 * Clean up world subscription and event listeners
 */
async function cleanupWorldSubscription(world: World, worldEventListeners: Map<string, (...args: any[]) => void>): Promise<void> {
  if (world && worldEventListeners) {
    // Remove all event listeners
    for (const [eventName, listener] of worldEventListeners) {
      world.eventEmitter.off(eventName, listener);
    }
    worldEventListeners.clear();
  }
}

/**
 * Subscribe to a world with event listener setup
 * Centralizes world loading and event subscription logic from CLI and WebSocket
 * Handles toKebabCase conversion internally
 */
export async function subscribeWorld(
  worldIdentifier: string,
  rootPath: string,
  client: ClientConnection
): Promise<WorldSubscription | null> {
  try {
    // Load world using core manager (convert to kebab-case internally)
    const worldId = toKebabCase(worldIdentifier);
    const world = await coreGetWorld(rootPath, worldId);

    if (!world) {
      if (client.onError) {
        client.onError(`World not found: ${worldIdentifier}`);
      }
      return null;
    }

    // Set up event listeners
    const worldEventListeners = setupWorldEventListeners(world, client);

    // Return subscription object with cleanup methods
    return {
      world,
      unsubscribe: async () => {
        await cleanupWorldSubscription(world, worldEventListeners);
      },
      refresh: async (rootPath: string) => {
        // Clean up existing listeners
        await cleanupWorldSubscription(world, worldEventListeners);

        // Reload world
        const refreshedWorld = await coreGetWorld(rootPath, worldId);
        if (refreshedWorld) {
          // Setup new listeners on refreshed world
          const newListeners = setupWorldEventListeners(refreshedWorld, client);

          // Update the world reference (note: this doesn't update the original subscription object)
          // Callers should handle getting the new world reference
          return refreshedWorld;
        }
        throw new Error(`Failed to refresh world: ${worldIdentifier}`);
      }
    };
  } catch (error) {
    if (client.onError) {
      client.onError(`Failed to subscribe to world: ${error instanceof Error ? error.message : error}`);
    }
    return null;
  }
}

/**
 * Get world wrapper function for commands layer
 * Simple wrapper around core getWorld for consistency
 * Handles toKebabCase conversion internally
 */
export async function getWorld(
  worldIdentifier: string,
  rootPath: string
): Promise<World | null> {
  try {
    const worldId = toKebabCase(worldIdentifier);
    return await coreGetWorld(rootPath, worldId);
  } catch (error) {
    return null;
  }
}

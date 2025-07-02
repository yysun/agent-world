/**
 * Stateless Event Handling Module for Agent World
 *
 * Features:
 * - Pure stateless command execution and message publishing
 * - Transport-agnostic event handling functions
 * - Command routing and validation
 * - Message normalization and publishing
 * - Standardized response helpers
 * - No connection state management (handled by transport layer)
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
 * - Uses minimal ClientConnection interface for sending only
 * - No world state management (handled by caller)
 * - Pure functions that take explicit parameters
 * - Command results indicate if world refresh is needed
 */

import { z } from 'zod';
import { World } from '../core/types.js';
import { publishMessage } from '../core/world-events.js';
import { executeCommand } from './commands.js';

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

/**
 * Simplified Command Types
 * 
 * Features:
 * - Discriminated union command system for type safety
 * - Generic base interfaces to reduce boilerplate
 * - Unified response structure with optional data
 * - Backward compatible with existing command system
 * 
 * Simplifications:
 * - Reduced from 18 interfaces to 6 core interfaces
 * - Generic command/response pattern
 * - Eliminated redundant type definitions
 * - Maintained compile-time type safety
 */

import { World, Agent } from '../core/types.js';
import { WorldInfo } from '../core/world-manager.js';

// Time-based request ID generation
export const generateRequestId = (): string => {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Base command interface
export interface BaseCommand {
  id: string;
  timestamp: string;
}

// Base response interface
export interface BaseResponse {
  requestId: string;
  success: boolean;
  timestamp: string;
  data?: any;
  error?: string;
  refreshWorld?: boolean;
}

// Discriminated union for all commands
export type Command =
  | { type: 'getWorlds' } & BaseCommand
  | { type: 'getWorld'; worldName: string } & BaseCommand
  | { type: 'createWorld'; name: string; description?: string; turnLimit?: number } & BaseCommand
  | { type: 'updateWorld'; worldName: string; updates: { name?: string; description?: string; turnLimit?: number } } & BaseCommand
  | { type: 'createAgent'; worldName: string; name: string; description?: string; systemPrompt?: string; provider?: string; model?: string } & BaseCommand
  | { type: 'updateAgentConfig'; worldName: string; agentName: string; config: { model?: string; provider?: string; status?: 'active' | 'inactive' | 'error' } } & BaseCommand
  | { type: 'updateAgentPrompt'; worldName: string; agentName: string; systemPrompt: string } & BaseCommand
  | { type: 'updateAgentMemory'; worldName: string; agentName: string; action: 'clear' | 'add'; message?: { role: 'user' | 'assistant' | 'system'; content: string } } & BaseCommand
  | { type: 'clearAgentMemory'; worldName: string; agentName?: string } & BaseCommand;

// Unified response type
export interface CommandResponse extends BaseResponse {
  type: Command['type'];
}

// Legacy type aliases for backward compatibility
export type CommandRequest = Command;
export type GetWorldsRequest = Extract<Command, { type: 'getWorlds' }>;
export type GetWorldRequest = Extract<Command, { type: 'getWorld' }>;
export type CreateWorldRequest = Extract<Command, { type: 'createWorld' }>;
export type UpdateWorldRequest = Extract<Command, { type: 'updateWorld' }>;
export type CreateAgentRequest = Extract<Command, { type: 'createAgent' }>;
export type UpdateAgentConfigRequest = Extract<Command, { type: 'updateAgentConfig' }>;
export type UpdateAgentPromptRequest = Extract<Command, { type: 'updateAgentPrompt' }>;
export type UpdateAgentMemoryRequest = Extract<Command, { type: 'updateAgentMemory' }>;
export type ClearAgentMemoryRequest = Extract<Command, { type: 'clearAgentMemory' }>;

// Legacy response type aliases for backward compatibility
export type GetWorldsResponse = CommandResponse & { type: 'getWorlds'; data?: WorldInfo[] };
export type GetWorldResponse = CommandResponse & { type: 'getWorld'; data?: { id: string; name: string; description: string; turnLimit: number; agentCount: number; agents: Agent[] } };
export type CreateWorldResponse = CommandResponse & { type: 'createWorld'; data?: { id: string; name: string; description: string; turnLimit: number } };
export type UpdateWorldResponse = CommandResponse & { type: 'updateWorld'; data?: { message: string; refreshWorld: boolean } };
export type CreateAgentResponse = CommandResponse & { type: 'createAgent'; data?: { id: string; name: string; status: string; provider: string; model: string; messageCount: number } };
export type UpdateAgentConfigResponse = CommandResponse & { type: 'updateAgentConfig'; data?: { message: string; refreshWorld: boolean } };
export type UpdateAgentPromptResponse = CommandResponse & { type: 'updateAgentPrompt'; data?: { message: string; refreshWorld: boolean } };
export type UpdateAgentMemoryResponse = CommandResponse & { type: 'updateAgentMemory'; data?: { message: string; refreshWorld: boolean } };
export type ClearAgentMemoryResponse = CommandResponse & { type: 'clearAgentMemory'; data?: { message: string; refreshWorld: boolean } };

// Simplified command handler type
export type CommandHandler<T extends Command = Command> = (
  command: T,
  world?: World | null,
  rootPath?: string
) => Promise<CommandResponse>;

// Client connection interface for transport abstraction
export interface ClientConnection {
  send: (data: string) => void;
  isOpen: boolean;
  onWorldEvent?: (eventType: string, eventData: any) => void;
  onError?: (error: string) => void;
}

// World subscription management
export interface WorldSubscription {
  world: World;
  unsubscribe: () => Promise<void>;
  refresh: (rootPath: string) => Promise<World>;
}

// WebSocket message types for command communication
export interface CommandRequestMessage {
  type: 'system';
  payload: {
    eventType: 'command-request';
    worldName?: string;
    request: Command;
  };
}

export interface CommandResponseMessage {
  type: 'system';
  payload: {
    eventType: 'command-response';
    response: CommandResponse;
  };
}

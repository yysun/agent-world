/**
 * Server Command Types
 * 
 * Features:
 * - Typed command unions with structured parameters (Option C)
 * - Request/response system with time-based IDs
 * - System event type for command communication
 * - Type-safe command definitions
 * - No backward compatibility - complete redesign
 * 
 * Changes:
 * - Complete rewrite for typed command system
 * - Added structured command request/response interfaces
 * - Replaced unsafe args array with typed parameters
 * - Added time-based request ID generation
 * - System event type for all command communication
 */

import { World, Agent } from '../core/types.js';
import { WorldInfo } from '../core/world-manager.js';

// Time-based request ID generation
export const generateRequestId = (): string => {
  return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Base request interface
export interface BaseCommandRequest {
  id: string;
  timestamp: string;
}

// Base response interface
export interface BaseCommandResponse {
  requestId: string;
  success: boolean;
  timestamp: string;
}

// Specific command request types
export interface GetWorldsRequest extends BaseCommandRequest {
  type: 'getWorlds';
}

export interface GetWorldRequest extends BaseCommandRequest {
  type: 'getWorld';
  worldName: string;
}

export interface CreateWorldRequest extends BaseCommandRequest {
  type: 'createWorld';
  name: string;
  description?: string;
  turnLimit?: number;
}

export interface UpdateWorldRequest extends BaseCommandRequest {
  type: 'updateWorld';
  worldName: string;
  updates: {
    name?: string;
    description?: string;
    turnLimit?: number;
  };
}

export interface CreateAgentRequest extends BaseCommandRequest {
  type: 'createAgent';
  worldName: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  provider?: string;
  model?: string;
}

export interface UpdateAgentConfigRequest extends BaseCommandRequest {
  type: 'updateAgentConfig';
  worldName: string;
  agentName: string;
  config: {
    model?: string;
    provider?: string;
    status?: 'active' | 'inactive' | 'error';
  };
}

export interface UpdateAgentPromptRequest extends BaseCommandRequest {
  type: 'updateAgentPrompt';
  worldName: string;
  agentName: string;
  systemPrompt: string;
}

export interface UpdateAgentMemoryRequest extends BaseCommandRequest {
  type: 'updateAgentMemory';
  worldName: string;
  agentName: string;
  action: 'clear' | 'add';
  message?: {
    role: 'user' | 'assistant' | 'system';
    content: string;
  };
}

export interface ClearAgentMemoryRequest extends BaseCommandRequest {
  type: 'clearAgentMemory';
  worldName: string;
  agentName?: string; // If undefined, clear all agents
}

// Union type for all command requests
export type CommandRequest =
  | GetWorldsRequest
  | GetWorldRequest
  | CreateWorldRequest
  | UpdateWorldRequest
  | CreateAgentRequest
  | UpdateAgentConfigRequest
  | UpdateAgentPromptRequest
  | UpdateAgentMemoryRequest
  | ClearAgentMemoryRequest;

// Specific command response types
export interface GetWorldsResponse extends BaseCommandResponse {
  type: 'getWorlds';
  data?: WorldInfo[];
  error?: string;
}

export interface GetWorldResponse extends BaseCommandResponse {
  type: 'getWorld';
  data?: {
    id: string;
    name: string;
    description: string;
    turnLimit: number;
    agentCount: number;
    agents: Agent[];
  };
  error?: string;
}

export interface CreateWorldResponse extends BaseCommandResponse {
  type: 'createWorld';
  data?: {
    id: string;
    name: string;
    description: string;
    turnLimit: number;
  };
  error?: string;
}

export interface UpdateWorldResponse extends BaseCommandResponse {
  type: 'updateWorld';
  data?: {
    message: string;
    refreshWorld: boolean;
  };
  error?: string;
}

export interface CreateAgentResponse extends BaseCommandResponse {
  type: 'createAgent';
  data?: {
    id: string;
    name: string;
    status: string;
    provider: string;
    model: string;
    messageCount: number;
  };
  error?: string;
}

export interface UpdateAgentConfigResponse extends BaseCommandResponse {
  type: 'updateAgentConfig';
  data?: {
    message: string;
    refreshWorld: boolean;
  };
  error?: string;
}

export interface UpdateAgentPromptResponse extends BaseCommandResponse {
  type: 'updateAgentPrompt';
  data?: {
    message: string;
    refreshWorld: boolean;
  };
  error?: string;
}

export interface UpdateAgentMemoryResponse extends BaseCommandResponse {
  type: 'updateAgentMemory';
  data?: {
    message: string;
    refreshWorld: boolean;
  };
  error?: string;
}

export interface ClearAgentMemoryResponse extends BaseCommandResponse {
  type: 'clearAgentMemory';
  data?: {
    message: string;
    refreshWorld: boolean;
  };
  error?: string;
}

// Union type for all command responses
export type CommandResponse =
  | GetWorldsResponse
  | GetWorldResponse
  | CreateWorldResponse
  | UpdateWorldResponse
  | CreateAgentResponse
  | UpdateAgentConfigResponse
  | UpdateAgentPromptResponse
  | UpdateAgentMemoryResponse
  | ClearAgentMemoryResponse;

// Server command handler type - now takes typed requests
export type ServerCommandHandler<T extends CommandRequest, R extends CommandResponse> = (
  request: T,
  world?: World
) => Promise<R>;

// Command handler registry type
export interface CommandHandlers {
  getWorlds: ServerCommandHandler<GetWorldsRequest, GetWorldsResponse>;
  getWorld: ServerCommandHandler<GetWorldRequest, GetWorldResponse>;
  createWorld: ServerCommandHandler<CreateWorldRequest, CreateWorldResponse>;
  updateWorld: ServerCommandHandler<UpdateWorldRequest, UpdateWorldResponse>;
  createAgent: ServerCommandHandler<CreateAgentRequest, CreateAgentResponse>;
  updateAgentConfig: ServerCommandHandler<UpdateAgentConfigRequest, UpdateAgentConfigResponse>;
  updateAgentPrompt: ServerCommandHandler<UpdateAgentPromptRequest, UpdateAgentPromptResponse>;
  updateAgentMemory: ServerCommandHandler<UpdateAgentMemoryRequest, UpdateAgentMemoryResponse>;
  clearAgentMemory: ServerCommandHandler<ClearAgentMemoryRequest, ClearAgentMemoryResponse>;
}

// WebSocket message types for command communication
export interface CommandRequestMessage {
  type: 'system';
  payload: {
    eventType: 'command-request';
    worldName?: string;
    request: CommandRequest;
  };
}

export interface CommandResponseMessage {
  type: 'system';
  payload: {
    eventType: 'command-response';
    response: CommandResponse;
  };
}

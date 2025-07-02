/**
 * Server Command Types
 * 
 * Features:
 * - Simple command handler interface for server-side commands
 * - Async command processing with standardized response handling
 * - World context and command argument support
 * - Result-based response system for client communication
 * - Extended command result types for data responses
 * - Helper function interfaces for common operations
 * 
 * Changes:
 * - Initial creation for server command structure
 * - Command result interface for standardized client responses
 * - Added data response types for world and agent information
 * - Added helper function types for common command operations
 * - Removed unused ClientConnection parameter from commands
 */

import { World, Agent } from '../../core/types.js';
import { WorldInfo } from '../../core/world-manager.js';

export interface CommandResult {
  type?: 'system' | 'error' | 'data';
  content?: string;
  error?: string;
  message?: string; // For simplified data responses
  data?: any;
  timestamp: string;
  refreshWorld?: boolean; // Flag to indicate world should be refreshed after operation
}

export type ServerCommand = (
  args: string[],
  world: World
) => Promise<CommandResult>;

// Helper function types for common operations
export type ValidationHelper = (args: string[], requiredCount?: number) => CommandResult | null;
export type ResponseHelper = (content: string, type?: 'system' | 'error' | 'data', data?: any, refreshWorld?: boolean) => CommandResult;
export type ErrorHelper = (error: string | Error) => CommandResult;

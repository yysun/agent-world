/**
 * World Class - Object-Oriented Wrapper for Core World Functions
 *
 * Features:
 * - Clean OOP interface wrapping core function-based API
 * - Maintains worldId for seamless method chaining
 * - All methods delegate to core/managers functions
 * - Type-safe with full TypeScript support
 * - Stateless design - each method call fetches fresh data
 *
 * Usage:
 * ```typescript
 * const world = new WorldClass(worldId);
 * await world.delete();
 * const agent = await world.createAgent({...});
 * const agents = await world.listAgents();
 * await world.clearAgentMemory('agent-name');
 * ```
 *
 * Design:
 * - Each method internally calls the corresponding core function
 * - Handles worldId automatically
 * - Returns same types as core functions for consistency
 * - No internal state management - always fetches latest data
 * - Root path parameter removed - storage factory handles path management
 */

import {
  // World operations
  getWorld,
  updateWorld,
  deleteWorld,
  exportWorldToMarkdown,

  // Agent operations
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  listAgents,
  clearAgentMemory,

  // Chat operations
  listChats,
  deleteChat,
  newChat,
  restoreChat,

  // Types
  type World,
  type Agent,
  type Chat,
} from './index.js';

import type {
  CreateAgentParams,
  UpdateAgentParams,
  UpdateWorldParams,
} from './types.js';

import { toKebabCase } from './utils.js';
/**
 * Object-oriented wrapper for World management functions
 */
export class WorldClass {
  constructor(
    private readonly worldId: string
  ) {
    this.worldId = toKebabCase(this.worldId);
  }

  // ========================
  // WORLD OPERATIONS
  // ========================

  /**
   * Delete this world and all associated data
   */
  async delete(): Promise<boolean> {
    return await deleteWorld(this.worldId);
  }

  /**
   * Update world configuration
   */
  async update(updates: UpdateWorldParams): Promise<World | null> {
    return await updateWorld(this.worldId, updates);
  }

  /**
   * Get fresh world data with agent loading
   */
  async reload(): Promise<World | null> {
    return await getWorld(this.worldId);
  }

  /**
   * Export world to markdown format
   */
  async exportToMarkdown(): Promise<string> {
    return await exportWorldToMarkdown(this.worldId);
  }

  /**
   * Save world instance - updates storage with current state
   */
  async save(): Promise<void> {
    // Since we're stateless, this is a no-op
    // In a stateful version, this would save current state
    // For now, users should call update() with specific changes
  }

  // ========================
  // AGENT OPERATIONS
  // ========================

  /**
   * Create new agent in this world
   */
  async createAgent(params: CreateAgentParams): Promise<Agent> {
    return await createAgent(this.worldId, params);
  }

  /**
   * Get agent by name/id
   */
  async getAgent(agentName: string): Promise<Agent | null> {
    // Get world to access currentChatId for memory filtering
    const world = await getWorld(this.worldId);
    const currentChatId = world?.currentChatId;
    return await getAgent(this.worldId, agentName, currentChatId);
  }

  /**
   * Update agent configuration
   */
  async updateAgent(agentName: string, updates: UpdateAgentParams): Promise<Agent | null> {
    return await updateAgent(this.worldId, agentName, updates);
  }

  /**
   * Delete agent from this world
   */
  async deleteAgent(agentName: string): Promise<boolean> {
    return await deleteAgent(this.worldId, agentName);
  }

  /**
   * List all agents in this world
   */
  async listAgents(): Promise<Agent[]> {
    return await listAgents(this.worldId);
  }

  /**
   * Clear agent memory (archive existing and reset to empty)
   */
  async clearAgentMemory(agentName: string): Promise<Agent | null> {
    return await clearAgentMemory(this.worldId, agentName);
  }

  // ========================
  // CHAT OPERATIONS
  // ========================

  /**
   * List all chats for this world
   */
  async listChats(): Promise<Chat[]> {
    return await listChats(this.worldId);
  }

  /**
   * Create a new chat session for this world
   */
  async newChat(setAsCurrent: boolean = true): Promise<World | null> {
    return await newChat(this.worldId);
  }

  /**
   * Load specific chat by ID and optionally set as current
   */
  async restoreChat(chatId: string, setAsCurrent: boolean = true): Promise<World | null> {
    if (setAsCurrent) {
      return await restoreChat(this.worldId, chatId);
    } else {
      // Just verify the chat exists without setting as current
      const chats = await listChats(this.worldId);
      const chatExists = chats.some(c => c.id === chatId);
      if (chatExists) {
        return await getWorld(this.worldId);
      } else {
        return null;
      }
    }
  }

  /**
   * Delete chat data by ID
   */
  async deleteChat(chatId: string): Promise<boolean> {
    return await deleteChat(this.worldId, chatId);
  }

  // ========================
  // UTILITY METHODS
  // ========================

  /**
   * Get the world ID
   */
  get id(): string {
    return this.worldId;
  }

  /**
   * Create a string representation of this world
   */
  toString(): string {
    return `WorldClass(${this.worldId})`;
  }

  /**
   * Get JSON representation
   */
  toJSON(): { id: string } {
    return {
      id: this.worldId
    };
  }
}

export default WorldClass;

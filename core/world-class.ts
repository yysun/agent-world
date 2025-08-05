/**
 * World Class - Object-Oriented Wrapper for Core World Functions
 *
 * Features:
 * - Clean OOP interface wrapping core function-based API
 * - Maintains rootPath and worldId for seamless method chaining
 * - All methods delegate to core/managers functions
 * - Type-safe with full TypeScript support
 * - Stateless design - each method call fetches fresh data
 *
 * Usage:
 * ```typescript
 * const world = new WorldClass(rootPath, worldId);
 * await world.delete();
 * const agent = await world.createAgent({...});
 * const agents = await world.listAgents();
 * await world.clearAgentMemory('agent-name');
 * ```
 *
 * Design:
 * - Each method internally calls the corresponding core function
 * - Handles rootPath and worldId automatically
 * - Returns same types as core functions for consistency
 * - No internal state management - always fetches latest data
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

/**
 * Object-oriented wrapper for World management functions
 */
export class WorldClass {
  constructor(
    private readonly rootPath: string,
    private readonly worldId: string
  ) { }

  // ========================
  // WORLD OPERATIONS
  // ========================

  /**
   * Delete this world and all associated data
   */
  async delete(): Promise<boolean> {
    return await deleteWorld(this.rootPath, this.worldId);
  }

  /**
   * Update world configuration
   */
  async update(updates: UpdateWorldParams): Promise<World | null> {
    return await updateWorld(this.rootPath, this.worldId, updates);
  }

  /**
   * Get fresh world data with agent loading
   */
  async reload(): Promise<World | null> {
    return await getWorld(this.rootPath, this.worldId);
  }

  /**
   * Export world to markdown format
   */
  async exportToMarkdown(): Promise<string> {
    return await exportWorldToMarkdown(this.rootPath, this.worldId);
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
    return await createAgent(this.rootPath, this.worldId, params);
  }

  /**
   * Get agent by name/id
   */
  async getAgent(agentName: string): Promise<Agent | null> {
    return await getAgent(this.rootPath, this.worldId, agentName);
  }

  /**
   * Update agent configuration
   */
  async updateAgent(agentName: string, updates: UpdateAgentParams): Promise<Agent | null> {
    return await updateAgent(this.rootPath, this.worldId, agentName, updates);
  }

  /**
   * Delete agent from this world
   */
  async deleteAgent(agentName: string): Promise<boolean> {
    return await deleteAgent(this.rootPath, this.worldId, agentName);
  }

  /**
   * List all agents in this world
   */
  async listAgents(): Promise<Agent[]> {
    return await listAgents(this.rootPath, this.worldId);
  }

  /**
   * Clear agent memory (archive existing and reset to empty)
   */
  async clearAgentMemory(agentName: string): Promise<Agent | null> {
    return await clearAgentMemory(this.rootPath, this.worldId, agentName);
  }

  // ========================
  // CHAT OPERATIONS
  // ========================

  /**
   * List all chats for this world
   */
  async listChats(): Promise<Chat[]> {
    return await listChats(this.rootPath, this.worldId);
  }

  /**
   * Create new chat and optionally set as current
   */
  async newChat(setAsCurrent: boolean = true): Promise<World | null> {
    return await newChat(this.rootPath, this.worldId, setAsCurrent);
  }

  /**
   * Load specific chat by ID and optionally set as current
   */
  async restoreChat(chatId: string, setAsCurrent: boolean = true): Promise<World | null> {
    return await restoreChat(this.rootPath, this.worldId, chatId);
  }

  /**
   * Delete chat data by ID
   */
  async deleteChat(chatId: string): Promise<boolean> {
    return await deleteChat(this.rootPath, this.worldId, chatId);
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
   * Get the root path
   */
  get path(): string {
    return this.rootPath;
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
  toJSON(): { id: string; rootPath: string } {
    return {
      id: this.worldId,
      rootPath: this.rootPath
    };
  }
}

export default WorldClass;

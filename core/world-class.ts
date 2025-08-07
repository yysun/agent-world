/**
 * World Class - Object-Oriented Wrapper for Core World Functions
 *
 * Provides a clean OOP interface wrapping core function-based API with automatic worldId management.
 * Stateless design - each method delegates to core functions and fetches fresh data.
 *
 * Usage:
 * ```typescript
 * const world = new WorldClass(worldId);
 * await world.delete();
 * const agent = await world.createAgent({...});
 * await world.clearAgentMemory('agent-name');
 * ```
 */

import {
  getWorld, updateWorld, deleteWorld, exportWorldToMarkdown,
  createAgent, getAgent, updateAgent, deleteAgent, listAgents, clearAgentMemory,
  listChats, deleteChat, newChat, restoreChat,
  type World, type Agent, type Chat,
} from './index.js';

import type { CreateAgentParams, UpdateAgentParams, UpdateWorldParams } from './types.js';
import { toKebabCase } from './utils.js';

/** Object-oriented wrapper for World management functions */
export class WorldClass {
  constructor(private readonly worldId: string) {
    this.worldId = toKebabCase(this.worldId);
  }

  // WORLD OPERATIONS
  async delete(): Promise<boolean> {
    return await deleteWorld(this.worldId);
  }

  async update(updates: UpdateWorldParams): Promise<World | null> {
    return await updateWorld(this.worldId, updates);
  }

  async reload(): Promise<World | null> {
    return await getWorld(this.worldId);
  }

  async exportToMarkdown(): Promise<string> {
    return await exportWorldToMarkdown(this.worldId);
  }

  async save(): Promise<void> {
    // Stateless design - use update() with specific changes
  }

  // AGENT OPERATIONS
  async createAgent(params: CreateAgentParams): Promise<Agent> {
    return await createAgent(this.worldId, params);
  }

  async getAgent(agentName: string): Promise<Agent | null> {
    return await getAgent(this.worldId, agentName);
  }

  async updateAgent(agentName: string, updates: UpdateAgentParams): Promise<Agent | null> {
    return await updateAgent(this.worldId, agentName, updates);
  }

  async deleteAgent(agentName: string): Promise<boolean> {
    return await deleteAgent(this.worldId, agentName);
  }

  async listAgents(): Promise<Agent[]> {
    return await listAgents(this.worldId);
  }

  async clearAgentMemory(agentName: string): Promise<Agent | null> {
    return await clearAgentMemory(this.worldId, agentName);
  }

  // CHAT OPERATIONS
  async listChats(): Promise<Chat[]> {
    return await listChats(this.worldId);
  }

  async newChat(setAsCurrent: boolean = true): Promise<World | null> {
    return await newChat(this.worldId);
  }

  async restoreChat(chatId: string, setAsCurrent: boolean = true): Promise<World | null> {
    if (setAsCurrent) {
      return await restoreChat(this.worldId, chatId);
    }
    const chats = await listChats(this.worldId);
    return chats.some(c => c.id === chatId) ? await getWorld(this.worldId) : null;
  }

  async deleteChat(chatId: string): Promise<boolean> {
    return await deleteChat(this.worldId, chatId);
  }

  // UTILITY METHODS
  get id(): string {
    return this.worldId;
  }

  toString(): string {
    return `WorldClass(${this.worldId})`;
  }

  toJSON(): { id: string } {
    return { id: this.worldId };
  }
}

export default WorldClass;

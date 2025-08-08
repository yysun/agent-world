/**
 * Memory Storage Implementation
 *
 * In-memory storage backend for unit tests, browser environments, and development.
 * Provides full StorageAPI compatibility with data persistence during runtime session.
 *
 * Features:
 * - Full StorageAPI implementation using in-memory Maps
 * - No external dependencies or file system access required
 * - Suitable for unit tests, browser environments, and development
 * - Complete chat CRUD operations with proper data isolation
 * - Batch operations with atomic-like behavior
 * - Memory archiving and cleanup operations
 * - Data validation and integrity checks
 *
 * Implementation:
 * - Uses nested Maps for hierarchical data organization
 * - Maintains separate stores for worlds, agents, chats, and archived memory
 * - Deep cloning for data isolation and immutability
 * - Proper error handling with meaningful error messages
 * - ID-based lookups with existence validation
 *
 * Changes:
 * - 2025-08-07: Initial implementation for non-Node environments
 */
import type {
  StorageAPI,
  World,
  Agent,
  Chat,
  UpdateChatParams,
  WorldChat,
  AgentMessage
} from '../types.js';
import { EventEmitter } from 'events';

/**
 * Deep clone utility for data isolation
 */
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof EventEmitter) {
    // For EventEmitter, create a new instance to preserve functionality
    const newEmitter = new EventEmitter();
    // Copy listeners if any exist
    const events = (obj as any)._events;
    if (events) {
      (newEmitter as any)._events = Object.assign({}, events);
      (newEmitter as any)._eventsCount = (obj as any)._eventsCount;
    }
    return newEmitter as T;
  }

  if (obj instanceof Map) {
    const clonedMap = new Map();
    for (const [key, value] of obj.entries()) {
      clonedMap.set(key, deepClone(value));
    }
    return clonedMap as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as T;
  }

  const clonedObj = {} as T;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepClone(obj[key]);
    }
  }
  return clonedObj;
}

/**
 * Generate a simple unique ID for testing purposes
 */
function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Memory-based storage implementation
 */
export class MemoryStorage implements StorageAPI {
  private worlds = new Map<string, World>();
  private agents = new Map<string, Map<string, Agent>>(); // worldId -> agentId -> Agent
  private chats = new Map<string, Map<string, Chat>>(); // worldId -> chatId -> Chat
  private worldChats = new Map<string, Map<string, WorldChat>>(); // worldId -> chatId -> WorldChat
  private archivedMemory = new Map<string, Map<string, AgentMessage[]>>(); // worldId -> agentId -> archived messages

  // World operations
  async saveWorld(worldData: World): Promise<void> {
    if (!worldData.id) {
      throw new Error('World ID is required');
    }

    // Deep clone to prevent external mutations
    const clonedWorld = deepClone(worldData);
    this.worlds.set(worldData.id, clonedWorld);
  }

  async loadWorld(worldId: string): Promise<World | null> {
    const world = this.worlds.get(worldId);
    return world ? deepClone(world) : null;
  }

  async deleteWorld(worldId: string): Promise<boolean> {
    const deleted = this.worlds.delete(worldId);
    if (deleted) {
      // Clean up related data
      this.agents.delete(worldId);
      this.chats.delete(worldId);
      this.worldChats.delete(worldId);
      this.archivedMemory.delete(worldId);
    }
    return deleted;
  }

  async listWorlds(): Promise<World[]> {
    return Array.from(this.worlds.values()).map(world => deepClone(world));
  }

  async worldExists(worldId: string): Promise<boolean> {
    return this.worlds.has(worldId);
  }

  async getMemory(worldId: string, chatId: string): Promise<AgentMessage[]> {
    const messages: AgentMessage[] = [];
    const worldAgents = this.agents.get(worldId);
    if (!worldAgents) return [];

    for (const agent of worldAgents.values()) {
      const mem = Array.isArray(agent.memory) ? agent.memory : [];
      for (const msg of mem) {
        if (!chatId || msg.chatId === chatId) {
          messages.push(deepClone(msg));
        }
      }
    }

    // Sort by createdAt ascending
    messages.sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return at - bt;
    });

    return messages;
  }

  // Agent operations
  async saveAgent(worldId: string, agent: Agent): Promise<void> {
    if (!agent.id) {
      throw new Error('Agent ID is required');
    }

    if (!this.agents.has(worldId)) {
      this.agents.set(worldId, new Map());
    }

    const worldAgents = this.agents.get(worldId)!;
    worldAgents.set(agent.id, deepClone(agent));
  }

  async loadAgent(worldId: string, agentId: string): Promise<Agent | null> {
    const worldAgents = this.agents.get(worldId);
    if (!worldAgents) return null;

    const agent = worldAgents.get(agentId);
    return agent ? deepClone(agent) : null;
  }

  async loadAgentWithRetry(worldId: string, agentId: string, options?: any): Promise<Agent | null> {
    // For memory storage, no retry is needed as there are no I/O failures
    return this.loadAgent(worldId, agentId);
  }

  async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
    const worldAgents = this.agents.get(worldId);
    if (!worldAgents) return false;

    const deleted = worldAgents.delete(agentId);
    if (deleted) {
      // Clean up archived memory for this agent
      const worldMemory = this.archivedMemory.get(worldId);
      if (worldMemory) {
        worldMemory.delete(agentId);
      }
    }
    return deleted;
  }

  async listAgents(worldId: string): Promise<Agent[]> {
    const worldAgents = this.agents.get(worldId);
    if (!worldAgents) return [];

    return Array.from(worldAgents.values()).map(agent => deepClone(agent));
  }

  async agentExists(worldId: string, agentId: string): Promise<boolean> {
    const worldAgents = this.agents.get(worldId);
    return worldAgents ? worldAgents.has(agentId) : false;
  }

  async saveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
    const agent = await this.loadAgent(worldId, agentId);
    if (agent) {
      agent.memory = deepClone(memory);
      await this.saveAgent(worldId, agent);
    }
  }

  async archiveMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
    if (!this.archivedMemory.has(worldId)) {
      this.archivedMemory.set(worldId, new Map());
    }

    const worldMemory = this.archivedMemory.get(worldId)!;
    const existingArchive = worldMemory.get(agentId) || [];
    worldMemory.set(agentId, [...existingArchive, ...deepClone(memory)]);
  }

  async deleteMemoryByChatId(worldId: string, chatId: string): Promise<number> {
    let deletedCount = 0;
    const worldAgents = this.agents.get(worldId);

    if (worldAgents) {
      for (const [agentId, agent] of worldAgents.entries()) {
        const originalLength = agent.memory.length;
        agent.memory = agent.memory.filter(msg => msg.chatId !== chatId);
        const deleted = originalLength - agent.memory.length;
        deletedCount += deleted;

        if (deleted > 0) {
          await this.saveAgent(worldId, agent);
        }
      }
    }

    return deletedCount;
  }

  // Batch operations
  async saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void> {
    for (const agent of agents) {
      await this.saveAgent(worldId, agent);
    }
  }

  async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]> {
    const agents: Agent[] = [];
    for (const agentId of agentIds) {
      const agent = await this.loadAgent(worldId, agentId);
      if (agent) {
        agents.push(agent);
      }
    }
    return agents;
  }

  // Chat operations
  async saveChatData(worldId: string, chat: Chat): Promise<void> {
    if (!chat.id) {
      throw new Error('Chat ID is required');
    }

    if (!this.chats.has(worldId)) {
      this.chats.set(worldId, new Map());
    }

    const worldChats = this.chats.get(worldId)!;
    worldChats.set(chat.id, deepClone(chat));
  }

  async loadChatData(worldId: string, chatId: string): Promise<Chat | null> {
    const worldChats = this.chats.get(worldId);
    if (!worldChats) return null;

    const chat = worldChats.get(chatId);
    return chat ? deepClone(chat) : null;
  }

  async deleteChatData(worldId: string, chatId: string): Promise<boolean> {
    const worldChats = this.chats.get(worldId);
    if (!worldChats) return false;

    const deleted = worldChats.delete(chatId);
    if (deleted) {
      // Also clean up world chat snapshots
      const worldChatSnapshots = this.worldChats.get(worldId);
      if (worldChatSnapshots) {
        worldChatSnapshots.delete(chatId);
      }

      // Clean up memory associated with this chat
      await this.deleteMemoryByChatId(worldId, chatId);
    }
    return deleted;
  }

  async listChats(worldId: string): Promise<Chat[]> {
    const worldChats = this.chats.get(worldId);
    if (!worldChats) return [];

    return Array.from(worldChats.values()).map(chat => deepClone(chat));
  }

  async updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null> {
    const chat = await this.loadChatData(worldId, chatId);
    if (!chat) return null;

    // Apply updates
    if (updates.name !== undefined) chat.name = updates.name;
    if (updates.description !== undefined) chat.description = updates.description;
    if (updates.messageCount !== undefined) chat.messageCount = updates.messageCount;
    chat.updatedAt = new Date();

    await this.saveChatData(worldId, chat);
    return deepClone(chat);
  }

  // World chat operations
  async saveWorldChat(worldId: string, chatId: string, chat: WorldChat): Promise<void> {
    if (!this.worldChats.has(worldId)) {
      this.worldChats.set(worldId, new Map());
    }

    const worldChatSnapshots = this.worldChats.get(worldId)!;
    worldChatSnapshots.set(chatId, deepClone(chat));
  }

  async loadWorldChat(worldId: string, chatId: string): Promise<WorldChat | null> {
    const worldChatSnapshots = this.worldChats.get(worldId);
    if (!worldChatSnapshots) return null;

    const worldChat = worldChatSnapshots.get(chatId);
    return worldChat ? deepClone(worldChat) : null;
  }

  async loadWorldChatFull(worldId: string, chatId: string): Promise<WorldChat | null> {
    // For memory storage, full and regular load are the same
    return this.loadWorldChat(worldId, chatId);
  }

  async restoreFromWorldChat(worldId: string, chat: WorldChat): Promise<boolean> {
    try {
      // Restore world state
      await this.saveWorld(chat.world);

      // Restore agents
      for (const agent of chat.agents) {
        await this.saveAgent(worldId, agent);
      }

      return true;
    } catch (error) {
      console.error('[memory-storage] Failed to restore from world chat:', error);
      return false;
    }
  }

  // Integrity operations
  async validateIntegrity(worldId: string, agentId?: string): Promise<boolean> {
    try {
      if (agentId) {
        // Validate specific agent
        const agent = await this.loadAgent(worldId, agentId);
        return !!agent && typeof agent.id === 'string' && agent.id === agentId;
      } else {
        // Validate world
        const world = await this.loadWorld(worldId);
        return !!world && typeof world.id === 'string' && world.id === worldId;
      }
    } catch {
      return false;
    }
  }

  async repairData(worldId: string, agentId?: string): Promise<boolean> {
    // For memory storage, repair is mostly about validation
    // since data corruption is unlikely in memory
    return this.validateIntegrity(worldId, agentId);
  }

  // Utility methods for testing and debugging

  /**
   * Clear all stored data - useful for test cleanup
   */
  async clear(): Promise<void> {
    this.worlds.clear();
    this.agents.clear();
    this.chats.clear();
    this.worldChats.clear();
    this.archivedMemory.clear();
  }

  /**
   * Get storage statistics - useful for debugging
   */
  getStats(): {
    worlds: number;
    totalAgents: number;
    totalChats: number;
    totalWorldChats: number;
    totalArchivedMemory: number;
  } {
    let totalAgents = 0;
    let totalChats = 0;
    let totalWorldChats = 0;
    let totalArchivedMemory = 0;

    for (const worldAgents of this.agents.values()) {
      totalAgents += worldAgents.size;
    }

    for (const worldChats of this.chats.values()) {
      totalChats += worldChats.size;
    }

    for (const worldChatSnapshots of this.worldChats.values()) {
      totalWorldChats += worldChatSnapshots.size;
    }

    for (const worldMemory of this.archivedMemory.values()) {
      totalArchivedMemory += worldMemory.size;
    }

    return {
      worlds: this.worlds.size,
      totalAgents,
      totalChats,
      totalWorldChats,
      totalArchivedMemory
    };
  }
}

/**
 * Create a new memory storage instance
 */
export function createMemoryStorage(): StorageAPI {
  return new MemoryStorage();
}

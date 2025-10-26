/**
 * Storage Factory
 *
 * Unified, type-safe interface for file-based, SQLite-based, and memory-based storage backends.
 * Provides environment detection, dynamic loading, caching, and NoOp browser implementations.
 *
 * Features:
 * - Environment detection (Node.js vs browser) with dynamic module loading
 * - Storage type selection (file/SQLite/memory) via configuration or environment variables
 * - Instance caching for performance and resource management
 * - Complete chat CRUD operations with strict type safety
 * - Memory storage for unit tests and browser environments
 * - Default SQLite storage in Node.js environments
 *
 * Implementation:
 * - File storage: Dynamic imports with disk-based JSON files
 * - SQLite storage: Schema-based with context and migration helpers
 * - Memory storage: In-memory Maps with full feature parity
 * - Browser: Memory storage with graceful environment detection
 * - Centralized environment detection and error handling
 *
 * Changes:
 * - 2025-08-07: Added memory storage for non-Node environments
 * - 2025-08-05: Consolidated code and removed redundant comments
 * - 2025-08-01: Added full chat CRUD and snapshot support
 * - 2025-07-27: Changed default storage type to SQLite
 */
import type { StorageAPI, Chat, UpdateChatParams, WorldChat, Agent, AgentMessage, World } from '../types.js';
import { validateAgentMessageIds } from './validation.js';
import { createCategoryLogger } from '../logger.js';
import { SQLiteConfig } from './sqlite-schema.js';
import { isNodeEnvironment } from '../utils.js';
import * as path from 'path';

const loggerFactory = createCategoryLogger('core.storage.factory');
import * as fs from 'fs';

// Re-export StorageAPI type for external use
export type { StorageAPI } from '../types.js';

export interface StorageConfig {
  type: 'file' | 'sqlite' | 'memory';
  rootPath: string;
  sqlite?: SQLiteConfig;
}

/**
 * Creates storage wrappers that implement StorageAPI and delegate to storage instance.
 * Provides unified interface across all storage backends with graceful NoOp fallbacks.
 */
export function createStorageWrappers(storageInstance: StorageAPI | null): StorageAPI {
  return {
    // World operations
    async saveWorld(worldData: any): Promise<void> {
      if (!storageInstance) return;
      return storageInstance.saveWorld(worldData);
    },

    async loadWorld(worldId: string): Promise<any> {
      if (!storageInstance) return null;
      return storageInstance.loadWorld(worldId);
    },

    async deleteWorld(worldId: string): Promise<boolean> {
      if (!storageInstance) return false;
      return storageInstance.deleteWorld(worldId);
    },

    async listWorlds(): Promise<any[]> {
      if (!storageInstance) return [];
      return storageInstance.listWorlds();
    },

    async worldExists(worldId: string): Promise<boolean> {
      if (!storageInstance) return false;
      try {
        const world = await storageInstance.loadWorld(worldId);
        return !!world;
      } catch {
        return false;
      }
    },

    async getMemory(worldId: string, chatId: string): Promise<AgentMessage[]> {
      if (!storageInstance) return [];
      if ('getMemory' in storageInstance) {
        return (storageInstance as any).getMemory(worldId, chatId);
      }
      return [];
    },

    // Agent operations
    async saveAgent(worldId: string, agent: any): Promise<void> {
      if (!storageInstance) return;
      return storageInstance.saveAgent(worldId, agent);
    },

    async saveAgentMemory(worldId: string, agentId: string, memory: any[]): Promise<void> {
      if (!storageInstance) return;
      // Call the storage instance's saveAgentMemory directly instead of load-modify-save
      if ('saveAgentMemory' in storageInstance && typeof storageInstance.saveAgentMemory === 'function') {
        return storageInstance.saveAgentMemory(worldId, agentId, memory);
      }
      // Fallback to load-modify-save for storages without dedicated saveAgentMemory
      const agent = await storageInstance.loadAgent(worldId, agentId);
      if (agent) {
        agent.memory = memory;
        return storageInstance.saveAgent(worldId, agent);
      }
    },

    async loadAgent(worldId: string, agentId: string): Promise<any> {
      if (!storageInstance) return null;
      return storageInstance.loadAgent(worldId, agentId);
    },

    async loadAgentWithRetry(worldId: string, agentId: string, options?: any): Promise<any> {
      if (!storageInstance) return null;
      return storageInstance.loadAgent(worldId, agentId);
    },

    async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
      if (!storageInstance) return false;
      return storageInstance.deleteAgent(worldId, agentId);
    },

    async listAgents(worldId: string): Promise<any[]> {
      if (!storageInstance) return [];
      return storageInstance.listAgents(worldId);
    },

    async agentExists(worldId: string, agentId: string): Promise<boolean> {
      if (!storageInstance) return false;
      try {
        const agent = await storageInstance.loadAgent(worldId, agentId);
        return !!agent;
      } catch {
        return false;
      }
    },

    // Chat operations
    async saveChatData(worldId: string, chat: Chat): Promise<void> {
      if (!storageInstance) return;
      try {
        return await storageInstance.saveChatData(worldId, chat);
      } catch (err) {
        throw new Error(`Failed to save chat history: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async loadChatData(worldId: string, chatId: string): Promise<Chat | null> {
      if (!storageInstance) return null;
      try {
        return await storageInstance.loadChatData(worldId, chatId);
      } catch (err) {
        throw new Error(`Failed to load chat history: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async deleteChatData(worldId: string, chatId: string): Promise<boolean> {
      if (!storageInstance) return false;
      try {
        return await storageInstance.deleteChatData(worldId, chatId);
      } catch (err) {
        throw new Error(`Failed to delete chat history: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async listChats(worldId: string): Promise<Chat[]> {
      if (!storageInstance) return [];
      try {
        return await storageInstance.listChats(worldId);
      } catch (err) {
        throw new Error(`Failed to list chats: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null> {
      if (!storageInstance) return null;
      try {
        return await storageInstance.updateChatData(worldId, chatId, updates);
      } catch (err) {
        throw new Error(`Failed to update chat history: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async saveWorldChat(worldId: string, chatId: string, chat: WorldChat): Promise<void> {
      if (!storageInstance) return;
      try {
        return await storageInstance.saveWorldChat(worldId, chatId, chat);
      } catch (err) {
        throw new Error(`Failed to save world chat: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async loadWorldChat(worldId: string, chatId: string): Promise<WorldChat | null> {
      if (!storageInstance) return null;
      try {
        return await storageInstance.loadWorldChat(worldId, chatId);
      } catch (err) {
        throw new Error(`Failed to load world chat: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async loadWorldChatFull(worldId: string, chatId: string): Promise<WorldChat | null> {
      if (!storageInstance) return null;
      try {
        return await storageInstance.loadWorldChatFull(worldId, chatId);
      } catch (err) {
        throw new Error(`Failed to load full world chat: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async restoreFromWorldChat(worldId: string, chat: WorldChat): Promise<boolean> {
      if (!storageInstance) return false;
      try {
        return await storageInstance.restoreFromWorldChat(worldId, chat);
      } catch (err) {
        throw new Error(`Failed to restore from world chat: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async archiveMemory(worldId: string, agentId: string, memory: any[]): Promise<void> {
      if (!storageInstance) return;
      if ('archiveAgentMemory' in storageInstance) {
        return (storageInstance as any).archiveAgentMemory(worldId, agentId, memory);
      }
    },

    async deleteMemoryByChatId(worldId: string, chatId: string): Promise<number> {
      if (!storageInstance) return 0;
      if ('deleteMemoryByChatId' in storageInstance) {
        return (storageInstance as any).deleteMemoryByChatId(worldId, chatId);
      }
      return 0;
    },

    // Batch operations
    async saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void> {
      if (!storageInstance) return;
      if ('saveAgentsBatch' in storageInstance) {
        return storageInstance.saveAgentsBatch(worldId, agents);
      } else {
        for (const agent of agents) {
          await this.saveAgent(worldId, agent);
        }
      }
    },

    async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]> {
      if (!storageInstance) return [];
      if ('loadAgentsBatch' in storageInstance) {
        return storageInstance.loadAgentsBatch(worldId, agentIds);
      } else {
        const agents: Agent[] = [];
        for (const agentId of agentIds) {
          const agent = await this.loadAgent(worldId, agentId);
          if (agent) agents.push(agent);
        }
        return agents;
      }
    },

    // Integrity operations
    async validateIntegrity(worldId: string, agentId?: string): Promise<boolean> {
      if (!storageInstance) return false;
      if ('validateIntegrity' in storageInstance) {
        return storageInstance.validateIntegrity(worldId, agentId);
      } else {
        try {
          if (agentId) {
            const agent = await this.loadAgent(worldId, agentId);
            return !!agent;
          } else {
            const world = await this.loadWorld(worldId);
            return !!world;
          }
        } catch {
          return false;
        }
      }
    },

    async repairData(worldId: string, agentId?: string): Promise<boolean> {
      if (!storageInstance) return false;
      if ('repairData' in storageInstance) {
        return storageInstance.repairData(worldId, agentId);
      } else {
        try {
          if (agentId) {
            await this.loadAgent(worldId, agentId);
          } else {
            await this.loadWorld(worldId);
          }
          return true;
        } catch {
          return false;
        }
      }
    }
  };
}

// File storage adapter with dynamic module loading
function createFileStorageAdapter(rootPath: string): StorageAPI {
  let worldStorage: any;
  let agentStorage: any;

  async function ensureModulesLoaded() {
    if (!worldStorage || !agentStorage) {
      if (!isNodeEnvironment()) {
        throw new Error('File storage not available in browser environment');
      }
      try {
        worldStorage = await import('./world-storage.js');
        agentStorage = await import('./agent-storage.js');
      } catch (error) {
        throw new Error('Failed to load storage modules: ' + (error instanceof Error ? error.message : error));
      }
    }
  }

  return {
    async saveWorld(worldData: World): Promise<void> {
      await ensureModulesLoaded();
      if (worldStorage?.saveWorld) {
        return worldStorage.saveWorld(rootPath, worldData);
      }
    },
    async loadWorld(worldId: string): Promise<World | null> {
      await ensureModulesLoaded();
      if (worldStorage?.loadWorld) {
        return worldStorage.loadWorld(rootPath, worldId);
      }
      return null;
    },
    async deleteWorld(worldId: string): Promise<boolean> {
      await ensureModulesLoaded();
      if (worldStorage?.deleteWorld) {
        return worldStorage.deleteWorld(rootPath, worldId);
      }
      return false;
    },
    async listWorlds(): Promise<World[]> {
      await ensureModulesLoaded();
      if (worldStorage?.listWorlds) {
        return worldStorage.listWorlds(rootPath);
      }
      return [];
    },
    async getMemory(worldId: string, chatId: string): Promise<AgentMessage[]> {
      await ensureModulesLoaded();
      if (worldStorage?.getMemory) {
        return worldStorage.getMemory(rootPath, worldId, chatId);
      }
      return [];
    },
    async saveAgent(worldId: string, agent: Agent): Promise<void> {
      await ensureModulesLoaded();

      // Auto-migrate legacy messages without messageId
      const migrated = validateAgentMessageIds(agent);
      if (migrated) {
        loggerFactory.info('Auto-migrated agent messages with missing messageIds', {
          agentId: agent.id,
          worldId,
          messageCount: agent.memory.length
        });
      }

      if (agentStorage?.saveAgent) {
        return agentStorage.saveAgent(rootPath, worldId, agent);
      }
    },
    async loadAgent(worldId: string, agentId: string): Promise<Agent | null> {
      await ensureModulesLoaded();
      if (agentStorage?.loadAgent) {
        const agent = await agentStorage.loadAgent(rootPath, worldId, agentId);
        if (agent) {
          // Auto-migrate on load if needed
          const migrated = validateAgentMessageIds(agent);
          if (migrated) {
            loggerFactory.info('Auto-migrated agent messages on load', {
              agentId,
              worldId,
              messageCount: agent.memory.length
            });
            // Save back the migrated agent
            if (agentStorage?.saveAgent) {
              await agentStorage.saveAgent(rootPath, worldId, agent);
            }
          }
        }
        return agent;
      }
      return null;
    },
    async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
      await ensureModulesLoaded();
      if (agentStorage?.deleteAgent) {
        return agentStorage.deleteAgent(rootPath, worldId, agentId);
      }
      return false;
    },
    async listAgents(worldId: string): Promise<Agent[]> {
      await ensureModulesLoaded();
      if (agentStorage?.listAgents) {
        return agentStorage.listAgents(rootPath, worldId);
      }
      return [];
    },
    async saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void> {
      await ensureModulesLoaded();
      if (agentStorage?.saveAgent) {
        for (const agent of agents) {
          await agentStorage.saveAgent(rootPath, worldId, agent);
        }
      }
    },
    async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]> {
      await ensureModulesLoaded();
      if (agentStorage?.loadAgent) {
        const agents: Agent[] = [];
        for (const agentId of agentIds) {
          const agent = await agentStorage.loadAgent(rootPath, worldId, agentId);
          if (agent) agents.push(agent);
        }
        return agents;
      }
      return [];
    },
    async validateIntegrity(worldId: string, agentId?: string): Promise<boolean> {
      await ensureModulesLoaded();
      if (agentId) {
        if (agentStorage?.validateAgentIntegrity) {
          const result = await agentStorage.validateAgentIntegrity(rootPath, worldId, agentId);
          return result.isValid;
        }
      } else {
        if (worldStorage?.worldExists) {
          return worldStorage.worldExists(rootPath, worldId);
        }
      }
      return false;
    },
    async repairData(worldId: string, agentId?: string): Promise<boolean> {
      await ensureModulesLoaded();
      if (agentId) {
        if (agentStorage?.repairAgentData) {
          return agentStorage.repairAgentData(rootPath, worldId, agentId);
        }
      }
      return false;
    },

    async saveChatData(worldId: string, chat: Chat): Promise<void> {
      await ensureModulesLoaded();
      if (worldStorage?.saveChatData) {
        return worldStorage.saveChatData(rootPath, worldId, chat);
      }
    },
    async loadChatData(worldId: string, chatId: string): Promise<Chat | null> {
      await ensureModulesLoaded();
      if (worldStorage?.loadChatData) {
        return worldStorage.loadChatData(rootPath, worldId, chatId);
      }
      return null;
    },
    async deleteChatData(worldId: string, chatId: string): Promise<boolean> {
      await ensureModulesLoaded();
      if (worldStorage?.deleteChatData) {
        return worldStorage.deleteChatData(rootPath, worldId, chatId);
      }
      return false;
    },
    async listChats(worldId: string): Promise<Chat[]> {
      await ensureModulesLoaded();
      if (worldStorage?.listChatHistories) {
        return worldStorage.listChatHistories(rootPath, worldId);
      }
      return [];
    },
    async updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<Chat | null> {
      await ensureModulesLoaded();
      if (worldStorage?.updateChatData) {
        return worldStorage.updateChatData(rootPath, worldId, chatId, updates);
      }
      return null;
    },
    async saveWorldChat(worldId: string, chatId: string, chat: WorldChat): Promise<void> {
      await ensureModulesLoaded();
      if (worldStorage?.saveWorldChat) {
        return worldStorage.saveWorldChat(rootPath, worldId, chatId, chat);
      }
    },
    async loadWorldChat(worldId: string, chatId: string): Promise<WorldChat | null> {
      await ensureModulesLoaded();
      if (worldStorage?.loadWorldChat) {
        return worldStorage.loadWorldChat(rootPath, worldId, chatId);
      }
      return null;
    },
    async loadWorldChatFull(worldId: string, chatId: string): Promise<WorldChat | null> {
      await ensureModulesLoaded();
      if (worldStorage?.loadWorldChatFull) {
        return worldStorage.loadWorldChatFull(rootPath, worldId, chatId);
      }
      return null;
    },
    async restoreFromWorldChat(worldId: string, chat: WorldChat): Promise<boolean> {
      await ensureModulesLoaded();
      console.warn('[file-storage] World chat restoration not yet implemented for file storage');
      return false;
    },
    async loadAgentWithRetry(worldId: string, agentId: string, options?: any): Promise<Agent | null> {
      await ensureModulesLoaded();
      let retries = options?.retries || 3;
      while (retries > 0) {
        try {
          const agent = await this.loadAgent(worldId, agentId);
          if (agent) return agent;
        } catch (error) {
          console.warn(`[file-storage] Retry attempt ${retries} failed:`, error);
        }
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, options?.delay || 100));
        }
      }
      return null;
    },

    async agentExists(worldId: string, agentId: string): Promise<boolean> {
      await ensureModulesLoaded();
      try {
        const agent = await this.loadAgent(worldId, agentId);
        return !!agent;
      } catch {
        return false;
      }
    },

    async saveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
      await ensureModulesLoaded();
      // Use the direct saveAgentMemory function to avoid loading the entire agent
      if (agentStorage?.saveAgentMemory) {
        return agentStorage.saveAgentMemory(rootPath, worldId, agentId, memory);
      }
      // Fallback to load-modify-save if direct save not available
      const agent = await this.loadAgent(worldId, agentId);
      if (agent) {
        agent.memory = memory;
        await this.saveAgent(worldId, agent);
      }
    },

    async archiveMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
      await ensureModulesLoaded();
      console.warn('[file-storage] Memory archiving not yet implemented for file storage');
    },

    async worldExists(worldId: string): Promise<boolean> {
      await ensureModulesLoaded();
      if (worldStorage?.worldExists) {
        return worldStorage.worldExists(rootPath, worldId);
      }
      return false;
    },

    async deleteMemoryByChatId(worldId: string, chatId: string): Promise<number> {
      await ensureModulesLoaded();
      if (agentStorage?.deleteMemoryByChatId) {
        return agentStorage.deleteMemoryByChatId(rootPath, worldId, chatId);
      }
      console.warn('[file-storage] Memory deletion by chat ID not available');
      return 0;
    }
  };
}

// Instance caching for performance optimization
const storageCache = new Map<string, StorageAPI>();

// Flag to prevent duplicate log messages
let hasLoggedStorageInit = false;

/**
 * Creates storage with environment-aware wrappers for browser/Node.js compatibility.
 */
export async function createStorageWithWrappers(): Promise<StorageAPI> {
  if (isNodeEnvironment()) {
    const storageInstance = await createStorageFromEnv();
    return createStorageWrappers(storageInstance);
  } else {
    // Use memory storage for non-Node environments (tests, browser)
    const { createMemoryStorage } = await import('./memory-storage.js');
    const memoryStorage = createMemoryStorage();
    return createStorageWrappers(memoryStorage);
  }
}

export async function createStorage(config: StorageConfig): Promise<StorageAPI> {
  const cacheKey = `${config.type}-${config.rootPath}`;
  if (storageCache.has(cacheKey)) {
    return storageCache.get(cacheKey)!;
  }

  let storage: StorageAPI;

  if (config.type === 'memory') {
    // Use memory storage - available in all environments
    const { createMemoryStorage } = await import('./memory-storage.js');
    storage = createMemoryStorage();
  } else if (config.type === 'sqlite') {
    if (!isNodeEnvironment()) {
      throw new Error('SQLite storage not available in browser environment');
    }
    const sqliteConfig: SQLiteConfig = {
      database: config.sqlite?.database || path.join(config.rootPath, 'database.db'),
      enableWAL: config.sqlite?.enableWAL !== false,
      busyTimeout: config.sqlite?.busyTimeout || 30000,
      cacheSize: config.sqlite?.cacheSize || -64000,
      enableForeignKeys: config.sqlite?.enableForeignKeys !== false
    };
    // Use function-based SQLite API with schema initialization
    const {
      createSQLiteStorageContext,
      saveWorld,
      loadWorld,
      deleteWorld,
      listWorlds,
      saveAgent,
      loadAgent,
      deleteAgent,
      listAgents,
      saveAgentsBatch,
      loadAgentsBatch,
      validateIntegrity,
      repairData,
      close,
      getDatabaseStats,
      initializeWithDefaults,
      saveChatData,
      loadChatData,
      deleteChatData,
      listChatHistories,
      updateChatData,
      saveWorldChat,
      loadWorldChat,
      loadWorldChatFull,
      restoreFromWorldChat,
      archiveAgentMemory,
      deleteMemoryByChatId,
      getMemory,
      saveAgentMemory
    } = await import('./sqlite-storage.js');
    const ctx = await createSQLiteStorageContext(sqliteConfig);
    // Note: ensureInitialized is called within sqlite-storage functions, no need to call here
    // Only initialize with defaults if this is a fresh database
    try {
      await initializeWithDefaults(ctx);
    } catch (error) {
      // If initialization fails (e.g., default world already exists), continue anyway
      console.warn('[storage-factory] Warning during default initialization:', error instanceof Error ? error.message : error);
    }
    storage = {
      saveWorld: (worldData: any) => saveWorld(ctx, worldData),
      loadWorld: (worldId: string) => loadWorld(ctx, worldId),
      deleteWorld: (worldId: string) => deleteWorld(ctx, worldId),
      listWorlds: () => listWorlds(ctx),
      saveAgent: (worldId: string, agent: any) => saveAgent(ctx, worldId, agent),
      loadAgent: (worldId: string, agentId: string) => loadAgent(ctx, worldId, agentId),
      deleteAgent: (worldId: string, agentId: string) => deleteAgent(ctx, worldId, agentId),
      listAgents: (worldId: string) => listAgents(ctx, worldId),
      saveAgentsBatch: (worldId: string, agents: any[]) => saveAgentsBatch(ctx, worldId, agents),
      loadAgentsBatch: (worldId: string, agentIds: string[]) => loadAgentsBatch(ctx, worldId, agentIds),
      validateIntegrity: (worldId: string, agentId?: string) => validateIntegrity(ctx, worldId, agentId),
      repairData: (worldId: string, agentId?: string) => repairData(ctx, worldId, agentId),
      saveChatData: (worldId: string, chat: any) => saveChatData(ctx, worldId, chat),
      loadChatData: (worldId: string, chatId: string) => loadChatData(ctx, worldId, chatId),
      deleteChatData: (worldId: string, chatId: string) => deleteChatData(ctx, worldId, chatId),
      listChats: (worldId: string) => listChatHistories(ctx, worldId),
      updateChatData: (worldId: string, chatId: string, updates: any) => updateChatData(ctx, worldId, chatId, updates),
      saveWorldChat: (worldId: string, chatId: string, chat: any) => saveWorldChat(ctx, worldId, chatId, chat),
      loadWorldChat: (worldId: string, chatId: string) => loadWorldChat(ctx, worldId, chatId),
      loadWorldChatFull: (worldId: string, chatId: string) => loadWorldChatFull(ctx, worldId, chatId),
      restoreFromWorldChat: async (worldId: string, chat: any) => {
        return await restoreFromWorldChat(ctx, worldId, chat);
      },

      // Additional methods for consistency with StorageAPI
      worldExists: async (worldId: string) => {
        try {
          const world = await loadWorld(ctx, worldId);
          return !!world;
        } catch {
          return false;
        }
      },

      loadAgentWithRetry: async (worldId: string, agentId: string, options?: any) => {
        let retries = options?.retries || 3;
        while (retries > 0) {
          try {
            const agent = await loadAgent(ctx, worldId, agentId);
            if (agent) return agent;
          } catch (error) {
            console.warn(`[sqlite-storage] Retry attempt ${retries} failed:`, error);
          }
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, options?.delay || 100));
          }
        }
        return null;
      },

      agentExists: async (worldId: string, agentId: string) => {
        try {
          const agent = await loadAgent(ctx, worldId, agentId);
          return !!agent;
        } catch {
          return false;
        }
      },

      saveAgentMemory: async (worldId: string, agentId: string, memory: any[]) => {
        await saveAgentMemory(ctx, worldId, agentId, memory);
      },

      archiveMemory: async (worldId: string, agentId: string, memory: any[]) => {
        await archiveAgentMemory(ctx, worldId, agentId, memory);
      },

      deleteMemoryByChatId: async (worldId: string, chatId: string) => {
        return await deleteMemoryByChatId(ctx, worldId, chatId);
      },

      getMemory: (worldId: string, chatId: string) => getMemory(ctx, worldId, chatId),

      close: () => close(ctx),
      getDatabaseStats: () => getDatabaseStats(ctx)
    } as any;
  } else {
    storage = createFileStorageAdapter(config.rootPath);
  }

  storageCache.set(cacheKey, storage);
  return storage;
}

export function getDefaultRootPath(): string {
  let rootPath = process.env.AGENT_WORLD_DATA_PATH;
  if (!rootPath) {
    // Default to ~/agent-world if not defined
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    rootPath = homeDir ? path.join(homeDir, 'agent-world') : './agent-world';
  }
  // If AGENT_WORLD_DATA_PATH is absolute, use it as-is
  // If relative, resolve relative to current working directory
  if (path.isAbsolute(rootPath)) {
    return rootPath;
  } else {
    // For relative paths, don't use resolve if it's already in the correct format
    if (rootPath === './agent-world') {
      return './agent-world';
    }
    return path.resolve(process.cwd(), rootPath);
  }
}

export async function createStorageFromEnv(): Promise<StorageAPI> {
  const type = (process.env.AGENT_WORLD_STORAGE_TYPE as 'file' | 'sqlite' | 'memory') || 'sqlite';
  const rootPath = getDefaultRootPath();

  // Use a special cache key for environment-based storage
  const envCacheKey = `env-${type}-${rootPath}`;
  if (storageCache.has(envCacheKey)) {
    return storageCache.get(envCacheKey)!;
  }

  // Ensure directory exists (except for memory storage)
  if (isNodeEnvironment() && rootPath && typeof fs.existsSync === 'function' && !fs.existsSync(rootPath) && type !== 'memory') {
    if (typeof fs.mkdirSync === 'function') {
      fs.mkdirSync(rootPath, { recursive: true });
    }
  }

  const config: StorageConfig = {
    type,
    rootPath,
    sqlite: type === 'sqlite'
      ? {
        database: process.env.AGENT_WORLD_SQLITE_DATABASE || path.join(rootPath, 'database.db'),
        enableWAL: process.env.AGENT_WORLD_SQLITE_WAL !== 'false',
        busyTimeout: parseInt(process.env.AGENT_WORLD_SQLITE_TIMEOUT || '30000'),
        cacheSize: parseInt(process.env.AGENT_WORLD_SQLITE_CACHE || '-64000'),
        enableForeignKeys: process.env.AGENT_WORLD_SQLITE_FK !== 'false'
      }
      : undefined
  };

  // Only log on first initialization to avoid duplicate logs
  if (!hasLoggedStorageInit) {
    console.log('🟢 Storage path:', config.rootPath + ' - ' + config.type);
    hasLoggedStorageInit = true;
  }

  const storage = await createStorage(config);
  // Cache with the special environment key
  storageCache.set(envCacheKey, storage);
  return storage;
}
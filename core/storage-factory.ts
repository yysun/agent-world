/**
 * Storage Factory
 *
 * Provides a unified, type-safe interface for file-based and SQLite-based storage backends for agent-world.
 * Handles all environment detection logic and dynamic imports for storage modules.
 *
 * Features:
 * - Environment detection and dynamic loading of storage backends (Node.js vs browser)
 * - Dynamically loads file or SQLite storage based on configuration or environment variables
 * - Caches storage instances for reuse and performance
 * - Provides NoOp implementations for browser environments
 * - Utility functions for migration, cache management, and storage recommendations
 * - Default storage is SQLite in Node.js environments
 * - Full support for chat CRUD and snapshot operations with strict type safety
 * - Delegates all chat operations to backend with proper error handling
 *
 * Implementation:
 * - File storage uses dynamic imports and disk-based JSON files
 * - SQLite storage uses a schema, context, and migration helpers
 * - Browser environments get NoOp implementations that don't perform any storage operations
 * - All environment detection logic centralized here for clean separation of concerns
 * - All chat operations use WorldChat, ChatData, UpdateChatParams, and WorldChat types
 *
 * Changes:
 * - 2025-01-XX: Moved all environment detection logic from managers.ts to here
 * - 2025-07-27: Default storage type changed to SQLite
 * - 2025-08-01: Full chat CRUD and snapshot support, strict type safety for chat operations
 * - See git history for previous changes
 */
import type { StorageManager, StorageAPI, ChatData, UpdateChatParams, WorldChat, Agent, AgentMessage } from './types.js';
import { SQLiteConfig } from './sqlite-schema.js';
import { isNodeEnvironment } from './utils.js';
import * as path from 'path';

// Re-export StorageAPI type for external use
export type { StorageAPI } from './types.js';

export interface StorageConfig {
  type: 'file' | 'sqlite';
  rootPath: string;
  sqlite?: SQLiteConfig;
}

/**
 * StorageWrappers factory function - creates an object that implements StorageAPI and delegates to storage instance
 * This provides a unified interface that works across all storage backends
 */
export function createStorageWrappers(storageInstance: StorageManager | null): StorageAPI {
  return {
    // World operations - standardized naming
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

    // Agent operations - standardized naming
    async saveAgent(worldId: string, agent: any): Promise<void> {
      if (!storageInstance) return;
      return storageInstance.saveAgent(worldId, agent);
    },

    async saveAgentConfig(worldId: string, agent: any): Promise<void> {
      if (!storageInstance) return;
      return storageInstance.saveAgent(worldId, agent);
    },

    async saveAgentMemory(worldId: string, agentId: string, memory: any[]): Promise<void> {
      if (!storageInstance) return;
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

    // Batch operations
    async saveAgentsBatch(worldId: string, agents: any[]): Promise<void> {
      if (!storageInstance) return;
      return storageInstance.saveAgentsBatch(worldId, agents);
    },

    async loadAgentsBatch(worldId: string, agentIds: string[], options?: any): Promise<{ successful: any[]; failed: any[] }> {
      if (!storageInstance) return { successful: [], failed: [] };
      const agents = await storageInstance.loadAgentsBatch(worldId, agentIds);
      return { successful: agents, failed: [] };
    },

    // Chat history operations

    async saveChatData(worldId: string, chat: ChatData): Promise<void> {
      if (!storageInstance) return;
      try {
        return await storageInstance.saveChatData(worldId, chat);
      } catch (err) {
        throw new Error(`Failed to save chat history: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async loadChatData(worldId: string, chatId: string): Promise<ChatData | null> {
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

    async listChats(worldId: string): Promise<ChatData[]> {
      if (!storageInstance) return [];
      try {
        return await storageInstance.listChats(worldId);
      } catch (err) {
        throw new Error(`Failed to list chats: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    async updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<ChatData | null> {
      if (!storageInstance) return null;
      try {
        return await storageInstance.updateChatData(worldId, chatId, updates);
      } catch (err) {
        throw new Error(`Failed to update chat history: ${err instanceof Error ? err.message : String(err)}`);
      }
    },

    // Chat operations
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

    // Integrity operations
    async validateIntegrity(worldId: string, agentId?: string): Promise<{ isValid: boolean }> {
      if (!storageInstance) return { isValid: false };
      const isValid = await storageInstance.validateIntegrity(worldId, agentId);
      return { isValid };
    },

    async repairData(worldId: string, agentId?: string): Promise<boolean> {
      if (!storageInstance) return false;
      return storageInstance.repairData(worldId, agentId);
    },

    async archiveMemory(worldId: string, agentId: string, memory: any[]): Promise<void> {
      if (!storageInstance) return;
      // Try to use the storage instance's archiveAgentMemory if available
      if ('archiveAgentMemory' in storageInstance) {
        return (storageInstance as any).archiveAgentMemory(worldId, agentId, memory);
      } else {
        // Fallback to file storage implementation
        const agentStorage = await import('./agent-storage.js');
      }
    }
  };
}

// File storage implementation adapter (function-based)
function createFileStorageAdapter(rootPath: string): StorageManager {
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
    async saveWorld(worldData: import('./types.js').WorldData): Promise<void> {
      await ensureModulesLoaded();
      if (worldStorage?.saveWorld) {
        return worldStorage.saveWorld(rootPath, worldData);
      }
    },
    async loadWorld(worldId: string): Promise<import('./types.js').WorldData | null> {
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
    async listWorlds(): Promise<import('./types.js').WorldData[]> {
      await ensureModulesLoaded();
      if (worldStorage?.listWorlds) {
        return worldStorage.listWorlds(rootPath);
      }
      return [];
    },
    async saveAgent(worldId: string, agent: Agent): Promise<void> {
      await ensureModulesLoaded();
      if (agentStorage?.saveAgent) {
        return agentStorage.saveAgent(rootPath, worldId, agent);
      }
    },
    async loadAgent(worldId: string, agentId: string): Promise<Agent | null> {
      await ensureModulesLoaded();
      if (agentStorage?.loadAgent) {
        return agentStorage.loadAgent(rootPath, worldId, agentId);
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

    // Chat history operations - now fully supported in file storage
    async saveChatData(worldId: string, chat: ChatData): Promise<void> {
      await ensureModulesLoaded();
      if (worldStorage?.saveChatData) {
        return worldStorage.saveChatData(rootPath, worldId, chat);
      }
    },
    async loadChatData(worldId: string, chatId: string): Promise<ChatData | null> {
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
    async listChats(worldId: string): Promise<ChatData[]> {
      await ensureModulesLoaded();
      if (worldStorage?.listChatHistories) {
        return worldStorage.listChatHistories(rootPath, worldId);
      }
      return [];
    },
    async updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<ChatData | null> {
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
      // File storage doesn't support full chat restoration yet
      // This would require implementing agent restoration logic
      console.warn('[file-storage] World chat restoration not yet implemented for file storage');
      return false;
    }
  };
}

// Simple in-memory cache for storage instances
const storageCache = new Map<string, StorageManager>();

/**
 * Create storage-aware wrapper that handles environment detection
 * Returns StorageAPI object that delegates to appropriate storage instance
 */
export async function createStorageWithWrappers(): Promise<StorageAPI> {
  if (isNodeEnvironment()) {
    // Node.js environment - create actual storage instance
    const storageInstance = await createStorageFromEnv();
    return createStorageWrappers(storageInstance);
  } else {
    // Browser environment - return wrapper with null storage instance (NoOp)
    return createStorageWrappers(null);
  }
}

export async function createStorage(config: StorageConfig): Promise<StorageManager> {
  const cacheKey = `${config.type}-${config.rootPath}`;
  if (storageCache.has(cacheKey)) {
    return storageCache.get(cacheKey)!;
  }

  let storage: StorageManager;

  if (config.type === 'sqlite') {
    if (!isNodeEnvironment()) {
      throw new Error('SQLite storage not available in browser environment');
    }
    const sqliteConfig: SQLiteConfig = {
      database: config.sqlite?.database || path.join(config.rootPath, 'agent-world.db'),
      enableWAL: config.sqlite?.enableWAL !== false,
      busyTimeout: config.sqlite?.busyTimeout || 30000,
      cacheSize: config.sqlite?.cacheSize || -64000,
      enableForeignKeys: config.sqlite?.enableForeignKeys !== false
    };
    // Use function-based API
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
      // Chat history operations
      saveChatData,
      loadChatData,
      deleteChatData,
      listChatHistories,
      updateChatData,
      // Chat operations
      saveWorldChat,
      loadWorldChat,
      loadWorldChatFull,
      restoreFromWorldChat
    } = await import('./sqlite-storage.js');
    const { initializeSchema } = await import('./sqlite-schema.js');
    const ctx = await createSQLiteStorageContext(sqliteConfig);
    // Ensure schema is created before any queries
    await initializeSchema(ctx.schemaCtx);
    await initializeWithDefaults(ctx); // Ensure default world and agent
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
      // Chat history operations
      saveChatData: (worldId: string, chat: any) => saveChatData(ctx, worldId, chat),
      loadChatData: (worldId: string, chatId: string) => loadChatData(ctx, worldId, chatId),
      deleteChatData: (worldId: string, chatId: string) => deleteChatData(ctx, worldId, chatId),
      listChats: (worldId: string) => listChatHistories(ctx, worldId),
      updateChatData: (worldId: string, chatId: string, updates: any) => updateChatData(ctx, worldId, chatId, updates),
      // Chat operations
      saveWorldChat: (worldId: string, chatId: string, chat: any) => saveWorldChat(ctx, worldId, chatId, chat),
      loadWorldChat: (worldId: string, chatId: string) => loadWorldChat(ctx, worldId, chatId),
      loadWorldChatFull: (worldId: string, chatId: string) => loadWorldChatFull(ctx, worldId, chatId),
      restoreFromWorldChat: async (worldId: string, chat: any) => {
        return await restoreFromWorldChat(ctx, worldId, chat);
      },
      close: () => close(ctx),
      getDatabaseStats: () => getDatabaseStats(ctx)
    } as any;
  } else {
    storage = createFileStorageAdapter(config.rootPath);
  }

  storageCache.set(cacheKey, storage);
  return storage;
}

import * as fs from 'fs';

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

export async function createStorageFromEnv(): Promise<StorageManager> {
  // Default to 'sqlite' unless overridden by env
  const type = (process.env.AGENT_WORLD_STORAGE_TYPE as 'file' | 'sqlite') || 'sqlite';
  const rootPath = getDefaultRootPath();
  // Ensure the folder exists
  if (
    isNodeEnvironment() &&
    rootPath &&
    typeof fs.existsSync === 'function' &&
    !fs.existsSync(rootPath)
  ) {
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

  console.log('🟢 Storage path:', config.rootPath);
  return createStorage(config);
}

export function getCachedStorage(type: string, rootPath: string): StorageManager | null {
  const cacheKey = `${type}-${rootPath}`;
  return storageCache.get(cacheKey) || null;
}

export function clearStorageCache(): void {
  storageCache.clear();
}

export async function closeAllStorages(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const storage of storageCache.values()) {
    if ('close' in storage && typeof (storage as any).close === 'function') {
      closePromises.push((storage as any).close());
    }
  }
  await Promise.all(closePromises);
  clearStorageCache();
}

// Utility for recommending storage type
export function getRecommendedStorageType(options: {
  expectedAgentCount?: number;
  expectedArchiveCount?: number;
  requiresSearch?: boolean;
  requiresAnalytics?: boolean;
  performanceCritical?: boolean;
}): 'file' | 'sqlite' {
  const {
    expectedAgentCount = 0,
    expectedArchiveCount = 0,
    requiresSearch = false,
    requiresAnalytics = false,
    performanceCritical = false
  } = options;

  if (
    expectedAgentCount > 10 ||
    expectedArchiveCount > 100 ||
    requiresSearch ||
    requiresAnalytics ||
    performanceCritical
  ) {
    return 'sqlite';
  }
  return 'file';
}

// Migration helper
export async function needsStorageMigration(
  fromConfig: StorageConfig,
  toConfig: StorageConfig
): Promise<boolean> {
  if (fromConfig.type === toConfig.type) {
    return false;
  }
  try {
    const sourceStorage = await createStorage(fromConfig);
    const worlds = await sourceStorage.listWorlds();
    return worlds.length > 0;
  } catch {
    return false;
  }
}

// Default config (for reference)
export const DEFAULT_STORAGE_CONFIG: Partial<StorageConfig> = {
  type: 'sqlite',
  sqlite: {
    database: 'agent-world.db',
    enableWAL: true,
    busyTimeout: 30000,
    cacheSize: -64000,
    enableForeignKeys: true
  }
};
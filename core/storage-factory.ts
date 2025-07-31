/**
 * Storage Factory
 *
 * Provides a unified interface for file-based and SQLite-based storage backends for agent-world.
 * Handles all environment detection logic and dynamic imports for storage modules.
 *
 * Features:
 * - Environment detection and dynamic loading of storage backends based on Node.js vs browser
 * - Dynamically loads file or SQLite storage based on configuration or environment variables
 * - Caches storage instances for reuse and performance
 * - Provides NoOp implementations for browser environments
 * - Utility functions for migration, cache management, and storage recommendations
 * - Default storage is SQLite in Node.js environments
 *
 * Implementation:
 * - File storage uses dynamic imports and disk-based JSON files
 * - SQLite storage uses a schema, context, and migration helpers
 * - Browser environments get NoOp implementations that don't perform any storage operations
 * - All environment detection logic centralized here for clean separation of concerns
 *
 * Changes:
 * - 2025-01-XX: Moved all environment detection logic from managers.ts to here
 * - 2025-07-27: Default storage type changed to SQLite
 * - See git history for previous changes
 */
import type { StorageManager, StorageAPI } from './types.js';
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

    // Chat operations
    async saveChat(worldId: string, chat: any): Promise<void> {
      if (!storageInstance) return;
      return storageInstance.saveChat(worldId, chat);
    },

    async loadChat(worldId: string, chatId: string): Promise<any> {
      if (!storageInstance) return null;
      return storageInstance.loadChat(worldId, chatId);
    },

    async deleteChat(worldId: string, chatId: string): Promise<boolean> {
      if (!storageInstance) return false;
      return storageInstance.deleteChat(worldId, chatId);
    },

    async listChats(worldId: string): Promise<any[]> {
      if (!storageInstance) return [];
      return storageInstance.listChats(worldId);
    },

    async updateChat(worldId: string, chatId: string, updates: any): Promise<any> {
      if (!storageInstance) return null;
      return storageInstance.updateChat(worldId, chatId, updates);
    },

    // Snapshot operations
    async saveSnapshot(worldId: string, chatId: string, snapshot: any): Promise<void> {
      if (!storageInstance) return;
      return storageInstance.saveSnapshot(worldId, chatId, snapshot);
    },

    async loadSnapshot(worldId: string, chatId: string): Promise<any> {
      if (!storageInstance) return null;
      return storageInstance.loadSnapshot(worldId, chatId);
    },

    async restoreFromSnapshot(worldId: string, snapshot: any): Promise<boolean> {
      if (!storageInstance) return false;
      return storageInstance.restoreFromSnapshot(worldId, snapshot);
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
    async saveWorld(worldData: any): Promise<void> {
      await ensureModulesLoaded();
      if (worldStorage?.saveWorld) {
        return worldStorage.saveWorld(rootPath, worldData);
      }
    },
    async loadWorld(worldId: string): Promise<any> {
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
    async listWorlds(): Promise<any[]> {
      await ensureModulesLoaded();
      if (worldStorage?.listWorlds) {
        return worldStorage.listWorlds(rootPath);
      }
      return [];
    },
    async saveAgent(worldId: string, agent: any): Promise<void> {
      await ensureModulesLoaded();
      if (agentStorage?.saveAgent) {
        return agentStorage.saveAgent(rootPath, worldId, agent);
      }
    },
    async loadAgent(worldId: string, agentId: string): Promise<any> {
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
    async listAgents(worldId: string): Promise<any[]> {
      await ensureModulesLoaded();
      if (agentStorage?.listAgents) {
        return agentStorage.listAgents(rootPath, worldId);
      }
      return [];
    },
    async saveAgentsBatch(worldId: string, agents: any[]): Promise<void> {
      await ensureModulesLoaded();
      if (agentStorage?.saveAgent) {
        for (const agent of agents) {
          await agentStorage.saveAgent(rootPath, worldId, agent);
        }
      }
    },
    async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<any[]> {
      await ensureModulesLoaded();
      if (agentStorage?.loadAgent) {
        const agents: any[] = [];
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

    // Chat operations (file storage doesn't support chats yet)
    async saveChat(worldId: string, chat: any): Promise<void> {
      throw new Error('Chat operations not supported in file storage backend');
    },
    async loadChat(worldId: string, chatId: string): Promise<any> {
      return null;
    },
    async deleteChat(worldId: string, chatId: string): Promise<boolean> {
      return false;
    },
    async listChats(worldId: string): Promise<any[]> {
      return [];
    },
    async updateChat(worldId: string, chatId: string, updates: any): Promise<any> {
      return null;
    },
    async saveSnapshot(worldId: string, chatId: string, snapshot: any): Promise<void> {
      // No-op for file storage
    },
    async loadSnapshot(worldId: string, chatId: string): Promise<any> {
      return null;
    },
    async restoreFromSnapshot(worldId: string, snapshot: any): Promise<boolean> {
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
      // Chat operations
      saveChat,
      loadChat,
      deleteChat,
      listChats,
      updateChat,
      saveSnapshot,
      loadSnapshot
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
      // Chat operations
      saveChat: (worldId: string, chat: any) => saveChat(ctx, worldId, chat),
      loadChat: (worldId: string, chatId: string) => loadChat(ctx, worldId, chatId),
      deleteChat: (worldId: string, chatId: string) => deleteChat(ctx, worldId, chatId),
      listChats: (worldId: string) => listChats(ctx, worldId),
      updateChat: (worldId: string, chatId: string, updates: any) => updateChat(ctx, worldId, chatId, updates),
      saveSnapshot: (worldId: string, chatId: string, snapshot: any) => saveSnapshot(ctx, worldId, chatId, snapshot),
      loadSnapshot: (worldId: string, chatId: string) => loadSnapshot(ctx, worldId, chatId),
      restoreFromSnapshot: async (worldId: string, snapshot: any) => {
        // TODO: Implement snapshot restore logic
        return false;
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
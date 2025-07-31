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
import type { StorageManager } from './types.js';
// Interface for storage wrapper functions and instance
export interface StorageWrappers {
  storageInstance: StorageManager | null;
  saveWorldToDisk: (rootPath: string, worldData: any) => Promise<void>;
  loadWorldFromDisk: (rootPath: string, worldId: string) => Promise<any>;
  deleteWorldFromDisk: (rootPath: string, worldId: string) => Promise<boolean>;
  loadAllWorldsFromDisk: (rootPath: string) => Promise<any[]>;
  worldExistsOnDisk: (rootPath: string, worldId: string) => Promise<boolean>;
  loadAllAgentsFromDisk: (rootPath: string, worldId: string) => Promise<any[]>;
  saveAgentConfigToDisk: (rootPath: string, worldId: string, agent: any) => Promise<void>;
  saveAgentToDisk: (rootPath: string, worldId: string, agent: any) => Promise<void>;
  saveAgentMemoryToDisk: (rootPath: string, worldId: string, agentId: string, memory: any[]) => Promise<void>;
  loadAgentFromDisk: (rootPath: string, worldId: string, agentId: string) => Promise<any>;
  loadAgentFromDiskWithRetry: (rootPath: string, worldId: string, agentId: string, options?: any) => Promise<any>;
  deleteAgentFromDisk: (rootPath: string, worldId: string, agentId: string) => Promise<boolean>;
  loadAllAgentsFromDiskBatch: (rootPath: string, worldId: string, options?: any) => Promise<{ successful: any[]; failed: any[] }>;
  agentExistsOnDisk: (rootPath: string, worldId: string, agentId: string) => Promise<boolean>;
  validateAgentIntegrity: (rootPath: string, worldId: string, agentId: string) => Promise<{ isValid: boolean }>;
  repairAgentData: (rootPath: string, worldId: string, agentId: string) => Promise<boolean>;
  archiveAgentMemory: (rootPath: string, worldId: string, agentId: string, memory: any[]) => Promise<any>;
  // Chat operations
  saveChat: (rootPath: string, worldId: string, chat: any) => Promise<void>;
  loadChat: (rootPath: string, worldId: string, chatId: string) => Promise<any>;
  deleteChat: (rootPath: string, worldId: string, chatId: string) => Promise<boolean>;
  listChats: (rootPath: string, worldId: string) => Promise<any[]>;
  updateChat: (rootPath: string, worldId: string, chatId: string, updates: any) => Promise<any>;
  saveSnapshot: (rootPath: string, worldId: string, chatId: string, snapshot: any) => Promise<void>;
  loadSnapshot: (rootPath: string, worldId: string, chatId: string) => Promise<any>;
}
import { SQLiteConfig } from './sqlite-schema.js';
import { isNodeEnvironment } from './utils.js';
import * as path from 'path';

export interface StorageConfig {
  type: 'file' | 'sqlite';
  rootPath: string;
  sqlite?: SQLiteConfig;
}

// File storage implementation wrapper (function-based)
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
      if (worldStorage?.saveWorldToDisk) {
        return worldStorage.saveWorldToDisk(rootPath, worldData);
      }
    },
    async loadWorld(worldId: string): Promise<any> {
      await ensureModulesLoaded();
      if (worldStorage?.loadWorldFromDisk) {
        return worldStorage.loadWorldFromDisk(rootPath, worldId);
      }
      return null;
    },
    async deleteWorld(worldId: string): Promise<boolean> {
      await ensureModulesLoaded();
      if (worldStorage?.deleteWorldFromDisk) {
        return worldStorage.deleteWorldFromDisk(rootPath, worldId);
      }
      return false;
    },
    async listWorlds(): Promise<any[]> {
      await ensureModulesLoaded();
      if (worldStorage?.loadAllWorldsFromDisk) {
        return worldStorage.loadAllWorldsFromDisk(rootPath);
      }
      return [];
    },
    async saveAgent(worldId: string, agent: any): Promise<void> {
      await ensureModulesLoaded();
      if (agentStorage?.saveAgentToDisk) {
        return agentStorage.saveAgentToDisk(rootPath, worldId, agent);
      }
    },
    async loadAgent(worldId: string, agentId: string): Promise<any> {
      await ensureModulesLoaded();
      if (agentStorage?.loadAgentFromDisk) {
        return agentStorage.loadAgentFromDisk(rootPath, worldId, agentId);
      }
      return null;
    },
    async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
      await ensureModulesLoaded();
      if (agentStorage?.deleteAgentFromDisk) {
        return agentStorage.deleteAgentFromDisk(rootPath, worldId, agentId);
      }
      return false;
    },
    async listAgents(worldId: string): Promise<any[]> {
      await ensureModulesLoaded();
      if (agentStorage?.loadAllAgentsFromDisk) {
        return agentStorage.loadAllAgentsFromDisk(rootPath, worldId);
      }
      return [];
    },
    async saveAgentsBatch(worldId: string, agents: any[]): Promise<void> {
      await ensureModulesLoaded();
      if (agentStorage?.saveAgentToDisk) {
        for (const agent of agents) {
          await agentStorage.saveAgentToDisk(rootPath, worldId, agent);
        }
      }
    },
    async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<any[]> {
      await ensureModulesLoaded();
      if (agentStorage?.loadAgentFromDisk) {
        const agents: any[] = [];
        for (const agentId of agentIds) {
          const agent = await agentStorage.loadAgentFromDisk(rootPath, worldId, agentId);
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
        if (worldStorage?.worldExistsOnDisk) {
          return worldStorage.worldExistsOnDisk(rootPath, worldId);
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
      // TODO: Implement file-based chat storage if needed
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
 * Create storage-aware function wrappers that handle environment detection
 * Returns NoOp implementations for browser environments
 */
export async function createStorageWithWrappers(): Promise<StorageWrappers> {
  if (isNodeEnvironment()) {
    // Node.js environment - create actual storage instance
    const storageInstance = await createStorageFromEnv();

    return {
      storageInstance,
      // Storage wrappers that use the storage instance
      saveWorldToDisk: async (_rootPath: string, worldData: any) => storageInstance.saveWorld(worldData),
      loadWorldFromDisk: async (_rootPath: string, worldId: string) => storageInstance.loadWorld(worldId),
      deleteWorldFromDisk: async (_rootPath: string, worldId: string) => storageInstance.deleteWorld(worldId),
      loadAllWorldsFromDisk: async (_rootPath: string) => storageInstance.listWorlds(),
      worldExistsOnDisk: async (_rootPath: string, worldId: string) => {
        try { return !!(await storageInstance.loadWorld(worldId)); } catch { return false; }
      },
      loadAllAgentsFromDisk: async (_rootPath: string, worldId: string) => storageInstance.listAgents(worldId),
      saveAgentConfigToDisk: async (_rootPath: string, worldId: string, agent: any) => storageInstance.saveAgent(worldId, agent),
      saveAgentToDisk: async (_rootPath: string, worldId: string, agent: any) => storageInstance.saveAgent(worldId, agent),
      saveAgentMemoryToDisk: async (_rootPath: string, worldId: string, agentId: string, memory: any[]) => {
        const agent = await storageInstance.loadAgent(worldId, agentId);
        if (agent) { agent.memory = memory; return storageInstance.saveAgent(worldId, agent); }
      },
      loadAgentFromDisk: async (_rootPath: string, worldId: string, agentId: string) => storageInstance.loadAgent(worldId, agentId),
      loadAgentFromDiskWithRetry: async (_rootPath: string, worldId: string, agentId: string, _options?: any) => storageInstance.loadAgent(worldId, agentId),
      deleteAgentFromDisk: async (_rootPath: string, worldId: string, agentId: string) => storageInstance.deleteAgent(worldId, agentId),
      loadAllAgentsFromDiskBatch: async (_rootPath: string, worldId: string, _options?: any) => {
        const agents = await storageInstance.listAgents(worldId);
        return { successful: agents, failed: [] };
      },
      agentExistsOnDisk: async (_rootPath: string, worldId: string, agentId: string) => {
        try { return !!(await storageInstance.loadAgent(worldId, agentId)); } catch { return false; }
      },
      validateAgentIntegrity: async (_rootPath: string, worldId: string, agentId: string) => {
        const isValid = await storageInstance.validateIntegrity(worldId, agentId);
        return { isValid };
      },
      repairAgentData: async (_rootPath: string, worldId: string, agentId: string) => storageInstance.repairData(worldId, agentId),
      archiveAgentMemory: async (_rootPath: string, worldId: string, agentId: string, memory: any[]) => {
        if ('archiveAgentMemory' in storageInstance) {
          return (storageInstance as any).archiveAgentMemory(worldId, agentId, memory);
        } else {
          const agentStorage = await import('./agent-storage.js');
          return agentStorage.archiveAgentMemory((storageInstance as any).rootPath, worldId, agentId, memory);
        }
      },
      // Chat operations
      saveChat: async (_rootPath: string, worldId: string, chat: any) => {
        if ('saveChat' in storageInstance) {
          return (storageInstance as any).saveChat(worldId, chat);
        }
        throw new Error('Chat operations not supported in this storage backend');
      },
      loadChat: async (_rootPath: string, worldId: string, chatId: string) => {
        if ('loadChat' in storageInstance) {
          return (storageInstance as any).loadChat(worldId, chatId);
        }
        return null;
      },
      deleteChat: async (_rootPath: string, worldId: string, chatId: string) => {
        if ('deleteChat' in storageInstance) {
          return (storageInstance as any).deleteChat(worldId, chatId);
        }
        return false;
      },
      listChats: async (_rootPath: string, worldId: string) => {
        if ('listChats' in storageInstance) {
          return (storageInstance as any).listChats(worldId);
        }
        return [];
      },
      updateChat: async (_rootPath: string, worldId: string, chatId: string, updates: any) => {
        if ('updateChat' in storageInstance) {
          return (storageInstance as any).updateChat(worldId, chatId, updates);
        }
        return null;
      },
      saveSnapshot: async (_rootPath: string, worldId: string, chatId: string, snapshot: any) => {
        if ('saveSnapshot' in storageInstance) {
          return (storageInstance as any).saveSnapshot(worldId, chatId, snapshot);
        }
      },
      loadSnapshot: async (_rootPath: string, worldId: string, chatId: string) => {
        if ('loadSnapshot' in storageInstance) {
          return (storageInstance as any).loadSnapshot(worldId, chatId);
        }
        return null;
      }
    };
  } else {
    // Browser environment - return NoOp implementations
    const noOpAsync = async () => { };
    const noOpAsyncReturn = async () => null;
    const noOpAsyncReturnFalse = async () => false;
    const noOpAsyncReturnEmptyArray = async () => [];
    const noOpAsyncReturnBatchResult = async () => ({ successful: [], failed: [] });
    const noOpAsyncReturnValidation = async () => ({ isValid: false });

    return {
      storageInstance: null,
      saveWorldToDisk: noOpAsync,
      loadWorldFromDisk: noOpAsyncReturn,
      deleteWorldFromDisk: noOpAsyncReturnFalse,
      loadAllWorldsFromDisk: noOpAsyncReturnEmptyArray,
      worldExistsOnDisk: noOpAsyncReturnFalse,
      loadAllAgentsFromDisk: noOpAsyncReturnEmptyArray,
      saveAgentConfigToDisk: noOpAsync,
      saveAgentToDisk: noOpAsync,
      saveAgentMemoryToDisk: noOpAsync,
      loadAgentFromDisk: noOpAsyncReturn,
      loadAgentFromDiskWithRetry: noOpAsyncReturn,
      deleteAgentFromDisk: noOpAsyncReturnFalse,
      loadAllAgentsFromDiskBatch: noOpAsyncReturnBatchResult,
      agentExistsOnDisk: noOpAsyncReturnFalse,
      validateAgentIntegrity: noOpAsyncReturnValidation,
      repairAgentData: noOpAsyncReturnFalse,
      archiveAgentMemory: noOpAsyncReturn,
      // Chat operations (NoOp)
      saveChat: noOpAsync,
      loadChat: noOpAsyncReturn,
      deleteChat: noOpAsyncReturnFalse,
      listChats: noOpAsyncReturnEmptyArray,
      updateChat: noOpAsyncReturn,
      saveSnapshot: noOpAsync,
      loadSnapshot: noOpAsyncReturn
    };
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
  } else {
    rootPath = path.resolve(process.cwd(), rootPath);
  }
  return rootPath;
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
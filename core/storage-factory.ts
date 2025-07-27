// ...existing code...
import type { StorageManager } from './types';
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
    }
  };
}

// Simple in-memory cache for storage instances
const storageCache = new Map<string, StorageManager>();

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
      getDatabaseStats
    } = await import('./sqlite-storage.js');
    const ctx = createSQLiteStorageContext(sqliteConfig);
    // Eagerly initialize
    await getDatabaseStats(ctx); // This will trigger schema init
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
      close: () => close(ctx),
      getDatabaseStats: () => getDatabaseStats(ctx)
    } as any;
  } else {
    storage = createFileStorageAdapter(config.rootPath);
  }

  storageCache.set(cacheKey, storage);
  return storage;
}

export async function createStorageFromEnv(): Promise<StorageManager> {
  const type = (process.env.AGENT_WORLD_STORAGE_TYPE as 'file' | 'sqlite') || 'file';
  const rootPath = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

  const config: StorageConfig = {
    type,
    rootPath,
    sqlite: type === 'sqlite'
      ? {
        database: process.env.AGENT_WORLD_SQLITE_DATABASE || './data/database.db',
        enableWAL: process.env.AGENT_WORLD_SQLITE_WAL !== 'false',
        busyTimeout: parseInt(process.env.AGENT_WORLD_SQLITE_TIMEOUT || '30000'),
        cacheSize: parseInt(process.env.AGENT_WORLD_SQLITE_CACHE || '-64000'),
        enableForeignKeys: process.env.AGENT_WORLD_SQLITE_FK !== 'false'
      }
      : undefined
  };

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
  type: 'file',
  sqlite: {
    database: 'agent-world.db',
    enableWAL: true,
    busyTimeout: 30000,
    cacheSize: -64000,
    enableForeignKeys: true
  }
};
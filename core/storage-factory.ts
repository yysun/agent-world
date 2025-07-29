/**
 * Storage Factory
 *
 * Provides a unified interface for file-based and SQLite-based storage backends for agent-world.
 * Handles all environment detection logic for the core module architecture.
 *
 * Features:
 * - Runtime environment detection (Node.js vs browser) with appropriate backend selection
 * - Dynamically loads file or SQLite storage based on configuration and environment
 * - Provides NoOp implementations for browser environments to maintain compatibility
 * - Caches storage instances for reuse and performance
 * - Utility functions for migration, cache management, and storage recommendations
 * - Default storage is SQLite for Node.js environments
 * - Consolidates all module initialization with environment-specific implementations
 *
 * Implementation:
 * - Node.js: File storage uses dynamic imports and disk-based JSON files; SQLite uses schema and migrations
 * - Browser: Provides NoOp implementations for all storage and utility functions
 * - Exposes createUtilityModules() for environment-aware loading of utils, events, and llm-manager
 * - Centralizes environment detection that was previously scattered across managers.ts
 *
 * Architecture Changes:
 * - 2025-01-XX: Moved all environment detection logic from managers.ts to storage-factory.ts
 * - 2025-01-XX: Added createUtilityModules() to provide environment-aware utility function loading
 * - 2025-01-XX: Added browser-compatible NoOp implementations for all storage and utility operations
 * - 2025-07-27: Default storage type changed to SQLite
 * - See git history for previous changes
 */
import type { StorageManager } from './types.js';
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
        // Provide NoOp implementations for browser environment
        worldStorage = {
          saveWorldToDisk: async () => {},
          loadWorldFromDisk: async () => null,
          deleteWorldFromDisk: async () => false,
          loadAllWorldsFromDisk: async () => [],
          worldExistsOnDisk: async () => false
        };
        agentStorage = {
          saveAgentToDisk: async () => {},
          loadAgentFromDisk: async () => null,
          deleteAgentFromDisk: async () => false,
          loadAllAgentsFromDisk: async () => [],
          validateAgentIntegrity: async () => ({ isValid: false }),
          repairAgentData: async () => false,
          archiveAgentMemory: async () => {}
        };
        return;
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

// Browser-compatible NoOp storage implementation
function createBrowserCompatibleStorage(): StorageManager {
  return {
    async saveWorld(worldData: any): Promise<void> {
      // NoOp in browser
    },
    async loadWorld(worldId: string): Promise<any> {
      return null;
    },
    async deleteWorld(worldId: string): Promise<boolean> {
      return false;
    },
    async listWorlds(): Promise<any[]> {
      return [];
    },
    async saveAgent(worldId: string, agent: any): Promise<void> {
      // NoOp in browser
    },
    async loadAgent(worldId: string, agentId: string): Promise<any> {
      return null;
    },
    async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
      return false;
    },
    async listAgents(worldId: string): Promise<any[]> {
      return [];
    },
    async saveAgentsBatch(worldId: string, agents: any[]): Promise<void> {
      // NoOp in browser
    },
    async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<any[]> {
      return [];
    },
    async validateIntegrity(worldId: string, agentId?: string): Promise<boolean> {
      return false;
    },
    async repairData(worldId: string, agentId?: string): Promise<boolean> {
      return false;
    }
  };
}

export async function createStorage(config: StorageConfig): Promise<StorageManager> {
  const cacheKey = `${config.type}-${config.rootPath}`;
  if (storageCache.has(cacheKey)) {
    return storageCache.get(cacheKey)!;
  }

  let storage: StorageManager;

  if (config.type === 'sqlite') {
    if (!isNodeEnvironment()) {
      // Provide NoOp SQLite implementation for browser environment
      storage = createBrowserCompatibleStorage();
    } else {
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
        initializeWithDefaults
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
        close: () => close(ctx),
        getDatabaseStats: () => getDatabaseStats(ctx)
      } as any;
    }
  } else {
    storage = createFileStorageAdapter(config.rootPath);
  }

  storageCache.set(cacheKey, storage);
  return storage;
}

import * as fs from 'fs';

export function getDefaultRootPath(): string {
  if (!isNodeEnvironment()) {
    // In browser environment, return a dummy path
    return '/browser-storage';
  }
  
  let rootPath = process.env.AGENT_WORLD_DATA_PATH;
  if (!rootPath) {
    // Default to ~/agent-world if not defined
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    rootPath = homeDir ? path.join(homeDir, 'agent-world') : './agent-world';
  }
  return rootPath;
}

export async function createStorageFromEnv(): Promise<StorageManager> {
  // Check environment first
  if (!isNodeEnvironment()) {
    // In browser environment, return NoOp storage
    return createBrowserCompatibleStorage();
  }

  // Default to 'sqlite' unless overridden by env
  const type = (process.env.AGENT_WORLD_STORAGE_TYPE as 'file' | 'sqlite') || 'sqlite';
  const rootPath = getDefaultRootPath();
  // Ensure the folder exists
  if (
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

// Create utility modules with environment detection
export async function createUtilityModules() {
  if (!isNodeEnvironment()) {
    // Browser NoOp implementations
    return {
      extractMentions: () => [],
      extractParagraphBeginningMentions: () => [],
      determineSenderType: () => 'human',
      shouldAutoMention: () => false,
      addAutoMention: (response: string) => response,
      removeSelfMentions: (response: string) => response,
      publishMessage: () => {},
      subscribeToMessages: () => () => {},
      broadcastToWorld: () => {},
      publishSSE: () => {},
      subscribeToSSE: () => () => {},
      subscribeAgentToMessages: () => () => {},
      shouldAgentRespond: () => false,
      processAgentMessage: () => Promise.resolve(),
      generateAgentResponse: () => Promise.resolve(''),
      streamAgentResponse: () => Promise.resolve(''),
      archiveAgentMemory: () => Promise.resolve()
    };
  }

  // Node.js implementations
  const utils = await import('./utils.js');
  const events = await import('./events.js');
  const llmManager = await import('./llm-manager.js');
  const agentStorage = await import('./agent-storage.js');

  return {
    extractMentions: utils.extractMentions,
    extractParagraphBeginningMentions: utils.extractParagraphBeginningMentions,
    determineSenderType: utils.determineSenderType,
    shouldAutoMention: events.shouldAutoMention,
    addAutoMention: events.addAutoMention,
    removeSelfMentions: events.removeSelfMentions,
    publishMessage: events.publishMessage,
    subscribeToMessages: events.subscribeToMessages,
    broadcastToWorld: events.broadcastToWorld,
    publishSSE: events.publishSSE,
    subscribeToSSE: events.subscribeToSSE,
    subscribeAgentToMessages: events.subscribeAgentToMessages,
    shouldAgentRespond: events.shouldAgentRespond,
    processAgentMessage: events.processAgentMessage,
    generateAgentResponse: llmManager.generateAgentResponse,
    streamAgentResponse: llmManager.streamAgentResponse,
    archiveAgentMemory: agentStorage.archiveAgentMemory
  };
}
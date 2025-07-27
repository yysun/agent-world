/**
 * Storage Factory - Choose Between File and SQLite Storage Backends
 *
 * Features:
 * - Factory pattern for storage backend selection
 * - Configuration-driven storage backend switching
 * - Maintains interface compatibility with existing managers
 * - Environment-based configuration support
 * - Graceful fallback to file storage for browser environments
 *
 * Storage Backends:
 * - File-based storage: Original JSON file implementation
 * - SQLite storage: Enhanced database backend with archive features
 *
 * Configuration:
 * - Environment variable: AGENT_WORLD_STORAGE_TYPE (file|sqlite)
 * - Configuration file: storage.type in world config
 * - Runtime parameter: explicit backend selection
 *
 * Implementation:
 * - Maintains StorageManager interface compatibility
 * - Provides seamless switching between backends
 * - Includes migration support for backend transitions
 * - Browser-safe fallback patterns
 */

import type { StorageManager } from './types';
import { SQLiteStorage } from './sqlite-storage.js';
import { SQLiteConfig } from './sqlite-schema.js';
import { isNodeEnvironment } from './utils.js';
import * as path from 'path';

/**
 * Storage configuration options
 */
export interface StorageConfig {
  type: 'file' | 'sqlite';
  rootPath: string;
  sqlite?: SQLiteConfig;
}

/**
 * File storage implementation wrapper
 * Creates a StorageManager that uses the existing file-based storage functions
 */
class FileStorageAdapter implements StorageManager {
  private rootPath: string;
  private worldStorage: any;
  private agentStorage: any;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  private async ensureModulesLoaded() {
    if (!this.worldStorage || !this.agentStorage) {
      if (!isNodeEnvironment()) {
        throw new Error('File storage not available in browser environment');
      }

      // Dynamic imports for Node.js environment
      this.worldStorage = await import('./world-storage.js');
      this.agentStorage = await import('./agent-storage.js');
    }
  }

  // World operations
  async saveWorld(worldData: any): Promise<void> {
    await this.ensureModulesLoaded();
    return this.worldStorage.saveWorldToDisk(this.rootPath, worldData);
  }

  async loadWorld(worldId: string): Promise<any> {
    await this.ensureModulesLoaded();
    return this.worldStorage.loadWorldFromDisk(this.rootPath, worldId);
  }

  async deleteWorld(worldId: string): Promise<boolean> {
    await this.ensureModulesLoaded();
    return this.worldStorage.deleteWorldFromDisk(this.rootPath, worldId);
  }

  async listWorlds(): Promise<any[]> {
    await this.ensureModulesLoaded();
    return this.worldStorage.loadAllWorldsFromDisk(this.rootPath);
  }

  // Agent operations
  async saveAgent(worldId: string, agent: any): Promise<void> {
    await this.ensureModulesLoaded();
    return this.agentStorage.saveAgentToDisk(this.rootPath, worldId, agent);
  }

  async loadAgent(worldId: string, agentId: string): Promise<any> {
    await this.ensureModulesLoaded();
    const agentData = await this.agentStorage.loadAgentFromDisk(this.rootPath, worldId, agentId);
    return agentData;
  }

  async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
    await this.ensureModulesLoaded();
    return this.agentStorage.deleteAgentFromDisk(this.rootPath, worldId, agentId);
  }

  async listAgents(worldId: string): Promise<any[]> {
    await this.ensureModulesLoaded();
    return this.agentStorage.loadAllAgentsFromDisk(this.rootPath, worldId);
  }

  // Batch operations
  async saveAgentsBatch(worldId: string, agents: any[]): Promise<void> {
    await this.ensureModulesLoaded();
    for (const agent of agents) {
      await this.agentStorage.saveAgentToDisk(this.rootPath, worldId, agent);
    }
  }

  async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<any[]> {
    await this.ensureModulesLoaded();
    const agents: any[] = [];
    for (const agentId of agentIds) {
      const agent = await this.agentStorage.loadAgentFromDisk(this.rootPath, worldId, agentId);
      if (agent) agents.push(agent);
    }
    return agents;
  }

  // Integrity operations
  async validateIntegrity(worldId: string, agentId?: string): Promise<boolean> {
    await this.ensureModulesLoaded();
    
    if (agentId) {
      const result = await this.agentStorage.validateAgentIntegrity(this.rootPath, worldId, agentId);
      return result.isValid;
    } else {
      return this.worldStorage.worldExistsOnDisk(this.rootPath, worldId);
    }
  }

  async repairData(worldId: string, agentId?: string): Promise<boolean> {
    await this.ensureModulesLoaded();
    
    if (agentId) {
      return this.agentStorage.repairAgentData(this.rootPath, worldId, agentId);
    }
    return false; // World repair not implemented for file storage
  }
}

/**
 * Storage factory for creating appropriate storage backend
 */
export class StorageFactory {
  private static instances = new Map<string, StorageManager>();

  /**
   * Create storage manager based on configuration
   */
  static async createStorage(config: StorageConfig): Promise<StorageManager> {
    const cacheKey = `${config.type}-${config.rootPath}`;
    
    // Return cached instance if available
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey)!;
    }

    let storage: StorageManager;

    switch (config.type) {
      case 'sqlite':
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
        
        storage = new SQLiteStorage(sqliteConfig);
        await (storage as SQLiteStorage).initialize();
        break;

      case 'file':
      default:
        storage = new FileStorageAdapter(config.rootPath);
        break;
    }

    // Cache the instance
    this.instances.set(cacheKey, storage);
    return storage;
  }

  /**
   * Create storage from environment configuration
   */
  static async createFromEnvironment(rootPath: string): Promise<StorageManager> {
    const storageType = process.env.AGENT_WORLD_STORAGE_TYPE as 'file' | 'sqlite' || 'file';
    
    const config: StorageConfig = {
      type: storageType,
      rootPath,
      sqlite: storageType === 'sqlite' ? {
        database: process.env.AGENT_WORLD_SQLITE_DATABASE || path.join(rootPath, 'agent-world.db'),
        enableWAL: process.env.AGENT_WORLD_SQLITE_WAL !== 'false',
        busyTimeout: parseInt(process.env.AGENT_WORLD_SQLITE_TIMEOUT || '30000'),
        cacheSize: parseInt(process.env.AGENT_WORLD_SQLITE_CACHE || '-64000'),
        enableForeignKeys: process.env.AGENT_WORLD_SQLITE_FK !== 'false'
      } : undefined
    };

    return this.createStorage(config);
  }

  /**
   * Create storage from configuration file
   */
  static async createFromConfig(rootPath: string, configPath?: string): Promise<StorageManager> {
    if (!isNodeEnvironment()) {
      // Browser fallback - use file storage adapter (which will throw appropriate error)
      return this.createStorage({ type: 'file', rootPath });
    }

    try {
      const fs = await import('fs');
      const configFilePath = configPath || path.join(rootPath, 'storage-config.json');
      
      if (fs.existsSync(configFilePath)) {
        const configData = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
        const config: StorageConfig = {
          type: configData.type || 'file',
          rootPath,
          sqlite: configData.sqlite
        };
        return this.createStorage(config);
      }
    } catch (error) {
      // Fall back to environment configuration
    }

    return this.createFromEnvironment(rootPath);
  }

  /**
   * Get cached storage instance
   */
  static getCachedStorage(type: string, rootPath: string): StorageManager | null {
    const cacheKey = `${type}-${rootPath}`;
    return this.instances.get(cacheKey) || null;
  }

  /**
   * Clear cached storage instances
   */
  static clearCache(): void {
    this.instances.clear();
  }

  /**
   * Close all cached storage instances
   */
  static async closeAll(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    
    for (const storage of this.instances.values()) {
      if ('close' in storage && typeof storage.close === 'function') {
        closePromises.push(storage.close());
      }
    }

    await Promise.all(closePromises);
    this.clearCache();
  }
}

/**
 * Utility function to determine optimal storage type based on environment and usage
 */
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

  // Recommend SQLite for larger datasets or advanced features
  if (
    expectedAgentCount > 10 ||
    expectedArchiveCount > 100 ||
    requiresSearch ||
    requiresAnalytics ||
    performanceCritical
  ) {
    return 'sqlite';
  }

  // Default to file storage for simple use cases
  return 'file';
}

/**
 * Migration helper to check if migration between storage types is needed
 */
export async function needsStorageMigration(
  fromConfig: StorageConfig,
  toConfig: StorageConfig
): Promise<boolean> {
  if (fromConfig.type === toConfig.type) {
    return false;
  }

  // Check if source storage has data
  try {
    const sourceStorage = await StorageFactory.createStorage(fromConfig);
    const worlds = await sourceStorage.listWorlds();
    return worlds.length > 0;
  } catch {
    return false;
  }
}

/**
 * Default storage configuration
 */
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
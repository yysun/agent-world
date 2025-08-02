/**
 * Storage Classes Module - Class-based Storage Infrastructure
 * 
 * Features:
 * - Unified exports for all storage manager classes
 * - Type-safe interfaces and abstract base classes
 * - Factory methods for creating storage instances
 * - Configuration interfaces and utility types
 * - Migration helpers for transitioning from function-based to class-based storage
 * 
 * Architecture:
 * - BaseStorageManager: Abstract base class defining common interface
 * - SQLiteStorageManager: Database-based implementation with ACID compliance
 * - FileStorageManager: File-based implementation with atomic operations
 * - Unified configuration and factory patterns for easy instantiation
 * - Comprehensive error handling and validation across all implementations
 * 
 * Usage:
 * ```typescript
 * // Create SQLite storage
 * const storage = new SQLiteStorageManager({
 *   rootPath: '/path/to/data',
 *   database: '/path/to/database.db'
 * });
 * await storage.initialize();
 * 
 * // Create file storage
 * const fileStorage = new FileStorageManager({
 *   rootPath: '/path/to/data',
 *   atomicWrites: true
 * });
 * await fileStorage.initialize();
 * ```
 * 
 * Migration:
 * - Provides backward compatibility with function-based storage
 * - Factory methods create appropriate storage manager instances
 * - Wrapper functions maintain existing API surface
 * - Gradual migration path with feature flags
 * 
 * Changes:
 * - 2025-01-XX: Created as part of class-based architecture refactor
 * - Centralizes all storage class exports and factory methods
 * - Provides unified interface for storage manager instantiation
 * - Includes migration utilities for backward compatibility
 */

// Export all storage manager classes
export { BaseStorageManager } from './BaseStorageManager.js';
export { SQLiteStorageManager } from './SQLiteStorageManager.js';
export { FileStorageManager } from './FileStorageManager.js';

// Export configuration interfaces
export type { 
  StorageConfig, 
  StorageMetrics, 
  StorageOperationResult 
} from './BaseStorageManager.js';
export type { SQLiteStorageConfig } from './SQLiteStorageManager.js';
export type { FileStorageConfig } from './FileStorageManager.js';

// Import for factory methods
import { BaseStorageManager } from './BaseStorageManager.js';
import { SQLiteStorageManager, SQLiteStorageConfig } from './SQLiteStorageManager.js';
import { FileStorageManager, FileStorageConfig } from './FileStorageManager.js';

/**
 * Storage type enumeration
 */
export enum StorageType {
  SQLITE = 'sqlite',
  FILE = 'file'
}

/**
 * Combined storage configuration interface
 */
export interface StorageManagerConfig {
  type: StorageType;
  rootPath: string;
  sqlite?: Partial<SQLiteStorageConfig>;
  file?: Partial<FileStorageConfig>;
  enableLogging?: boolean;
  enableMetrics?: boolean;
  retryAttempts?: number;
  timeout?: number;
}

/**
 * Factory method to create appropriate storage manager instance
 */
export async function createStorageManager(config: StorageManagerConfig): Promise<BaseStorageManager> {
  const baseConfig = {
    rootPath: config.rootPath,
    enableLogging: config.enableLogging,
    enableMetrics: config.enableMetrics,
    retryAttempts: config.retryAttempts,
    timeout: config.timeout
  };

  let storageManager: BaseStorageManager;

  switch (config.type) {
    case StorageType.SQLITE: {
      const sqliteConfig: SQLiteStorageConfig = {
        ...baseConfig,
        ...config.sqlite
      };
      storageManager = new SQLiteStorageManager(sqliteConfig);
      break;
    }
    
    case StorageType.FILE: {
      const fileConfig: FileStorageConfig = {
        ...baseConfig,
        ...config.file
      };
      storageManager = new FileStorageManager(fileConfig);
      break;
    }
    
    default:
      throw new Error(`Unsupported storage type: ${config.type}`);
  }

  // Initialize the storage manager
  await storageManager.initialize();
  
  return storageManager;
}

/**
 * Factory method to create SQLite storage manager
 */
export async function createSQLiteStorageManager(config: Partial<SQLiteStorageConfig> & { rootPath: string }): Promise<SQLiteStorageManager> {
  const storage = new SQLiteStorageManager(config as SQLiteStorageConfig);
  await storage.initialize();
  return storage;
}

/**
 * Factory method to create file storage manager
 */
export async function createFileStorageManager(config: Partial<FileStorageConfig> & { rootPath: string }): Promise<FileStorageManager> {
  const storage = new FileStorageManager(config as FileStorageConfig);
  await storage.initialize();
  return storage;
}

/**
 * Utility to determine recommended storage type based on requirements
 */
export function getRecommendedStorageType(requirements: {
  expectedAgentCount?: number;
  expectedChatCount?: number;
  requiresSearch?: boolean;
  requiresAnalytics?: boolean;
  performanceCritical?: boolean;
  simplicityPreferred?: boolean;
}): StorageType {
  const {
    expectedAgentCount = 0,
    expectedChatCount = 0,
    requiresSearch = false,
    requiresAnalytics = false,
    performanceCritical = false,
    simplicityPreferred = false
  } = requirements;

  // Recommend SQLite for complex requirements
  if (
    expectedAgentCount > 10 ||
    expectedChatCount > 100 ||
    requiresSearch ||
    requiresAnalytics ||
    performanceCritical
  ) {
    return StorageType.SQLITE;
  }

  // Recommend file storage for simplicity
  if (simplicityPreferred || (expectedAgentCount <= 5 && expectedChatCount <= 20)) {
    return StorageType.FILE;
  }

  // Default to SQLite for better scalability
  return StorageType.SQLITE;
}

/**
 * Migration utility to convert from function-based storage config to class-based config
 */
export function migrateStorageConfig(legacyConfig: {
  type: 'file' | 'sqlite';
  rootPath: string;
  sqlite?: any;
}): StorageManagerConfig {
  return {
    type: legacyConfig.type === 'sqlite' ? StorageType.SQLITE : StorageType.FILE,
    rootPath: legacyConfig.rootPath,
    sqlite: legacyConfig.sqlite ? {
      ...legacyConfig.sqlite,
      rootPath: legacyConfig.rootPath
    } : undefined,
    file: legacyConfig.type === 'file' ? {
      rootPath: legacyConfig.rootPath
    } : undefined
  };
}

/**
 * Backward compatibility wrapper - creates storage manager that matches old StorageManager interface
 */
export async function createLegacyCompatibleStorageManager(config: StorageManagerConfig): Promise<any> {
  const storageManager = await createStorageManager(config);
  
  // Wrap in legacy interface to maintain backward compatibility
  return {
    // World operations
    saveWorld: (worldData: any) => storageManager.saveWorld(worldData),
    loadWorld: (worldId: string) => storageManager.loadWorld(worldId),
    deleteWorld: (worldId: string) => storageManager.deleteWorld(worldId),
    listWorlds: () => storageManager.listWorlds(),
    
    // Agent operations
    saveAgent: (worldId: string, agent: any) => storageManager.saveAgent(worldId, agent),
    loadAgent: (worldId: string, agentId: string) => storageManager.loadAgent(worldId, agentId),
    deleteAgent: (worldId: string, agentId: string) => storageManager.deleteAgent(worldId, agentId),
    listAgents: (worldId: string) => storageManager.listAgents(worldId),
    
    // Batch operations
    saveAgentsBatch: (worldId: string, agents: any[]) => storageManager.saveAgentsBatch(worldId, agents),
    loadAgentsBatch: (worldId: string, agentIds: string[]) => storageManager.loadAgentsBatch(worldId, agentIds),
    
    // Chat operations
    saveChatData: (worldId: string, chat: any) => storageManager.saveChatData(worldId, chat),
    loadChatData: (worldId: string, chatId: string) => storageManager.loadChatData(worldId, chatId),
    deleteChatData: (worldId: string, chatId: string) => storageManager.deleteChatData(worldId, chatId),
    listChats: (worldId: string) => storageManager.listChats(worldId),
    updateChatData: (worldId: string, chatId: string, updates: any) => storageManager.updateChatData(worldId, chatId, updates),
    
    // World chat operations
    saveWorldChat: (worldId: string, chatId: string, chat: any) => storageManager.saveWorldChat(worldId, chatId, chat),
    loadWorldChat: (worldId: string, chatId: string) => storageManager.loadWorldChat(worldId, chatId),
    restoreFromWorldChat: (worldId: string, chat: any) => storageManager.restoreFromWorldChat(worldId, chat),
    
    // Integrity operations
    validateIntegrity: (worldId: string, agentId?: string) => storageManager.validateIntegrity(worldId, agentId),
    repairData: (worldId: string, agentId?: string) => storageManager.repairData(worldId, agentId),
    
    // Lifecycle
    close: () => storageManager.close(),
    
    // Additional methods for compatibility
    healthCheck: () => storageManager.healthCheck(),
    getMetrics: () => storageManager.getMetrics(),
    isConnected: () => storageManager.isStorageConnected()
  };
}
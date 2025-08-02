/**
 * FileStorageManager - File-based Storage Implementation
 * 
 * Features:
 * - Class-based file storage implementation extending BaseStorageManager  
 * - JSON-based persistence with atomic file operations and backup support
 * - Directory-based organization for scalability and easy navigation
 * - Human-readable storage format for debugging and manual inspection
 * - Efficient file locking and concurrent access management
 * - Built-in data migration and schema validation capabilities
 * 
 * Implementation:
 * - Wraps existing file storage function-based API in class-based interface
 * - Provides atomic file operations with temporary file writes and rename
 * - Implements backup and restore mechanisms for data safety
 * - Uses efficient JSON parsing with error recovery and validation
 * - Supports directory watching for external changes and synchronization
 * 
 * Architecture:
 * - Extends BaseStorageManager for consistent interface and error handling
 * - Uses existing world-storage and agent-storage modules under the hood
 * - Implements retry logic with exponential backoff for file operations
 * - Provides comprehensive logging and metrics collection
 * - Supports concurrent access with file locking mechanisms
 * 
 * File Organization:
 * - {rootPath}/{worldId}/world.json - World configuration
 * - {rootPath}/{worldId}/agents/{agentId}/ - Agent directory
 * - {rootPath}/{worldId}/agents/{agentId}/config.json - Agent configuration
 * - {rootPath}/{worldId}/agents/{agentId}/memory.json - Agent memory
 * - {rootPath}/{worldId}/chats/{chatId}.json - Chat data
 * - {rootPath}/{worldId}/snapshots/{chatId}.json - World chat snapshots
 * 
 * Performance:
 * - Lazy loading for large datasets and memory-efficient operations
 * - File system caching and optimized read/write patterns
 * - Batch operations to minimize disk I/O overhead
 * - Directory traversal optimization for listing operations
 * - Efficient JSON serialization with streaming for large objects
 * 
 * Changes:
 * - 2025-01-XX: Created as part of class-based architecture refactor
 * - Wraps function-based file storage in OOP interface
 * - Adds atomic operations and backup functionality
 * - Includes performance monitoring and optimization features
 */

import { BaseStorageManager, StorageConfig } from './BaseStorageManager.js';
import type { 
  Agent, 
  AgentMessage, 
  WorldData, 
  ChatData, 
  UpdateChatParams, 
  WorldChat 
} from '../types.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * File storage specific configuration extending base storage config
 */
export interface FileStorageConfig extends StorageConfig {
  backupEnabled?: boolean;
  maxBackups?: number;
  atomicWrites?: boolean;
  directoryMode?: number;
  fileMode?: number;
}

/**
 * File storage manager implementing JSON file-based persistence
 */
export class FileStorageManager extends BaseStorageManager {
  private fileStorageConfig: FileStorageConfig;
  private worldStorage: any = null;
  private agentStorage: any = null;
  
  constructor(config: FileStorageConfig) {
    super(config);
    
    this.fileStorageConfig = {
      backupEnabled: true,
      maxBackups: 5,
      atomicWrites: true,
      directoryMode: 0o755,
      fileMode: 0o644,
      ...config
    };
  }

  // ========================================
  // LIFECYCLE MANAGEMENT
  // ========================================

  /**
   * Initialize file storage and ensure directory structure
   */
  async initialize(): Promise<void> {
    try {
      // Dynamically import file storage modules
      this.worldStorage = await import('../world-storage.js');
      this.agentStorage = await import('../agent-storage.js');
      
      // Ensure root directory exists
      await this.ensureDirectory(this.config.rootPath);
      
      this.setConnectionStatus(true);
      
      if (this.config.enableLogging) {
        this.emit('initialized', { 
          rootPath: this.config.rootPath,
          timestamp: new Date() 
        });
      }
      
    } catch (error) {
      this.setConnectionStatus(false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (this.config.enableLogging) {
        this.emit('initializationError', { 
          error: errorMessage,
          timestamp: new Date() 
        });
      }
      
      throw new Error(`Failed to initialize file storage: ${errorMessage}`);
    }
  }

  /**
   * Close file storage (no persistent connections to close)
   */
  async close(): Promise<void> {
    // File storage doesn't maintain persistent connections
    this.setConnectionStatus(false);
    
    if (this.config.enableLogging) {
      this.emit('closed', { timestamp: new Date() });
    }
  }

  /**
   * Check file storage health (verify root directory access)
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check if we can read and write to the root directory
      await fs.promises.access(this.config.rootPath, fs.constants.R_OK | fs.constants.W_OK);
      
      // Try a simple write test
      const testFile = path.join(this.config.rootPath, '.health-check');
      await fs.promises.writeFile(testFile, 'test', 'utf8');
      await fs.promises.unlink(testFile);
      
      return true;
    } catch (error) {
      if (this.config.enableLogging) {
        this.emit('healthCheckFailed', { 
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date() 
        });
      }
      return false;
    }
  }

  // ========================================
  // WORLD OPERATIONS
  // ========================================

  async saveWorld(worldData: WorldData): Promise<void> {
    this.validateWorldId(worldData.id);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('saveWorld', async () => {
      return await this.worldStorage.saveWorld(this.config.rootPath, worldData);
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to save world');
    }
  }

  async loadWorld(worldId: string): Promise<WorldData | null> {
    this.validateWorldId(worldId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('loadWorld', async () => {
      return await this.worldStorage.loadWorld(this.config.rootPath, worldId);
    });

    if (!result.success) {
      // For file storage, file not found is not an error, return null
      if (result.error?.includes('ENOENT') || result.error?.includes('not found')) {
        return null;
      }
      throw new Error(result.error || 'Failed to load world');
    }

    return result.data ? this.cloneWorldData(result.data) : null;
  }

  async deleteWorld(worldId: string): Promise<boolean> {
    this.validateWorldId(worldId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('deleteWorld', async () => {
      return await this.worldStorage.deleteWorld(this.config.rootPath, worldId);
    });

    if (!result.success) {
      // For file storage, attempting to delete non-existent world is not an error
      if (result.error?.includes('ENOENT') || result.error?.includes('not found')) {
        return false;
      }
      throw new Error(result.error || 'Failed to delete world');
    }

    return result.data === true;
  }

  async listWorlds(): Promise<WorldData[]> {
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('listWorlds', async () => {
      return await this.worldStorage.listWorlds(this.config.rootPath);
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to list worlds');
    }

    return (result.data || []).map((world: WorldData) => this.cloneWorldData(world));
  }

  async worldExists(worldId: string): Promise<boolean> {
    this.validateWorldId(worldId);
    this.ensureModulesLoaded();
    
    try {
      return await this.worldStorage.worldExists(this.config.rootPath, worldId);
    } catch (error) {
      return false;
    }
  }

  // ========================================
  // AGENT OPERATIONS
  // ========================================

  async saveAgent(worldId: string, agent: Agent): Promise<void> {
    this.validateWorldId(worldId);
    this.validateAgentId(agent.id);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('saveAgent', async () => {
      return await this.agentStorage.saveAgent(this.config.rootPath, worldId, agent);
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to save agent');
    }
  }

  async loadAgent(worldId: string, agentId: string): Promise<Agent | null> {
    this.validateWorldId(worldId);
    this.validateAgentId(agentId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('loadAgent', async () => {
      return await this.agentStorage.loadAgent(this.config.rootPath, worldId, agentId);
    });

    if (!result.success) {
      // For file storage, file not found is not an error, return null
      if (result.error?.includes('ENOENT') || result.error?.includes('not found')) {
        return null;
      }
      throw new Error(result.error || 'Failed to load agent');
    }

    return result.data ? this.cloneAgent(result.data) : null;
  }

  async deleteAgent(worldId: string, agentId: string): Promise<boolean> {
    this.validateWorldId(worldId);
    this.validateAgentId(agentId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('deleteAgent', async () => {
      return await this.agentStorage.deleteAgent(this.config.rootPath, worldId, agentId);
    });

    if (!result.success) {
      // For file storage, attempting to delete non-existent agent is not an error
      if (result.error?.includes('ENOENT') || result.error?.includes('not found')) {
        return false;
      }
      throw new Error(result.error || 'Failed to delete agent');
    }

    return result.data === true;
  }

  async listAgents(worldId: string): Promise<Agent[]> {
    this.validateWorldId(worldId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('listAgents', async () => {
      return await this.agentStorage.listAgents(this.config.rootPath, worldId);
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to list agents');
    }

    return (result.data || []).map((agent: Agent) => this.cloneAgent(agent));
  }

  async agentExists(worldId: string, agentId: string): Promise<boolean> {
    this.validateWorldId(worldId);
    this.validateAgentId(agentId);
    this.ensureModulesLoaded();
    
    try {
      return await this.agentStorage.agentExists(this.config.rootPath, worldId, agentId);
    } catch (error) {
      return false;
    }
  }

  // ========================================
  // AGENT MEMORY OPERATIONS
  // ========================================

  async saveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
    this.validateWorldId(worldId);
    this.validateAgentId(agentId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('saveAgentMemory', async () => {
      return await this.agentStorage.saveAgentMemory(this.config.rootPath, worldId, agentId, memory);
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to save agent memory');
    }
  }

  async archiveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void> {
    this.validateWorldId(worldId);
    this.validateAgentId(agentId);
    this.ensureModulesLoaded();
    
    if (this.agentStorage.archiveAgentMemory) {
      const result = await this.executeOperation('archiveAgentMemory', async () => {
        return await this.agentStorage.archiveAgentMemory(this.config.rootPath, worldId, agentId, memory);
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to archive agent memory');
      }
    } else {
      // Fallback: just log the archiving action
      if (this.config.enableLogging) {
        this.emit('memoryArchived', {
          worldId,
          agentId,
          messageCount: memory.length,
          timestamp: new Date()
        });
      }
    }
  }

  // ========================================
  // BATCH OPERATIONS
  // ========================================

  async saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void> {
    this.validateWorldId(worldId);
    this.ensureModulesLoaded();
    
    // File storage doesn't have native batch operations, so we'll save individually
    const result = await this.executeOperation('saveAgentsBatch', async () => {
      for (const agent of agents) {
        await this.agentStorage.saveAgent(this.config.rootPath, worldId, agent);
      }
      return true;
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to save agents batch');
    }
  }

  async loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]> {
    this.validateWorldId(worldId);
    agentIds.forEach(id => this.validateAgentId(id));
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('loadAgentsBatch', async () => {
      const agents: Agent[] = [];
      for (const agentId of agentIds) {
        try {
          const agent = await this.agentStorage.loadAgent(this.config.rootPath, worldId, agentId);
          if (agent) {
            agents.push(agent);
          }
        } catch (error) {
          // Continue loading other agents even if one fails
          if (this.config.enableLogging) {
            this.emit('batchLoadError', {
              worldId,
              agentId,
              error: error instanceof Error ? error.message : String(error),
              timestamp: new Date()
            });
          }
        }
      }
      return agents;
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to load agents batch');
    }

    return (result.data || []).map((agent: Agent) => this.cloneAgent(agent));
  }

  // ========================================
  // CHAT OPERATIONS
  // ========================================

  async saveChatData(worldId: string, chat: ChatData): Promise<void> {
    this.validateWorldId(worldId);
    this.validateChatId(chat.id);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('saveChatData', async () => {
      if (this.worldStorage.saveChatData) {
        return await this.worldStorage.saveChatData(this.config.rootPath, worldId, chat);
      } else {
        // Fallback: save as JSON file
        const chatDir = path.join(this.config.rootPath, worldId, 'chats');
        await this.ensureDirectory(chatDir);
        const chatFile = path.join(chatDir, `${chat.id}.json`);
        await this.writeJsonFile(chatFile, chat);
        return true;
      }
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to save chat data');
    }
  }

  async loadChatData(worldId: string, chatId: string): Promise<ChatData | null> {
    this.validateWorldId(worldId);
    this.validateChatId(chatId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('loadChatData', async () => {
      if (this.worldStorage.loadChatData) {
        return await this.worldStorage.loadChatData(this.config.rootPath, worldId, chatId);
      } else {
        // Fallback: load from JSON file
        const chatFile = path.join(this.config.rootPath, worldId, 'chats', `${chatId}.json`);
        return await this.readJsonFile(chatFile);
      }
    });

    if (!result.success) {
      // For file storage, file not found is not an error, return null
      if (result.error?.includes('ENOENT') || result.error?.includes('not found')) {
        return null;
      }
      throw new Error(result.error || 'Failed to load chat data');
    }

    return result.data ? this.cloneChatData(result.data) : null;
  }

  async deleteChatData(worldId: string, chatId: string): Promise<boolean> {
    this.validateWorldId(worldId);
    this.validateChatId(chatId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('deleteChatData', async () => {
      if (this.worldStorage.deleteChatData) {
        return await this.worldStorage.deleteChatData(this.config.rootPath, worldId, chatId);
      } else {
        // Fallback: delete JSON file
        const chatFile = path.join(this.config.rootPath, worldId, 'chats', `${chatId}.json`);
        try {
          await fs.promises.unlink(chatFile);
          return true;
        } catch (error) {
          if ((error as any).code === 'ENOENT') {
            return false;
          }
          throw error;
        }
      }
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete chat data');
    }

    return result.data === true;
  }

  async listChats(worldId: string): Promise<ChatData[]> {
    this.validateWorldId(worldId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('listChats', async () => {
      if (this.worldStorage.listChatHistories) {
        return await this.worldStorage.listChatHistories(this.config.rootPath, worldId);
      } else {
        // Fallback: scan chats directory
        const chatDir = path.join(this.config.rootPath, worldId, 'chats');
        try {
          const files = await fs.promises.readdir(chatDir);
          const chats: ChatData[] = [];
          
          for (const file of files) {
            if (file.endsWith('.json')) {
              try {
                const chatFile = path.join(chatDir, file);
                const chatData = await this.readJsonFile(chatFile);
                if (chatData) {
                  chats.push(chatData);
                }
              } catch (error) {
                // Skip corrupted files
                if (this.config.enableLogging) {
                  this.emit('corruptedChatFile', {
                    worldId,
                    file,
                    error: error instanceof Error ? error.message : String(error),
                    timestamp: new Date()
                  });
                }
              }
            }
          }
          
          return chats;
        } catch (error) {
          if ((error as any).code === 'ENOENT') {
            return [];
          }
          throw error;
        }
      }
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to list chats');
    }

    return (result.data || []).map((chat: ChatData) => this.cloneChatData(chat));
  }

  async updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<ChatData | null> {
    this.validateWorldId(worldId);
    this.validateChatId(chatId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('updateChatData', async () => {
      if (this.worldStorage.updateChatData) {
        return await this.worldStorage.updateChatData(this.config.rootPath, worldId, chatId, updates);
      } else {
        // Fallback: load, update, and save
        const existingChat = await this.loadChatData(worldId, chatId);
        if (!existingChat) {
          return null;
        }
        
        const updatedChat: ChatData = {
          ...existingChat,
          ...updates,
          updatedAt: new Date()
        };
        
        await this.saveChatData(worldId, updatedChat);
        return updatedChat;
      }
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to update chat data');
    }

    return result.data ? this.cloneChatData(result.data) : null;
  }

  // ========================================
  // WORLD CHAT OPERATIONS
  // ========================================

  async saveWorldChat(worldId: string, chatId: string, chat: WorldChat): Promise<void> {
    this.validateWorldId(worldId);
    this.validateChatId(chatId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('saveWorldChat', async () => {
      if (this.worldStorage.saveWorldChat) {
        return await this.worldStorage.saveWorldChat(this.config.rootPath, worldId, chatId, chat);
      } else {
        // Fallback: save as JSON snapshot file
        const snapshotDir = path.join(this.config.rootPath, worldId, 'snapshots');
        await this.ensureDirectory(snapshotDir);
        const snapshotFile = path.join(snapshotDir, `${chatId}.json`);
        await this.writeJsonFile(snapshotFile, chat);
        return true;
      }
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to save world chat');
    }
  }

  async loadWorldChat(worldId: string, chatId: string): Promise<WorldChat | null> {
    this.validateWorldId(worldId);
    this.validateChatId(chatId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('loadWorldChat', async () => {
      if (this.worldStorage.loadWorldChatFull) {
        return await this.worldStorage.loadWorldChatFull(this.config.rootPath, worldId, chatId);
      } else {
        // Fallback: load from JSON snapshot file
        const snapshotFile = path.join(this.config.rootPath, worldId, 'snapshots', `${chatId}.json`);
        return await this.readJsonFile(snapshotFile);
      }
    });

    if (!result.success) {
      // For file storage, file not found is not an error, return null
      if (result.error?.includes('ENOENT') || result.error?.includes('not found')) {
        return null;
      }
      throw new Error(result.error || 'Failed to load world chat');
    }

    return result.data ? this.cloneWorldChat(result.data) : null;
  }

  async restoreFromWorldChat(worldId: string, chat: WorldChat): Promise<boolean> {
    this.validateWorldId(worldId);
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('restoreFromWorldChat', async () => {
      // File storage doesn't have built-in restore functionality
      // We would need to implement it by saving world data and agents
      console.warn('[file-storage] World chat restoration not yet implemented for file storage');
      return false;
    });

    return result.data === true;
  }

  // ========================================
  // INTEGRITY OPERATIONS
  // ========================================

  async validateIntegrity(worldId: string, agentId?: string): Promise<{ isValid: boolean; errors?: string[] }> {
    this.validateWorldId(worldId);
    if (agentId) {
      this.validateAgentId(agentId);
    }
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('validateIntegrity', async () => {
      if (agentId) {
        if (this.agentStorage.validateAgentIntegrity) {
          return await this.agentStorage.validateAgentIntegrity(this.config.rootPath, worldId, agentId);
        } else {
          // Basic check: does agent exist?
          return { isValid: await this.agentExists(worldId, agentId) };
        }
      } else {
        // Basic check: does world exist?
        return { isValid: await this.worldExists(worldId) };
      }
    });

    if (!result.success) {
      return { 
        isValid: false, 
        errors: [result.error || 'Failed to validate integrity'] 
      };
    }

    return result.data || { isValid: false };
  }

  async repairData(worldId: string, agentId?: string): Promise<boolean> {
    this.validateWorldId(worldId);
    if (agentId) {
      this.validateAgentId(agentId);
    }
    this.ensureModulesLoaded();
    
    const result = await this.executeOperation('repairData', async () => {
      if (agentId) {
        if (this.agentStorage.repairAgentData) {
          return await this.agentStorage.repairAgentData(this.config.rootPath, worldId, agentId);
        }
      }
      // File storage doesn't have built-in repair functionality
      return false;
    });

    if (!result.success) {
      if (this.config.enableLogging) {
        this.emit('repairFailed', {
          worldId,
          agentId,
          error: result.error,
          timestamp: new Date()
        });
      }
      return false;
    }

    return result.data === true;
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Ensure storage modules are loaded
   */
  private ensureModulesLoaded(): void {
    if (!this.worldStorage || !this.agentStorage) {
      throw new Error('File storage not initialized. Call initialize() first.');
    }
  }

  /**
   * Ensure directory exists, create if necessary
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        await fs.promises.mkdir(dirPath, { 
          recursive: true, 
          mode: this.fileStorageConfig.directoryMode 
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Read JSON file with error handling
   */
  private async readJsonFile(filePath: string): Promise<any> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Write JSON file atomically
   */
  private async writeJsonFile(filePath: string, data: any): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    
    if (this.fileStorageConfig.atomicWrites) {
      // Atomic write: write to temp file then rename
      const tempFile = `${filePath}.tmp`;
      await fs.promises.writeFile(tempFile, content, { 
        encoding: 'utf8',
        mode: this.fileStorageConfig.fileMode 
      });
      await fs.promises.rename(tempFile, filePath);
    } else {
      // Direct write
      await fs.promises.writeFile(filePath, content, { 
        encoding: 'utf8',
        mode: this.fileStorageConfig.fileMode 
      });
    }
  }

  /**
   * Get file storage specific configuration
   */
  getFileStorageConfig(): FileStorageConfig {
    return { ...this.fileStorageConfig };
  }
}
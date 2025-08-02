/**
 * BaseStorageManager - Abstract Storage Infrastructure Class
 * 
 * Features:
 * - Abstract base class defining unified storage interface for all implementations
 * - Type-safe operations for worlds, agents, chats, and integrity management
 * - Standardized error handling and validation patterns
 * - Performance monitoring and metrics collection hooks
 * - Transaction support for atomic operations
 * - Connection lifecycle management (open/close/health checks)
 * 
 * Implementation:
 * - Defines contracts that all storage implementations must fulfill
 * - Provides common validation and error handling utilities
 * - Establishes patterns for batch operations and performance optimization
 * - Supports both file-based and database-based storage backends
 * - Includes hooks for monitoring, logging, and debugging
 * 
 * Architecture:
 * - Abstract class with protected utility methods for common operations
 * - Public abstract methods that subclasses must implement
 * - Event emitter integration for storage operation notifications
 * - Configurable retry logic and error recovery mechanisms
 * - Support for storage-specific optimizations and features
 * 
 * Changes:
 * - 2025-01-XX: Created as part of class-based architecture refactor
 * - Replaces function-based storage factory pattern with OOP design
 * - Provides foundation for SQLiteStorageManager and FileStorageManager classes
 * - Includes comprehensive type safety and error handling improvements
 */

import { EventEmitter } from 'events';
import type { 
  Agent, 
  AgentMessage, 
  WorldData, 
  ChatData, 
  UpdateChatParams, 
  WorldChat 
} from '../types.js';

/**
 * Storage operation result with metadata
 */
export interface StorageOperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Storage configuration interface
 */
export interface StorageConfig {
  rootPath: string;
  enableLogging?: boolean;
  enableMetrics?: boolean;
  retryAttempts?: number;
  timeout?: number;
}

/**
 * Storage metrics interface
 */
export interface StorageMetrics {
  operationCount: number;
  errorCount: number;
  averageDuration: number;
  lastOperation: Date | null;
  connectionHealth: 'healthy' | 'degraded' | 'failed';
}

/**
 * Abstract base class for all storage implementations
 * Provides common interface and utility methods for storage operations
 */
export abstract class BaseStorageManager extends EventEmitter {
  protected readonly config: StorageConfig;
  protected metrics: StorageMetrics;
  protected isConnected: boolean = false;
  protected connectionRetries: number = 0;

  constructor(config: StorageConfig) {
    super();
    this.config = {
      enableLogging: true,
      enableMetrics: true,
      retryAttempts: 3,
      timeout: 30000,
      ...config
    };
    
    this.metrics = {
      operationCount: 0,
      errorCount: 0,
      averageDuration: 0,
      lastOperation: null,
      connectionHealth: 'healthy'
    };
  }

  // ========================================
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ========================================

  /**
   * Initialize storage connection and setup
   */
  abstract initialize(): Promise<void>;

  /**
   * Close storage connection and cleanup resources
   */
  abstract close(): Promise<void>;

  /**
   * Check if storage is healthy and accessible
   */
  abstract healthCheck(): Promise<boolean>;

  // World operations
  abstract saveWorld(worldData: WorldData): Promise<void>;
  abstract loadWorld(worldId: string): Promise<WorldData | null>;
  abstract deleteWorld(worldId: string): Promise<boolean>;
  abstract listWorlds(): Promise<WorldData[]>;
  abstract worldExists(worldId: string): Promise<boolean>;

  // Agent operations  
  abstract saveAgent(worldId: string, agent: Agent): Promise<void>;
  abstract loadAgent(worldId: string, agentId: string): Promise<Agent | null>;
  abstract deleteAgent(worldId: string, agentId: string): Promise<boolean>;
  abstract listAgents(worldId: string): Promise<Agent[]>;
  abstract agentExists(worldId: string, agentId: string): Promise<boolean>;

  // Agent memory operations
  abstract saveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;
  abstract archiveAgentMemory(worldId: string, agentId: string, memory: AgentMessage[]): Promise<void>;

  // Batch operations
  abstract saveAgentsBatch(worldId: string, agents: Agent[]): Promise<void>;
  abstract loadAgentsBatch(worldId: string, agentIds: string[]): Promise<Agent[]>;

  // Chat operations
  abstract saveChatData(worldId: string, chat: ChatData): Promise<void>;
  abstract loadChatData(worldId: string, chatId: string): Promise<ChatData | null>;
  abstract deleteChatData(worldId: string, chatId: string): Promise<boolean>;
  abstract listChats(worldId: string): Promise<ChatData[]>;
  abstract updateChatData(worldId: string, chatId: string, updates: UpdateChatParams): Promise<ChatData | null>;

  // World chat operations
  abstract saveWorldChat(worldId: string, chatId: string, chat: WorldChat): Promise<void>;
  abstract loadWorldChat(worldId: string, chatId: string): Promise<WorldChat | null>;
  abstract restoreFromWorldChat(worldId: string, chat: WorldChat): Promise<boolean>;

  // Integrity operations
  abstract validateIntegrity(worldId: string, agentId?: string): Promise<{ isValid: boolean; errors?: string[] }>;
  abstract repairData(worldId: string, agentId?: string): Promise<boolean>;

  // ========================================
  // CONCRETE METHODS - Common functionality
  // ========================================

  /**
   * Get current storage metrics
   */
  getMetrics(): StorageMetrics {
    return { ...this.metrics };
  }

  /**
   * Get storage configuration
   */
  getConfig(): StorageConfig {
    return { ...this.config };
  }

  /**
   * Check if storage is connected
   */
  isStorageConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Execute operation with metrics tracking and error handling
   */
  protected async executeOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<StorageOperationResult<T>> {
    const startTime = Date.now();
    
    try {
      if (this.config.enableLogging) {
        this.emit('operationStart', { operation: operationName, timestamp: new Date() });
      }

      const result = await operation();
      const duration = Date.now() - startTime;

      // Update metrics
      if (this.config.enableMetrics) {
        this.updateMetrics(duration, false);
      }

      if (this.config.enableLogging) {
        this.emit('operationComplete', { 
          operation: operationName, 
          duration, 
          timestamp: new Date() 
        });
      }

      return {
        success: true,
        data: result,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update metrics
      if (this.config.enableMetrics) {
        this.updateMetrics(duration, true);
      }

      if (this.config.enableLogging) {
        this.emit('operationError', { 
          operation: operationName, 
          error: errorMessage, 
          duration, 
          timestamp: new Date() 
        });
      }

      return {
        success: false,
        error: errorMessage,
        duration
      };
    }
  }

  /**
   * Update storage metrics
   */
  private updateMetrics(duration: number, isError: boolean): void {
    this.metrics.operationCount++;
    this.metrics.lastOperation = new Date();
    
    if (isError) {
      this.metrics.errorCount++;
      // Update connection health based on error rate
      const errorRate = this.metrics.errorCount / this.metrics.operationCount;
      if (errorRate > 0.5) {
        this.metrics.connectionHealth = 'failed';
      } else if (errorRate > 0.1) {
        this.metrics.connectionHealth = 'degraded';
      }
    } else {
      // Update average duration (exponential moving average)
      if (this.metrics.averageDuration === 0) {
        this.metrics.averageDuration = duration;
      } else {
        this.metrics.averageDuration = (this.metrics.averageDuration * 0.9) + (duration * 0.1);
      }
    }
  }

  /**
   * Validate world ID format
   */
  protected validateWorldId(worldId: string): void {
    if (!worldId || typeof worldId !== 'string') {
      throw new Error('World ID must be a non-empty string');
    }
    if (!/^[a-z0-9-]+$/.test(worldId)) {
      throw new Error('World ID must contain only lowercase letters, numbers, and hyphens');
    }
  }

  /**
   * Validate agent ID format
   */
  protected validateAgentId(agentId: string): void {
    if (!agentId || typeof agentId !== 'string') {
      throw new Error('Agent ID must be a non-empty string');
    }
    if (!/^[a-z0-9-]+$/.test(agentId)) {
      throw new Error('Agent ID must contain only lowercase letters, numbers, and hyphens');
    }
  }

  /**
   * Validate chat ID format
   */
  protected validateChatId(chatId: string): void {
    if (!chatId || typeof chatId !== 'string') {
      throw new Error('Chat ID must be a non-empty string');
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.retryAttempts || 3
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff: 100ms, 200ms, 400ms, etc.
        const delay = Math.min(1000, 100 * Math.pow(2, attempt));
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Set connection status and emit event
   */
  protected setConnectionStatus(connected: boolean): void {
    if (this.isConnected !== connected) {
      this.isConnected = connected;
      this.emit('connectionStatusChanged', { connected, timestamp: new Date() });
      
      if (connected) {
        this.connectionRetries = 0;
        this.metrics.connectionHealth = 'healthy';
      } else {
        this.connectionRetries++;
        this.metrics.connectionHealth = 'failed';
      }
    }
  }

  /**
   * Create a shallow copy of world data for safe return
   */
  protected cloneWorldData(worldData: WorldData): WorldData {
    return {
      ...worldData,
      createdAt: new Date(worldData.createdAt),
      lastUpdated: new Date(worldData.lastUpdated)
    };
  }

  /**
   * Create a shallow copy of agent data for safe return
   */
  protected cloneAgent(agent: Agent): Agent {
    return {
      ...agent,
      createdAt: agent.createdAt ? new Date(agent.createdAt) : undefined,
      lastActive: agent.lastActive ? new Date(agent.lastActive) : undefined,
      lastLLMCall: agent.lastLLMCall ? new Date(agent.lastLLMCall) : undefined,
      memory: [...agent.memory]
    };
  }

  /**
   * Create a shallow copy of chat data for safe return
   */
  protected cloneChatData(chatData: ChatData): ChatData {
    return {
      ...chatData,
      createdAt: new Date(chatData.createdAt),
      updatedAt: new Date(chatData.updatedAt),
      chat: chatData.chat ? this.cloneWorldChat(chatData.chat) : undefined
    };
  }

  /**
   * Create a shallow copy of world chat for safe return
   */
  protected cloneWorldChat(worldChat: WorldChat): WorldChat {
    return {
      ...worldChat,
      world: this.cloneWorldData(worldChat.world),
      agents: worldChat.agents.map(agent => ({ ...agent })),
      messages: worldChat.messages.map(msg => ({ ...msg })),
      metadata: {
        ...worldChat.metadata,
        capturedAt: new Date(worldChat.metadata.capturedAt)
      }
    };
  }
}
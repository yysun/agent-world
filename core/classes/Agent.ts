/**
 * Agent Class - Object-oriented Agent Implementation
 * 
 * Features:
 * - Class-based agent implementation replacing function-based approach
 * - Comprehensive LLM operations with provider-agnostic interface
 * - Advanced memory management with archival and search capabilities
 * - Intelligent message processing and response logic
 * - Real-time interaction with world events and other agents
 * - Performance monitoring and metrics collection for agent activities
 * 
 * Implementation:
 * - Implements complete Agent interface from types.ts
 * - Integrates with storage managers for persistent state management
 * - Uses event-driven architecture for world interactions
 * - Provides async operations for all LLM and storage interactions
 * - Includes comprehensive error handling and recovery mechanisms
 * 
 * Architecture:
 * - Self-contained agent with internal state management
 * - Lazy-loaded dependencies for performance optimization
 * - Configurable LLM providers and model parameters
 * - Pluggable storage backend through dependency injection
 * - Event emitter for agent lifecycle and activity notifications
 * 
 * LLM Operations:
 * - Provider-agnostic LLM interaction with fallback mechanisms
 * - Streaming and non-streaming response generation
 * - Context window management and message history optimization
 * - Token usage tracking and cost monitoring
 * - Temperature and parameter customization per agent
 * 
 * Memory Management:
 * - Efficient in-memory storage with automatic persistence
 * - Memory archival for long-running conversations
 * - Search capabilities across message history
 * - Memory slicing for context window management
 * - Automatic memory cleanup and optimization
 * 
 * Changes:
 * - 2025-01-XX: Created as part of class-based architecture refactor
 * - Migrates from interface-based to class-based agent implementation
 * - Adds comprehensive state management and persistence
 * - Includes performance monitoring and optimization features
 */

import { EventEmitter } from 'events';
import type { 
  Agent as IAgent,
  AgentMessage,
  LLMProvider,
  WorldMessageEvent,
  WorldSSEEvent,
  World
} from '../types.js';
import type { BaseStorageManager } from '../storage/BaseStorageManager.js';

/**
 * Agent configuration interface for class instantiation
 */
export interface AgentConfig {
  id: string;
  name: string;
  type: string;
  provider: LLMProvider;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  status?: 'active' | 'inactive' | 'error';
  memory?: AgentMessage[];
}

/**
 * Agent metrics for performance monitoring
 */
export interface AgentMetrics {
  llmCallCount: number;
  totalTokensUsed: number;
  averageResponseTime: number;
  messageCount: number;
  lastActivity: Date | null;
  errorCount: number;
}

/**
 * Agent class implementing the complete Agent interface
 */
export class Agent extends EventEmitter implements IAgent {
  // Core properties
  public readonly id: string;
  public name: string;
  public type: string;
  public status: 'active' | 'inactive' | 'error';
  public provider: LLMProvider;
  public model: string;
  public systemPrompt?: string;
  public temperature?: number;
  public maxTokens?: number;
  
  // Timestamps and counters
  public createdAt: Date;
  public lastActive?: Date;
  public llmCallCount: number;
  public lastLLMCall?: Date;
  
  // Memory and world reference
  public memory: AgentMessage[];
  public world?: World;
  
  // Private properties
  private storageManager?: BaseStorageManager;
  private worldId?: string;
  private metrics: AgentMetrics;
  private isInitialized: boolean = false;

  constructor(config: AgentConfig) {
    super();
    
    // Initialize core properties
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.provider = config.provider;
    this.model = config.model;
    this.systemPrompt = config.systemPrompt;
    this.temperature = config.temperature;
    this.maxTokens = config.maxTokens;
    this.status = config.status || 'inactive';
    this.memory = config.memory || [];
    
    // Initialize timestamps
    this.createdAt = new Date();
    this.llmCallCount = 0;
    
    // Initialize metrics
    this.metrics = {
      llmCallCount: 0,
      totalTokensUsed: 0,
      averageResponseTime: 0,
      messageCount: this.memory.length,
      lastActivity: null,
      errorCount: 0
    };
  }

  // ========================================
  // INITIALIZATION AND LIFECYCLE
  // ========================================

  /**
   * Initialize agent with storage and world context
   */
  async initialize(storageManager: BaseStorageManager, worldId: string, world?: World): Promise<void> {
    this.storageManager = storageManager;
    this.worldId = worldId;
    this.world = world;
    this.isInitialized = true;
    this.status = 'active';
    
    // Load existing memory if available
    await this.loadMemoryFromStorage();
    
    this.emit('initialized', { agentId: this.id, worldId, timestamp: new Date() });
  }

  /**
   * Cleanup agent resources
   */
  async cleanup(): Promise<void> {
    this.status = 'inactive';
    
    // Save current state
    if (this.storageManager && this.worldId) {
      await this.saveToStorage();
    }
    
    this.emit('cleanup', { agentId: this.id, timestamp: new Date() });
  }

  // ========================================
  // LLM OPERATION METHODS
  // ========================================

  /**
   * Generate response using LLM
   */
  async generateResponse(messages: AgentMessage[]): Promise<string> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    
    try {
      // Import LLM manager dynamically
      const llmManager = await import('../llm-manager.js');
      
      if (!this.world) {
        throw new Error('Agent not attached to world');
      }
      
      // Generate response using LLM manager
      const response = await llmManager.generateAgentResponse(this.world, this, messages);
      
      // Update metrics and counters
      this.llmCallCount++;
      this.lastLLMCall = new Date();
      this.updateMetrics(startTime, false);
      
      // Save updated state
      await this.saveToStorage();
      
      this.emit('responseGenerated', { 
        agentId: this.id, 
        messageCount: messages.length,
        responseLength: response.length,
        duration: Date.now() - startTime,
        timestamp: new Date() 
      });
      
      return response;
      
    } catch (error) {
      this.updateMetrics(startTime, true);
      this.emit('responseError', { 
        agentId: this.id, 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date() 
      });
      throw error;
    }
  }

  /**
   * Stream response using LLM
   */
  async streamResponse(messages: AgentMessage[]): Promise<string> {
    this.ensureInitialized();
    
    const startTime = Date.now();
    
    try {
      // Import required modules
      const llmManager = await import('../llm-manager.js');
      const events = await import('../events.js');
      
      if (!this.world) {
        throw new Error('Agent not attached to world');
      }
      
      // Stream response using LLM manager
      const response = await llmManager.streamAgentResponse(
        this.world, 
        this, 
        messages, 
        events.publishSSE
      );
      
      // Update metrics and counters
      this.llmCallCount++;
      this.lastLLMCall = new Date();
      this.updateMetrics(startTime, false);
      
      // Save updated state
      await this.saveToStorage();
      
      this.emit('responseStreamed', { 
        agentId: this.id, 
        messageCount: messages.length,
        responseLength: response.length,
        duration: Date.now() - startTime,
        timestamp: new Date() 
      });
      
      return response;
      
    } catch (error) {
      this.updateMetrics(startTime, true);
      this.emit('streamError', { 
        agentId: this.id, 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date() 
      });
      throw error;
    }
  }

  // ========================================
  // MEMORY MANAGEMENT METHODS
  // ========================================

  /**
   * Add message to agent memory
   */
  async addToMemory(message: AgentMessage): Promise<void> {
    this.ensureInitialized();
    
    // Add timestamp if not present
    if (!message.createdAt) {
      message.createdAt = new Date();
    }
    
    this.memory.push({ ...message });
    this.lastActive = new Date();
    this.metrics.messageCount = this.memory.length;
    
    // Auto-save to storage
    await this.saveMemoryToStorage();
    
    this.emit('memoryAdded', { 
      agentId: this.id, 
      messageRole: message.role,
      memorySize: this.memory.length,
      timestamp: new Date() 
    });
  }

  /**
   * Get current memory size
   */
  getMemorySize(): number {
    return this.memory.length;
  }

  /**
   * Archive current memory and clear
   */
  async archiveMemory(): Promise<void> {
    this.ensureInitialized();
    
    if (this.memory.length === 0) {
      return;
    }
    
    // Archive memory using storage manager
    if (this.storageManager && this.worldId) {
      await this.storageManager.archiveAgentMemory(this.worldId, this.id, this.memory);
    }
    
    const archivedCount = this.memory.length;
    this.memory = [];
    this.metrics.messageCount = 0;
    
    // Save empty memory state
    await this.saveMemoryToStorage();
    
    this.emit('memoryArchived', { 
      agentId: this.id, 
      archivedCount,
      timestamp: new Date() 
    });
  }

  /**
   * Get slice of memory
   */
  getMemorySlice(start: number, end: number): AgentMessage[] {
    return this.memory.slice(start, end).map(msg => ({ ...msg }));
  }

  /**
   * Search memory for matching content
   */
  searchMemory(query: string): AgentMessage[] {
    const lowerQuery = query.toLowerCase();
    return this.memory
      .filter(msg => 
        msg.content.toLowerCase().includes(lowerQuery) ||
        (msg.sender && msg.sender.toLowerCase().includes(lowerQuery))
      )
      .map(msg => ({ ...msg }));
  }

  // ========================================
  // MESSAGE PROCESSING METHODS
  // ========================================

  /**
   * Determine if agent should respond to message
   */
  async shouldRespond(messageEvent: WorldMessageEvent): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const events = await import('../events.js');
      
      if (!this.world) {
        return false;
      }
      
      return await events.shouldAgentRespond(this.world, this, messageEvent);
      
    } catch (error) {
      this.emit('responseDecisionError', { 
        agentId: this.id, 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date() 
      });
      return false;
    }
  }

  /**
   * Process incoming message
   */
  async processMessage(messageEvent: WorldMessageEvent): Promise<void> {
    this.ensureInitialized();
    
    try {
      const events = await import('../events.js');
      
      if (!this.world) {
        throw new Error('Agent not attached to world');
      }
      
      await events.processAgentMessage(this.world, this, messageEvent);
      
      this.lastActive = new Date();
      
      this.emit('messageProcessed', { 
        agentId: this.id, 
        messageId: messageEvent.messageId,
        sender: messageEvent.sender,
        timestamp: new Date() 
      });
      
    } catch (error) {
      this.emit('messageProcessingError', { 
        agentId: this.id, 
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date() 
      });
      throw error;
    }
  }

  /**
   * Extract mentions from content
   */
  extractMentions(content: string): string[] {
    // Use utility function from utils module
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    const mentions: string[] = [];
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1].toLowerCase());
    }
    
    return mentions;
  }

  /**
   * Check if agent is mentioned in content
   */
  isMentioned(content: string): boolean {
    const mentions = this.extractMentions(content);
    return mentions.includes(this.id.toLowerCase()) || 
           mentions.includes(this.name.toLowerCase());
  }

  // ========================================
  // STORAGE OPERATIONS
  // ========================================

  /**
   * Save agent state to storage
   */
  private async saveToStorage(): Promise<void> {
    if (!this.storageManager || !this.worldId) {
      return;
    }
    
    try {
      await this.storageManager.saveAgent(this.worldId, this);
    } catch (error) {
      this.emit('storageError', { 
        agentId: this.id, 
        operation: 'save',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date() 
      });
      throw error;
    }
  }

  /**
   * Save memory to storage
   */
  private async saveMemoryToStorage(): Promise<void> {
    if (!this.storageManager || !this.worldId) {
      return;
    }
    
    try {
      await this.storageManager.saveAgentMemory(this.worldId, this.id, this.memory);
    } catch (error) {
      this.emit('storageError', { 
        agentId: this.id, 
        operation: 'saveMemory',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date() 
      });
      throw error;
    }
  }

  /**
   * Load memory from storage
   */
  private async loadMemoryFromStorage(): Promise<void> {
    if (!this.storageManager || !this.worldId) {
      return;
    }
    
    try {
      const agent = await this.storageManager.loadAgent(this.worldId, this.id);
      if (agent && agent.memory) {
        this.memory = agent.memory;
        this.metrics.messageCount = this.memory.length;
      }
    } catch (error) {
      this.emit('storageError', { 
        agentId: this.id, 
        operation: 'loadMemory',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date() 
      });
      // Don't throw on load errors, just log them
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Get agent metrics
   */
  getMetrics(): AgentMetrics {
    return { ...this.metrics };
  }

  /**
   * Update agent metrics
   */
  private updateMetrics(startTime: number, isError: boolean): void {
    const duration = Date.now() - startTime;
    
    this.metrics.lastActivity = new Date();
    
    if (isError) {
      this.metrics.errorCount++;
    } else {
      this.metrics.llmCallCount++;
      
      // Update average response time (exponential moving average)
      if (this.metrics.averageResponseTime === 0) {
        this.metrics.averageResponseTime = duration;
      } else {
        this.metrics.averageResponseTime = 
          (this.metrics.averageResponseTime * 0.9) + (duration * 0.1);
      }
    }
  }

  /**
   * Ensure agent is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }
  }

  /**
   * Create a data-only representation for storage
   */
  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      provider: this.provider,
      model: this.model,
      systemPrompt: this.systemPrompt,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      createdAt: this.createdAt,
      lastActive: this.lastActive,
      llmCallCount: this.llmCallCount,
      lastLLMCall: this.lastLLMCall,
      memory: this.memory
    };
  }

  /**
   * Create Agent instance from stored data
   */
  static fromJSON(data: any): Agent {
    const agent = new Agent({
      id: data.id,
      name: data.name,
      type: data.type,
      provider: data.provider,
      model: data.model,
      systemPrompt: data.systemPrompt,
      temperature: data.temperature,
      maxTokens: data.maxTokens,
      status: data.status,
      memory: data.memory || []
    });
    
    // Restore timestamps and counters
    agent.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    agent.lastActive = data.lastActive ? new Date(data.lastActive) : undefined;
    agent.llmCallCount = data.llmCallCount || 0;
    agent.lastLLMCall = data.lastLLMCall ? new Date(data.lastLLMCall) : undefined;
    
    return agent;
  }
}
/**
 * World Class - Object-oriented World Implementation
 * 
 * Features:
 * - Class-based world implementation replacing function-based approach
 * - Centralized agent management with AgentManager integration
 * - Advanced chat session management with auto-save and restoration
 * - Real-time event system for world-wide communications
 * - Performance monitoring and metrics collection for world activities
 * - Storage abstraction with pluggable backend support
 * 
 * Implementation:
 * - Implements complete World interface from types.ts
 * - Uses AgentManager for agent lifecycle management
 * - Integrates with storage managers for persistent state
 * - Provides async operations for all storage and LLM interactions
 * - Includes comprehensive error handling and recovery mechanisms
 * 
 * Architecture:
 * - Event-driven design with EventEmitter for real-time communications
 * - Dependency injection for storage and agent management
 * - Lazy loading for performance optimization
 * - Modular design with clear separation of concerns
 * - Pluggable components for extensibility
 * 
 * Chat Management:
 * - Advanced chat session management with auto-save functionality
 * - Chat reuse optimization for improved performance
 * - Snapshot and restoration capabilities for conversation history
 * - Automatic title generation and metadata management
 * 
 * Agent Integration:
 * - Seamless integration with Agent and AgentManager classes
 * - Automatic agent subscription to world events
 * - Efficient agent lookup and management operations
 * - Support for batch agent operations
 * 
 * Changes:
 * - 2025-01-XX: Created as part of class-based architecture refactor
 * - Migrates from interface-based to class-based world implementation
 * - Adds comprehensive state management and persistence
 * - Includes performance monitoring and optimization features
 */

import { EventEmitter } from 'events';
import { Agent } from './Agent.js';
import { AgentManager } from './AgentManager.js';
import type {
  World as IWorld,
  WorldData,
  CreateWorldParams,
  UpdateWorldParams,
  CreateAgentParams,
  UpdateAgentParams,
  AgentInfo,
  AgentMessage,
  CreateChatParams,
  UpdateChatParams,
  ChatData,
  WorldChat,
  WorldMessageEvent,
  WorldSSEEvent,
  LLMProvider,
  StorageManager,
  MessageProcessor
} from '../types.js';
import type { BaseStorageManager } from '../storage/BaseStorageManager.js';

/**
 * World configuration for class instantiation
 */
export interface WorldConfig extends CreateWorldParams {
  id: string;
  rootPath: string;
  currentChatId?: string | null;
}

/**
 * World metrics for performance monitoring
 */
export interface WorldMetrics {
  totalAgents: number;
  activeAgents: number;
  totalChats: number;
  totalMessages: number;
  eventCount: number;
  averageResponseTime: number;
  lastActivity: Date | null;
}

/**
 * World class implementing the complete World interface
 */
export class World extends EventEmitter implements IWorld {
  // Core properties
  public readonly id: string;
  public readonly rootPath: string;
  public name: string;
  public description?: string;
  public turnLimit: number;
  public chatLLMProvider?: LLMProvider;
  public chatLLMModel?: string;
  public currentChatId: string | null;

  // Runtime objects
  public readonly eventEmitter: EventEmitter;
  public readonly agents: Map<string, Agent>;

  // Unified interfaces
  public readonly storage: StorageManager;
  public readonly messageProcessor: MessageProcessor;

  // Private properties
  private agentManager: AgentManager;
  private storageManager: BaseStorageManager;
  private metrics: WorldMetrics;
  private isInitialized: boolean = false;

  constructor(
    config: WorldConfig,
    storageManager: BaseStorageManager
  ) {
    super();

    // Initialize core properties
    this.id = config.id;
    this.rootPath = config.rootPath;
    this.name = config.name;
    this.description = config.description;
    this.turnLimit = config.turnLimit || 5;
    this.chatLLMProvider = config.chatLLMProvider;
    this.chatLLMModel = config.chatLLMModel;
    this.currentChatId = config.currentChatId || null;

    // Initialize runtime objects
    this.eventEmitter = this;
    this.agents = new Map();
    this.storageManager = storageManager;

    // Create unified interfaces
    this.storage = this.createStorageManager();
    this.messageProcessor = this.createMessageProcessor();

    // Initialize agent manager
    this.agentManager = new AgentManager(storageManager, {
      worldId: this.id
    });

    // Initialize metrics
    this.metrics = {
      totalAgents: 0,
      activeAgents: 0,
      totalChats: 0,
      totalMessages: 0,
      eventCount: 0,
      averageResponseTime: 0,
      lastActivity: null
    };
  }

  // ========================================
  // INITIALIZATION AND LIFECYCLE
  // ========================================

  /**
   * Initialize world with agents and restore state
   */
  async initialize(): Promise<void> {
    // Initialize agent manager
    await this.agentManager.initialize(this);

    // Load agents into runtime map
    await this.loadAgentsIntoWorld();

    // Auto-restore last chat if available
    await this.autoRestoreLastChat();

    this.isInitialized = true;

    this.emit('worldInitialized', {
      worldId: this.id,
      agentCount: this.agents.size,
      timestamp: new Date()
    });
  }

  /**
   * Cleanup world resources
   */
  async cleanup(): Promise<void> {
    // Save current state
    await this.save();

    // Cleanup agent manager
    await this.agentManager.cleanup();

    this.isInitialized = false;

    this.emit('worldCleanup', {
      worldId: this.id,
      timestamp: new Date()
    });
  }

  // ========================================
  // STATIC FACTORY METHODS
  // ========================================

  /**
   * Create new world instance - replaces worldDataToWorld factory
   */
  static async create(
    config: WorldConfig,
    storageManager: BaseStorageManager
  ): Promise<World> {
    const world = new World(config, storageManager);
    await world.initialize();
    return world;
  }

  /**
   * Create world from existing world data
   */
  static async fromWorldData(
    worldData: WorldData,
    rootPath: string,
    storageManager: BaseStorageManager
  ): Promise<World> {
    const config: WorldConfig = {
      id: worldData.id,
      rootPath,
      name: worldData.name,
      description: worldData.description,
      turnLimit: worldData.turnLimit,
      chatLLMProvider: worldData.chatLLMProvider as LLMProvider,
      chatLLMModel: worldData.chatLLMModel,
      currentChatId: worldData.currentChatId
    };

    return await World.create(config, storageManager);
  }

  // ========================================
  // AGENT OPERATION METHODS
  // ========================================

  async createAgent(params: CreateAgentParams): Promise<Agent> {
    this.ensureInitialized();

    const agent = await this.agentManager.createAgent(params);

    // Add to runtime map
    this.agents.set(agent.id, agent);

    // Subscribe agent to world messages
    this.subscribeAgent(agent);

    await this.updateMetrics();

    this.emit('agentCreated', {
      agentId: agent.id,
      agentName: agent.name,
      timestamp: new Date()
    });

    return agent;
  }

  async getAgent(agentName: string): Promise<Agent | null> {
    this.ensureInitialized();

    const agentId = this.toKebabCase(agentName);

    // Check runtime map first
    if (this.agents.has(agentId)) {
      return this.agents.get(agentId)!;
    }

    // Load from agent manager
    const agent = await this.agentManager.getAgent(agentId);
    if (agent) {
      this.agents.set(agentId, agent);
      this.subscribeAgent(agent);
    }

    return agent;
  }

  async updateAgent(agentName: string, updates: UpdateAgentParams): Promise<Agent | null> {
    this.ensureInitialized();

    const agentId = this.toKebabCase(agentName);
    const agent = await this.agentManager.updateAgent(agentId, updates);

    if (agent) {
      // Update runtime map
      this.agents.set(agentId, agent);

      this.emit('agentUpdated', {
        agentId,
        updates,
        timestamp: new Date()
      });
    }

    return agent;
  }

  async deleteAgent(agentName: string): Promise<boolean> {
    this.ensureInitialized();

    const agentId = this.toKebabCase(agentName);
    const success = await this.agentManager.deleteAgent(agentId);

    if (success) {
      // Remove from runtime map
      this.agents.delete(agentId);

      // Unsubscribe from events
      this.unsubscribeAgent(agentId);

      await this.updateMetrics();

      this.emit('agentDeleted', {
        agentId,
        timestamp: new Date()
      });
    }

    return success;
  }

  async clearAgentMemory(agentName: string): Promise<Agent | null> {
    this.ensureInitialized();

    const agentId = this.toKebabCase(agentName);
    const agent = await this.agentManager.clearAgentMemory(agentId);

    if (agent) {
      // Update runtime map
      this.agents.set(agentId, agent);

      this.emit('agentMemoryCleared', {
        agentId,
        timestamp: new Date()
      });
    }

    return agent;
  }

  async listAgents(): Promise<AgentInfo[]> {
    this.ensureInitialized();
    return await this.agentManager.listAgents();
  }

  async updateAgentMemory(agentName: string, messages: AgentMessage[]): Promise<Agent | null> {
    this.ensureInitialized();

    const agentId = this.toKebabCase(agentName);
    const agent = await this.agentManager.updateAgentMemory(agentId, messages);

    if (agent) {
      // Update runtime map
      this.agents.set(agentId, agent);
    }

    return agent;
  }

  async saveAgentConfig(agentName: string): Promise<void> {
    this.ensureInitialized();

    const agentId = this.toKebabCase(agentName);
    const agent = this.agents.get(agentId);

    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }

    await this.storageManager.saveAgent(this.id, agent);
  }

  // ========================================
  // CHAT HISTORY METHODS
  // ========================================

  async createChatData(params: CreateChatParams): Promise<ChatData> {
    this.ensureInitialized();

    const chatId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    // Create WorldChat if requested
    let worldChat: WorldChat | undefined;
    if (params.captureChat) {
      worldChat = await this.createWorldChat();
    }

    const chatData: ChatData = {
      id: chatId,
      worldId: this.id,
      name: params.name || "New Chat",
      description: params.description,
      createdAt: now,
      updatedAt: now,
      messageCount: worldChat?.messages?.length || 0,
      chat: worldChat
    };

    await this.storageManager.saveChatData(this.id, chatData);

    if (worldChat) {
      await this.storageManager.saveWorldChat(this.id, chatId, worldChat);
    }

    await this.updateMetrics();

    this.emit('chatCreated', {
      chatId,
      chatName: chatData.name,
      timestamp: new Date()
    });

    return chatData;
  }

  async loadChatData(chatId: string): Promise<ChatData | null> {
    this.ensureInitialized();
    return await this.storageManager.loadChatData(this.id, chatId);
  }

  async loadChat(chatId: string): Promise<ChatData | null> {
    return await this.loadChatData(chatId);
  }

  async loadChatFull(chatId: string): Promise<WorldChat | null> {
    this.ensureInitialized();
    return await this.storageManager.loadWorldChat(this.id, chatId);
  }

  async updateChatData(chatId: string, updates: UpdateChatParams): Promise<ChatData | null> {
    this.ensureInitialized();
    return await this.storageManager.updateChatData(this.id, chatId, updates);
  }

  async deleteChatData(chatId: string): Promise<boolean> {
    this.ensureInitialized();

    const success = await this.storageManager.deleteChatData(this.id, chatId);

    if (success) {
      // Smart fallback: manage currentChatId state
      if (this.currentChatId === chatId) {
        // Find the latest remaining chat
        const remainingChats = await this.listChats();

        if (remainingChats.length === 0) {
          // No chats remaining - set to null
          this.currentChatId = null;
        } else {
          // Switch to the most recently updated chat
          const latestChat = remainingChats.reduce((latest, chat) =>
            new Date(chat.updatedAt) > new Date(latest.updatedAt) ? chat : latest
          );
          this.currentChatId = latestChat.id;
        }

        // Save the updated world state
        await this.save();
      }

      await this.updateMetrics();

      this.emit('chatDeleted', {
        chatId,
        newCurrentChatId: this.currentChatId,
        timestamp: new Date()
      });
    }

    return success;
  }

  async listChats(): Promise<ChatData[]> {
    this.ensureInitialized();
    return await this.storageManager.listChats(this.id);
  }

  async createWorldChat(): Promise<WorldChat> {
    this.ensureInitialized();

    const worldData = await this.toWorldData();
    const agents = Array.from(this.agents.values()).map(agent => agent.toJSON());

    const allMessages: AgentMessage[] = [];
    for (const agent of this.agents.values()) {
      allMessages.push(...agent.memory);
    }

    // Sort messages by timestamp
    allMessages.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeA - timeB;
    });

    const worldChat: WorldChat = {
      world: worldData,
      agents,
      messages: allMessages,
      metadata: {
        capturedAt: new Date(),
        version: '1.0',
        totalMessages: allMessages.length,
        activeAgents: agents.filter(a => a.status === 'active').length
      }
    };

    return worldChat;
  }

  async restoreFromWorldChat(chatId: string): Promise<boolean> {
    this.ensureInitialized();

    const worldChat = await this.storageManager.loadWorldChat(this.id, chatId);
    if (!worldChat) {
      return false;
    }

    return await this.storageManager.restoreFromWorldChat(this.id, worldChat);
  }

  // ========================================
  // ENHANCED CHAT MANAGEMENT METHODS
  // ========================================

  async isCurrentChatReusable(): Promise<boolean> {
    this.ensureInitialized();

    if (!this.currentChatId) {
      return false;
    }

    try {
      const currentChat = await this.loadChatData(this.currentChatId);
      if (!currentChat) {
        return false;
      }

      // Chat is reusable if title is "New Chat" OR message count is 0
      return currentChat.name === "New Chat" || currentChat.messageCount === 0;

    } catch (error) {
      return false;
    }
  }

  async reuseCurrentChat(): Promise<World> {
    this.ensureInitialized();

    if (!this.currentChatId) {
      throw new Error('No current chat to reuse');
    }

    // Reset agent memories
    for (const agent of this.agents.values()) {
      await agent.archiveMemory();
    }

    // Update chat metadata
    await this.updateChatData(this.currentChatId, {
      messageCount: 0
    });

    // Save current state
    await this.saveCurrentState();

    this.emit('chatReused', {
      chatId: this.currentChatId,
      timestamp: new Date()
    });

    return this;
  }

  async createNewChat(): Promise<World> {
    this.ensureInitialized();

    // Save current state if there's an active chat
    if (this.currentChatId) {
      await this.saveCurrentState();
    }

    // Create new chat
    const newChatData = await this.createChatData({
      name: 'New Chat',
      description: 'New chat session',
      captureChat: true
    });

    // Reset agent memories
    for (const agent of this.agents.values()) {
      await agent.archiveMemory();
    }

    // Update current chat ID
    this.currentChatId = newChatData.id;

    // Save world state with new chat ID
    await this.save();

    this.emit('newChatCreated', {
      chatId: this.currentChatId,
      timestamp: new Date()
    });

    return this;
  }

  async newChat(): Promise<World> {
    this.ensureInitialized();

    // Check if current chat is reusable
    const canReuse = await this.isCurrentChatReusable();
    if (canReuse) {
      return await this.reuseCurrentChat();
    }

    return await this.createNewChat();
  }

  async loadChatById(chatId: string): Promise<void> {
    this.ensureInitialized();

    // Save current state
    if (this.currentChatId && this.currentChatId !== chatId) {
      await this.saveCurrentState();
    }

    // Restore chat state
    const success = await this.restoreFromWorldChat(chatId);
    if (!success) {
      throw new Error(`Failed to restore chat ${chatId}`);
    }

    // Update current chat ID
    this.currentChatId = chatId;
    await this.save();

    this.emit('chatLoaded', {
      chatId,
      timestamp: new Date()
    });
  }

  async getCurrentChat(): Promise<ChatData | null> {
    this.ensureInitialized();

    if (!this.currentChatId) {
      return null;
    }

    return await this.loadChatData(this.currentChatId);
  }

  async saveCurrentState(): Promise<void> {
    this.ensureInitialized();

    if (!this.currentChatId) {
      return;
    }

    // Collect all messages
    const allMessages: AgentMessage[] = [];
    for (const agent of this.agents.values()) {
      allMessages.push(...agent.memory);
    }

    // Update chat with current state
    await this.updateChatData(this.currentChatId, {
      messageCount: allMessages.length
    });

    this.emit('stateAutoSaved', {
      chatId: this.currentChatId,
      messageCount: allMessages.length,
      timestamp: new Date()
    });
  }

  // ========================================
  // WORLD OPERATIONS
  // ========================================

  async save(): Promise<void> {
    this.ensureInitialized();

    const worldData = await this.toWorldData();
    await this.storageManager.saveWorld(worldData);

    this.emit('worldSaved', {
      worldId: this.id,
      timestamp: new Date()
    });
  }

  async delete(): Promise<boolean> {
    this.ensureInitialized();

    await this.cleanup();
    return await this.storageManager.deleteWorld(this.id);
  }

  async reload(): Promise<void> {
    this.ensureInitialized();

    const worldData = await this.storageManager.loadWorld(this.id);
    if (worldData) {
      this.name = worldData.name;
      this.description = worldData.description;
      this.turnLimit = worldData.turnLimit;
      this.chatLLMProvider = worldData.chatLLMProvider as LLMProvider;
      this.chatLLMModel = worldData.chatLLMModel;
      this.currentChatId = worldData.currentChatId || null;
    }

    this.emit('worldReloaded', {
      worldId: this.id,
      timestamp: new Date()
    });
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  getTurnLimit(): number {
    return this.turnLimit;
  }

  getCurrentTurnCount(): number {
    let totalCalls = 0;
    for (const agent of this.agents.values()) {
      totalCalls += agent.llmCallCount;
    }
    return totalCalls;
  }

  hasReachedTurnLimit(): boolean {
    return this.getCurrentTurnCount() >= this.turnLimit;
  }

  resetTurnCount(): void {
    for (const agent of this.agents.values()) {
      agent.llmCallCount = 0;
      agent.lastLLMCall = undefined;
    }
  }

  // ========================================
  // EVENT METHODS
  // ========================================

  publishMessage(content: string, sender: string): void {
    const messageEvent: WorldMessageEvent = {
      content,
      sender,
      timestamp: new Date(),
      messageId: this.generateId()
    };

    this.emit('message', messageEvent);
    this.metrics.eventCount++;
    this.metrics.lastActivity = new Date();

    // Handle chat session mode based on currentChatId
    if (this.currentChatId) {
      // Session mode is ON - handle different sender types
      setTimeout(async () => {
        try {
          await this.handleChatSessionMessage(messageEvent);
        } catch (error) {
          this.emit('chatSessionError', {
            error: error instanceof Error ? error.message : String(error),
            chatId: this.currentChatId,
            timestamp: new Date()
          });
        }
      }, 100); // Small delay to allow message processing to complete
    }
    // When currentChatId is null, session mode is OFF - no automatic chat operations
  }

  /**
   * Handle chat session messages based on sender type
   * Implements new chat session logic:
   * - Human messages: update chat title
   * - Agent messages: save the chat
   */
  private async handleChatSessionMessage(messageEvent: WorldMessageEvent): Promise<void> {
    const { sender } = messageEvent;
    const isHumanMessage = sender === 'HUMAN' || sender === 'human';
    const isAgentMessage = sender !== 'HUMAN' && sender !== 'human' && sender !== 'system' && sender !== 'world';

    if (isHumanMessage) {
      // Human message should update the chat title
      await this.updateChatTitle(messageEvent);
    } else if (isAgentMessage) {
      // Agent message should save the chat
      await this.saveChatState(messageEvent);
    }
  }

  /**
   * Update chat title based on human message content
   */
  private async updateChatTitle(messageEvent: WorldMessageEvent): Promise<void> {
    if (!this.currentChatId) return;

    try {
      // Generate title from the human message content
      const title = this.generateTitleFromContent(messageEvent.content);

      // Update the chat with new title
      const updatedChat = await this.updateChatData(this.currentChatId, {
        name: title,
        messageCount: await this.getCurrentMessageCount()
      });

      if (updatedChat) {
        // Publish chat-updated system event to frontend
        this.emit('system', {
          worldId: this.id,
          chatId: this.currentChatId,
          type: 'chat-title-updated'
        });
      }
    } catch (error) {
      // Log error but don't break message flow
      this.emit('chatTitleUpdateError', {
        error: error instanceof Error ? error.message : String(error),
        chatId: this.currentChatId,
        timestamp: new Date()
      });
    }
  }

  /**
   * Save current chat state when agent responds
   */
  private async saveChatState(messageEvent: WorldMessageEvent): Promise<void> {
    if (!this.currentChatId) return;

    try {
      // Create world chat snapshot
      const worldChat = await this.createWorldChat();

      // Save the complete chat state
      await this.storageManager.saveWorldChat(this.id, this.currentChatId, worldChat);

      // Update chat metadata
      const messageCount = await this.getCurrentMessageCount();
      await this.updateChatData(this.currentChatId, {
        messageCount: messageCount
      });

      // Publish chat-updated system event to frontend
      this.emit('system', {
        worldId: this.id,
        chatId: this.currentChatId,
        type: 'chat-saved'
      });

    } catch (error) {
      // Log error but don't break message flow
      this.emit('chatSaveError', {
        error: error instanceof Error ? error.message : String(error),
        chatId: this.currentChatId,
        timestamp: new Date()
      });
    }
  }

  /**
   * Generate a title from message content
   */
  private generateTitleFromContent(content: string): string {
    if (!content || content.trim().length === 0) {
      return 'New Chat';
    }

    // Clean and truncate content for title
    let title = content.trim()
      .replace(/^(Hello|Hi|Hey)[,!.]?\s*/i, '')
      .replace(/^I\s+(am|'m)\s+/i, '')
      .replace(/^(Let me|I'll|I will)\s+/i, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markdown
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic markdown
      .replace(/[#]+\s*/, '') // Remove headers
      .trim();

    // Split into words and take first 8
    const words = title.split(/\s+/).slice(0, 8);
    title = words.join(' ');

    // If too long, try to find a natural break point
    if (title.length > 50) {
      const sentences = title.split(/[.!?]/);
      if (sentences[0] && sentences[0].length <= 50) {
        title = sentences[0].trim();
      } else {
        title = words.slice(0, 5).join(' ');
      }
    }

    // Clean up ending punctuation if it's mid-sentence
    title = title.replace(/[,;:]$/, '');

    // Add ellipsis if we truncated
    if (words.length > 5 || content.split(/\s+/).length > words.length) {
      title += '...';
    }

    return title || 'New Chat';
  }

  /**
   * Get current total message count across all agents
   */
  private async getCurrentMessageCount(): Promise<number> {
    let totalMessages = 0;
    for (const [, agent] of this.agents) {
      if (agent.memory && Array.isArray(agent.memory)) {
        totalMessages += agent.memory.length;
      }
    }
    return totalMessages;
  }

  subscribeToMessages(handler: (event: WorldMessageEvent) => void): () => void {
    this.on('message', handler);
    return () => this.off('message', handler);
  }

  publishSSE(data: Partial<WorldSSEEvent>): void {
    const sseEvent: WorldSSEEvent = {
      agentName: '',
      type: 'chunk',
      messageId: this.generateId(),
      ...data
    };

    this.emit('sse', sseEvent);
    this.metrics.eventCount++;
  }

  subscribeToSSE(handler: (event: WorldSSEEvent) => void): () => void {
    this.on('sse', handler);
    return () => this.off('sse', handler);
  }

  // ========================================
  // AGENT SUBSCRIPTION METHODS
  // ========================================

  subscribeAgent(agent: Agent): () => void {
    const handler = async (event: WorldMessageEvent) => {
      try {
        const shouldRespond = await agent.shouldRespond(event);
        if (shouldRespond) {
          await agent.processMessage(event);
        }
      } catch (error) {
        this.emit('agentMessageError', {
          agentId: agent.id,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date()
        });
      }
    };

    this.on('message', handler);

    return () => this.off('message', handler);
  }

  unsubscribeAgent(agentId: string): void {
    // Remove all listeners for this agent
    this.removeAllListeners(`agent:${agentId}`);
  }

  getSubscribedAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  isAgentSubscribed(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private async loadAgentsIntoWorld(): Promise<void> {
    const agents = await this.storageManager.listAgents(this.id);

    for (const agentData of agents) {
      const agent = Agent.fromJSON(agentData);
      await agent.initialize(this.storageManager, this.id, this);

      this.agents.set(agent.id, agent);
      this.subscribeAgent(agent);
    }
  }

  private async autoRestoreLastChat(): Promise<void> {
    try {
      if (this.currentChatId) {
        const chatData = await this.loadChatData(this.currentChatId);
        if (chatData?.chat) {
          // Restore agent memory from chat
          for (const snapshotAgent of chatData.chat.agents) {
            const worldAgent = this.agents.get(snapshotAgent.id);
            if (worldAgent && snapshotAgent.memory) {
              worldAgent.memory = [...snapshotAgent.memory];
            }
          }
        }
      }
    } catch (error) {
      // Log error but don't fail initialization
      this.emit('autoRestoreError', {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      });
    }
  }

  private createStorageManager(): StorageManager {
    return {
      saveWorld: (worldData: WorldData) => this.storageManager.saveWorld(worldData),
      loadWorld: (worldId: string) => this.storageManager.loadWorld(worldId),
      deleteWorld: (worldId: string) => this.storageManager.deleteWorld(worldId),
      listWorlds: () => this.storageManager.listWorlds(),
      saveAgent: (worldId: string, agent: any) => this.storageManager.saveAgent(worldId, agent),
      loadAgent: (worldId: string, agentId: string) => this.storageManager.loadAgent(worldId, agentId),
      deleteAgent: (worldId: string, agentId: string) => this.storageManager.deleteAgent(worldId, agentId),
      listAgents: (worldId: string) => this.storageManager.listAgents(worldId),
      saveAgentsBatch: (worldId: string, agents: any[]) => this.storageManager.saveAgentsBatch(worldId, agents),
      loadAgentsBatch: (worldId: string, agentIds: string[]) => this.storageManager.loadAgentsBatch(worldId, agentIds),
      saveChatData: (worldId: string, chat: ChatData) => this.storageManager.saveChatData(worldId, chat),
      loadChatData: (worldId: string, chatId: string) => this.storageManager.loadChatData(worldId, chatId),
      deleteChatData: (worldId: string, chatId: string) => this.storageManager.deleteChatData(worldId, chatId),
      listChats: (worldId: string) => this.storageManager.listChats(worldId),
      updateChatData: (worldId: string, chatId: string, updates: UpdateChatParams) => this.storageManager.updateChatData(worldId, chatId, updates),
      saveWorldChat: (worldId: string, chatId: string, chat: WorldChat) => this.storageManager.saveWorldChat(worldId, chatId, chat),
      loadWorldChat: (worldId: string, chatId: string) => this.storageManager.loadWorldChat(worldId, chatId),
      loadWorldChatFull: (worldId: string, chatId: string) => this.storageManager.loadWorldChat(worldId, chatId),
      restoreFromWorldChat: (worldId: string, chat: WorldChat) => this.storageManager.restoreFromWorldChat(worldId, chat),
      validateIntegrity: (worldId: string, agentId?: string) => this.storageManager.validateIntegrity(worldId, agentId).then(result => result.isValid),
      repairData: (worldId: string, agentId?: string) => this.storageManager.repairData(worldId, agentId)
    };
  }

  private createMessageProcessor(): MessageProcessor {
    return {
      extractMentions: (content: string) => this.extractMentions(content),
      extractParagraphBeginningMentions: (content: string) => this.extractParagraphBeginningMentions(content),
      determineSenderType: (sender: string | undefined) => this.determineSenderType(sender),
      shouldAutoMention: (response: string, sender: string, agentId: string) => false, // Placeholder
      addAutoMention: (response: string, sender: string) => response, // Placeholder
      removeSelfMentions: (response: string, agentId: string) => response // Placeholder
    };
  }

  private extractMentions(content: string): string[] {
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1].toLowerCase());
    }

    return mentions;
  }

  private extractParagraphBeginningMentions(content: string): string[] {
    const lines = content.split('\n');
    const mentions: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^@([a-zA-Z0-9_-]+)/);
      if (match) {
        mentions.push(match[1].toLowerCase());
      }
    }

    return mentions;
  }

  private determineSenderType(sender: string | undefined): any {
    if (!sender) return 'system';
    if (sender === 'system') return 'system';
    if (sender === 'world') return 'world';
    if (this.agents.has(sender)) return 'agent';
    return 'human';
  }

  private toKebabCase(str: string): string {
    return str.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async updateMetrics(): Promise<void> {
    try {
      const agents = await this.listAgents();
      this.metrics.totalAgents = agents.length;
      this.metrics.activeAgents = agents.filter(a => a.status === 'active').length;

      const chats = await this.listChats();
      this.metrics.totalChats = chats.length;

      this.metrics.totalMessages = Array.from(this.agents.values())
        .reduce((total, agent) => total + agent.memory.length, 0);

    } catch (error) {
      // Metrics update failure should not break operations
    }
  }

  private async toWorldData(): Promise<WorldData> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      turnLimit: this.turnLimit,
      chatLLMProvider: this.chatLLMProvider,
      chatLLMModel: this.chatLLMModel,
      currentChatId: this.currentChatId,
      createdAt: new Date(), // This should ideally preserve the original
      lastUpdated: new Date(),
      totalAgents: this.agents.size,
      totalMessages: this.metrics.totalMessages
    };
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('World not initialized. Call initialize() first.');
    }
  }

  /**
   * Get world metrics
   */
  getMetrics(): WorldMetrics {
    return { ...this.metrics };
  }
}
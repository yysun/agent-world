# Class-Based Architecture Implementation Plan

**Objective**: Convert the current function-based World, Agent, and Chat systems to a class-based architecture with proper encapsulation, improved maintainability, and better IDE support.

## Analysis of Current Issues

### Current Function-Based Problems:
- [ ] **Massive factory function**: `worldDataToWorld` is 600+ lines with all methods as closures
- [ ] **No access control**: All methods are effectively "public" with no true privacy
- [ ] **Runtime overhead**: Every world instance creates new function closures for all methods
- [ ] **Poor testability**: Internal logic is buried inside factory closure
- [ ] **IDE limitations**: No method autocompletion, difficult navigation and refactoring
- [ ] **Memory inefficiency**: Function closures vs prototype methods
- [ ] **Complex maintenance**: Hard to understand method relationships and dependencies

### Benefits of Class-Based Approach:
- [ ] **True encapsulation**: `private` and `public` methods with compile-time enforcement
- [ ] **Better structure**: Methods organized clearly, easier to navigate
- [ ] **Prototype efficiency**: Methods shared across instances via prototype
- [ ] **Enhanced IDE support**: Full autocompletion, easier refactoring
- [ ] **Better testability**: Can test private methods via bracket notation if needed
- [ ] **Inheritance support**: Could extend base classes if needed
- [ ] **Cleaner interfaces**: Separate concerns between implementation and contract

## Implementation Strategy

### Phase 1: Core Infrastructure Classes
**Priority**: High | **Estimated Time**: 2-3 days

#### 1.1 Create Base Storage Manager Class
- [ ] **Create `core/storage/BaseStorageManager.ts`**
  - [ ] Convert `StorageManager` interface to abstract base class
  - [ ] Define abstract methods for world, agent, and chat operations
  - [ ] Implement common validation and error handling logic
  - [ ] Add protected utility methods for path resolution

#### 1.2 Create SQLite Storage Implementation
- [ ] **Create `core/storage/SQLiteStorageManager.ts`**
  - [ ] Extend `BaseStorageManager`
  - [ ] Migrate existing SQLite functions to class methods
  - [ ] Use private methods for internal database operations
  - [ ] Implement connection pooling and transaction management

#### 1.3 Create File Storage Implementation
- [ ] **Create `core/storage/FileStorageManager.ts`**
  - [ ] Extend `BaseStorageManager`
  - [ ] Migrate existing file-based functions to class methods
  - [ ] Use private methods for file I/O operations
  - [ ] Implement atomic file operations with backup/restore

### Phase 2: Chat Management Classes
**Priority**: High | **Estimated Time**: 2-3 days

#### 2.1 Create ChatData Class
- [ ] **Create `core/chat/ChatData.ts`**
  ```typescript
  export class ChatData {
    private _id: string;
    private _worldId: string;
    private _name: string;
    private _description?: string;
    private _createdAt: Date;
    private _updatedAt: Date;
    private _messageCount: number;
    private _tags?: string[];
    
    constructor(params: CreateChatParams & { id: string; worldId: string }) {
      // Initialize properties
    }
    
    // Public getters
    public get id(): string { return this._id; }
    public get name(): string { return this._name; }
    // ... other getters
    
    // Public update methods
    public updateName(name: string): void {
      this._name = name;
      this._updatedAt = new Date();
    }
    
    public updateDescription(description: string): void {
      this._description = description;
      this._updatedAt = new Date();
    }
    
    public incrementMessageCount(): void {
      this._messageCount++;
      this._updatedAt = new Date();
    }
    
    // Serialization
    public toJSON(): ChatDataJSON {
      return {
        id: this._id,
        worldId: this._worldId,
        name: this._name,
        description: this._description,
        createdAt: this._createdAt,
        updatedAt: this._updatedAt,
        messageCount: this._messageCount,
        tags: this._tags
      };
    }
    
    public static fromJSON(data: ChatDataJSON): ChatData {
      // Factory method for deserialization
    }
  }
  ```

#### 2.2 Create WorldChat Class
- [ ] **Create `core/chat/WorldChat.ts`**
  ```typescript
  export class WorldChat {
    private _world: WorldData;
    private _agents: AgentData[];
    private _messages: AgentMessage[];
    private _metadata: WorldChatMetadata;
    
    constructor(world: WorldData, agents: AgentData[], messages: AgentMessage[]) {
      this._world = world;
      this._agents = agents;
      this._messages = messages.sort((a, b) => 
        this.getMessageTimestamp(a) - this.getMessageTimestamp(b)
      );
      this._metadata = this.generateMetadata();
    }
    
    // Public getters
    public get totalMessages(): number { return this._messages.length; }
    public get activeAgents(): number { return this._agents.length; }
    
    // Message operations
    public addMessage(message: AgentMessage): void {
      this._messages.push(message);
      this._metadata = this.generateMetadata();
    }
    
    // Private utilities
    private getMessageTimestamp(message: AgentMessage): number {
      return message.createdAt instanceof Date 
        ? message.createdAt.getTime() 
        : new Date(message.createdAt || 0).getTime();
    }
    
    private generateMetadata(): WorldChatMetadata {
      return {
        capturedAt: new Date(),
        version: '1.0.0',
        totalMessages: this._messages.length,
        activeAgents: this._agents.length
      };
    }
    
    // Serialization
    public toJSON(): WorldChatJSON { /* ... */ }
    public static fromJSON(data: WorldChatJSON): WorldChat { /* ... */ }
  }
  ```

#### 2.3 Create Chat Manager Class
- [ ] **Create `core/chat/ChatManager.ts`**
  ```typescript
  export class ChatManager {
    private storage: BaseStorageManager;
    private worldId: string;
    
    constructor(storage: BaseStorageManager, worldId: string) {
      this.storage = storage;
      this.worldId = worldId;
    }
    
    // Public API methods
    public async createChat(params: CreateChatParams): Promise<ChatData> {
      const chatData = new ChatData({
        ...params,
        id: this.generateChatId(),
        worldId: this.worldId
      });
      
      await this.storage.saveChatData(this.worldId, chatData.toJSON());
      return chatData;
    }
    
    public async getChat(chatId: string): Promise<ChatData | null> {
      const data = await this.storage.loadChatData(this.worldId, chatId);
      return data ? ChatData.fromJSON(data) : null;
    }
    
    public async updateChat(chatId: string, updates: UpdateChatParams): Promise<ChatData | null> {
      const chat = await this.getChat(chatId);
      if (!chat) return null;
      
      // Apply updates using class methods
      if (updates.name) chat.updateName(updates.name);
      if (updates.description) chat.updateDescription(updates.description);
      
      await this.storage.updateChatData(this.worldId, chatId, updates);
      return chat;
    }
    
    public async deleteChat(chatId: string): Promise<boolean> {
      return await this.storage.deleteChatData(this.worldId, chatId);
    }
    
    public async listChats(): Promise<ChatData[]> {
      const chatsData = await this.storage.listChats(this.worldId);
      return chatsData.map(data => ChatData.fromJSON(data));
    }
    
    // Private utilities
    private generateChatId(): string {
      return `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  }
  ```

### Phase 3: Agent Class Implementation
**Priority**: High | **Estimated Time**: 3-4 days

#### 3.1 Create Agent Class
- [ ] **Create `core/agent/Agent.ts`**
  ```typescript
  export class Agent {
    // Private properties
    private _id: string;
    private _name: string;
    private _type: string;
    private _status: AgentStatus;
    private _provider: LLMProvider;
    private _model: string;
    private _systemPrompt?: string;
    private _temperature?: number;
    private _maxTokens?: number;
    private _createdAt: Date;
    private _lastActive: Date;
    private _llmCallCount: number;
    private _lastLLMCall?: Date;
    private _memory: AgentMessage[];
    private _world?: World;
    
    constructor(params: CreateAgentParams & { id: string }) {
      this._id = params.id;
      this._name = params.name;
      this._type = params.type;
      this._status = 'active';
      this._provider = params.provider;
      this._model = params.model;
      this._systemPrompt = params.systemPrompt;
      this._temperature = params.temperature;
      this._maxTokens = params.maxTokens;
      this._createdAt = new Date();
      this._lastActive = new Date();
      this._llmCallCount = 0;
      this._memory = [];
    }
    
    // Public getters
    public get id(): string { return this._id; }
    public get name(): string { return this._name; }
    public get memory(): AgentMessage[] { return [...this._memory]; } // Return copy
    public get memorySize(): number { return this._memory.length; }
    
    // === PUBLIC API METHODS ===
    
    // LLM operation methods
    public async generateResponse(messages: AgentMessage[]): Promise<string> {
      this.incrementLLMCall();
      const { generateAgentResponse } = await import('../llm-manager.js');
      return await generateAgentResponse(this._world!, this, messages);
    }
    
    public async streamResponse(messages: AgentMessage[]): Promise<string> {
      this.incrementLLMCall();
      const { streamAgentResponse } = await import('../llm-manager.js');
      return await streamAgentResponse(this._world!, this, messages);
    }
    
    // Memory management methods
    public async addToMemory(message: AgentMessage): Promise<void> {
      this._memory.push(message);
      this._lastActive = new Date();
      
      if (this._world) {
        await this._world.storage.saveAgent(this._world.id, this.toAgentData());
      }
    }
    
    public getMemorySlice(start: number, end: number): AgentMessage[] {
      return this._memory.slice(start, end);
    }
    
    public searchMemory(query: string): AgentMessage[] {
      return this._memory.filter(msg => 
        msg.content.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    public async archiveMemory(): Promise<void> {
      if (this._world) {
        await this._world.storage.archiveMemory(this._world.id, this._id, [...this._memory]);
        this._memory = [];
        this._lastActive = new Date();
      }
    }
    
    public async clearMemory(): Promise<void> {
      await this.archiveMemory();
      this._llmCallCount = 0;
      this._lastLLMCall = undefined;
    }
    
    // Message processing methods
    public async shouldRespond(messageEvent: WorldMessageEvent): Promise<boolean> {
      const { shouldAgentRespond } = await import('../events.js');
      return await shouldAgentRespond(this._world!, this, messageEvent);
    }
    
    public async processMessage(messageEvent: WorldMessageEvent): Promise<void> {
      const { processAgentMessage } = await import('../events.js');
      await processAgentMessage(this._world!, this, messageEvent);
    }
    
    // === INTERNAL METHODS ===
    
    // World association (internal)
    public _setWorld(world: World): void {
      this._world = world;
    }
    
    public _removeWorld(): void {
      this._world = undefined;
    }
    
    // Status management (internal)
    public _setStatus(status: AgentStatus): void {
      this._status = status;
      this._lastActive = new Date();
    }
    
    // Memory manipulation (internal)
    public _setMemory(memory: AgentMessage[]): void {
      this._memory = [...memory];
      this._lastActive = new Date();
    }
    
    // Configuration updates (internal)
    public _updateConfig(updates: UpdateAgentParams): void {
      if (updates.name) this._name = updates.name;
      if (updates.type) this._type = updates.type;
      if (updates.provider) this._provider = updates.provider;
      if (updates.model) this._model = updates.model;
      if (updates.systemPrompt !== undefined) this._systemPrompt = updates.systemPrompt;
      if (updates.temperature !== undefined) this._temperature = updates.temperature;
      if (updates.maxTokens !== undefined) this._maxTokens = updates.maxTokens;
      if (updates.status) this._status = updates.status;
      
      this._lastActive = new Date();
    }
    
    // === PRIVATE METHODS ===
    
    private incrementLLMCall(): void {
      this._llmCallCount++;
      this._lastLLMCall = new Date();
      this._lastActive = new Date();
    }
    
    // Serialization
    public toAgentData(): AgentData {
      return {
        id: this._id,
        name: this._name,
        type: this._type,
        status: this._status,
        provider: this._provider,
        model: this._model,
        systemPrompt: this._systemPrompt,
        temperature: this._temperature,
        maxTokens: this._maxTokens,
        createdAt: this._createdAt,
        lastActive: this._lastActive,
        llmCallCount: this._llmCallCount,
        lastLLMCall: this._lastLLMCall,
        memory: [...this._memory]
      };
    }
    
    public toAgentInfo(): AgentInfo {
      return {
        id: this._id,
        name: this._name,
        type: this._type,
        model: this._model,
        status: this._status,
        createdAt: this._createdAt,
        lastActive: this._lastActive,
        llmCallCount: this._llmCallCount,
        memorySize: this._memory.length
      };
    }
    
    public static fromAgentData(data: AgentData): Agent {
      const agent = new Agent({
        id: data.id,
        name: data.name,
        type: data.type,
        provider: data.provider,
        model: data.model,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens
      });
      
      // Restore state
      agent._setStatus(data.status || 'active');
      agent._llmCallCount = data.llmCallCount;
      agent._lastLLMCall = data.lastLLMCall;
      agent._createdAt = data.createdAt || new Date();
      agent._lastActive = data.lastActive || new Date();
      agent._setMemory(data.memory || []);
      
      return agent;
    }
  }
  ```

#### 3.2 Create Agent Manager Class
- [ ] **Create `core/agent/AgentManager.ts`**
  ```typescript
  export class AgentManager {
    private storage: BaseStorageManager;
    private worldId: string;
    private rootPath: string;
    private agents: Map<string, Agent>;
    
    constructor(storage: BaseStorageManager, worldId: string, rootPath: string) {
      this.storage = storage;
      this.worldId = worldId;
      this.rootPath = rootPath;
      this.agents = new Map();
    }
    
    // Public API methods
    public async createAgent(params: CreateAgentParams): Promise<Agent> {
      const agentId = params.id || this.generateAgentId(params.name);
      
      const agent = new Agent({ ...params, id: agentId });
      
      // Save to storage
      await this.storage.saveAgent(this.worldId, agent.toAgentData());
      
      // Add to runtime map
      this.agents.set(agentId, agent);
      
      return agent;
    }
    
    public async getAgent(agentId: string): Promise<Agent | null> {
      // Check runtime map first
      if (this.agents.has(agentId)) {
        return this.agents.get(agentId)!;
      }
      
      // Load from storage
      const agentData = await this.storage.loadAgent(this.worldId, agentId);
      if (!agentData) return null;
      
      const agent = Agent.fromAgentData(agentData);
      this.agents.set(agentId, agent);
      
      return agent;
    }
    
    public async updateAgent(agentId: string, updates: UpdateAgentParams): Promise<Agent | null> {
      const agent = await this.getAgent(agentId);
      if (!agent) return null;
      
      agent._updateConfig(updates);
      
      // Save to storage
      await this.storage.saveAgent(this.worldId, agent.toAgentData());
      
      return agent;
    }
    
    public async deleteAgent(agentId: string): Promise<boolean> {
      const success = await this.storage.deleteAgent(this.worldId, agentId);
      if (success) {
        this.agents.delete(agentId);
      }
      return success;
    }
    
    public async listAgents(): Promise<AgentInfo[]> {
      const agentDataList = await this.storage.listAgents(this.worldId);
      return agentDataList.map(data => {
        // Return info from storage, don't load full agents
        return {
          id: data.id,
          name: data.name,
          type: data.type,
          model: data.model,
          status: data.status || 'active',
          createdAt: data.createdAt || new Date(),
          lastActive: data.lastActive || new Date(),
          llmCallCount: data.llmCallCount,
          memorySize: data.memory?.length || 0
        };
      });
    }
    
    // Internal methods for World class
    public _getAllAgents(): Map<string, Agent> {
      return new Map(this.agents);
    }
    
    public _addAgentToRuntime(agent: Agent): void {
      this.agents.set(agent.id, agent);
    }
    
    public _removeAgentFromRuntime(agentId: string): void {
      this.agents.delete(agentId);
    }
    
    // Private utilities
    private generateAgentId(name: string): string {
      const { toKebabCase } = await import('../utils.js');
      return toKebabCase(name);
    }
  }
  ```

### Phase 4: World Class Implementation
**Priority**: High | **Estimated Time**: 4-5 days

#### 4.1 Create World Class
- [ ] **Create `core/world/World.ts`**
  ```typescript
  export class World {
    // Private properties
    private _id: string;
    private _rootPath: string;
    private _name: string;
    private _description?: string;
    private _turnLimit: number;
    private _chatLLMProvider?: LLMProvider;
    private _chatLLMModel?: string;
    private _currentChatId: string | null;
    private _eventEmitter: EventEmitter;
    private _storage: BaseStorageManager;
    private _messageProcessor: MessageProcessor;
    private _agentManager: AgentManager;
    private _chatManager: ChatManager;
    
    constructor(data: WorldData, rootPath: string, storage: BaseStorageManager) {
      this._id = data.id;
      this._rootPath = rootPath;
      this._name = data.name;
      this._description = data.description;
      this._turnLimit = data.turnLimit;
      this._chatLLMProvider = data.chatLLMProvider;
      this._chatLLMModel = data.chatLLMModel;
      this._currentChatId = data.currentChatId || null;
      this._eventEmitter = new EventEmitter();
      this._storage = storage;
      this._messageProcessor = this.createMessageProcessor();
      this._agentManager = new AgentManager(storage, data.id, rootPath);
      this._chatManager = new ChatManager(storage, data.id);
    }
    
    // Public getters
    public get id(): string { return this._id; }
    public get name(): string { return this._name; }
    public get agents(): Map<string, Agent> { return this._agentManager._getAllAgents(); }
    public get storage(): BaseStorageManager { return this._storage; }
    public get eventEmitter(): EventEmitter { return this._eventEmitter; }
    public get currentChatId(): string | null { return this._currentChatId; }
    
    // === PUBLIC API METHODS ===
    
    // Agent operations
    public async createAgent(params: CreateAgentParams): Promise<Agent> {
      const agent = await this._agentManager.createAgent(params);
      agent._setWorld(this);
      return agent;
    }
    
    public async getAgent(agentName: string): Promise<Agent | null> {
      const agentId = this.convertNameToId(agentName);
      const agent = await this._agentManager.getAgent(agentId);
      if (agent) {
        agent._setWorld(this);
      }
      return agent;
    }
    
    public async updateAgent(agentName: string, updates: UpdateAgentParams): Promise<Agent | null> {
      const agentId = this.convertNameToId(agentName);
      return await this._agentManager.updateAgent(agentId, updates);
    }
    
    public async deleteAgent(agentName: string): Promise<boolean> {
      const agentId = this.convertNameToId(agentName);
      return await this._agentManager.deleteAgent(agentId);
    }
    
    public async listAgents(): Promise<AgentInfo[]> {
      return await this._agentManager.listAgents();
    }
    
    // Chat operations
    public async createChatData(params: CreateChatParams): Promise<ChatData> {
      return await this._chatManager.createChat(params);
    }
    
    public async loadChatData(chatId: string): Promise<ChatData | null> {
      return await this._chatManager.getChat(chatId);
    }
    
    public async updateChatData(chatId: string, updates: UpdateChatParams): Promise<ChatData | null> {
      return await this._chatManager.updateChat(chatId, updates);
    }
    
    public async deleteChatData(chatId: string): Promise<boolean> {
      return await this._chatManager.deleteChat(chatId);
    }
    
    public async listChats(): Promise<ChatData[]> {
      return await this._chatManager.listChats();
    }
    
    // Public chat session management
    public async newChat(): Promise<World> {
      if (await this.isCurrentChatReusable()) {
        return await this.reuseCurrentChat();
      } else {
        return await this.createNewChat();
      }
    }
    
    // World operations
    public async save(): Promise<void> {
      const worldData = this.toWorldData();
      await this._storage.saveWorld(worldData);
    }
    
    public async delete(): Promise<boolean> {
      return await this._storage.deleteWorld(this._id);
    }
    
    public async reload(): Promise<void> {
      const worldData = await this._storage.loadWorld(this._id);
      if (worldData) {
        this.updateFromWorldData(worldData);
      }
    }
    
    // Event methods
    public publishMessage(content: string, sender: string): void {
      const { publishMessage } = require('../events.js');
      publishMessage(this, content, sender);
    }
    
    public subscribeToMessages(handler: (event: WorldMessageEvent) => void): () => void {
      const { subscribeToMessages } = require('../events.js');
      return subscribeToMessages(this, handler);
    }
    
    // === INTERNAL IMPLEMENTATION METHODS ===
    
    // Chat session management (internal)
    public async isCurrentChatReusable(): Promise<boolean> {
      if (!this._currentChatId) return false;
      
      const chat = await this._chatManager.getChat(this._currentChatId);
      if (!chat) return false;
      
      return this.evaluateReuseability(chat);
    }
    
    public async reuseCurrentChat(): Promise<World> {
      if (!this._currentChatId) {
        throw new Error('No current chat to reuse');
      }
      
      // Clear agent memories but keep chat
      await this.clearAllAgentMemories();
      
      // Update chat metadata
      await this._chatManager.updateChat(this._currentChatId, {
        messageCount: 0
      });
      
      await this.save();
      return this;
    }
    
    public async createNewChat(): Promise<World> {
      // Save current state if we have a chat
      if (this._currentChatId) {
        await this.saveCurrentState();
      }
      
      // Create new chat
      const newChat = await this._chatManager.createChat({
        name: 'New Chat',
        description: 'New chat session',
        captureChat: true
      });
      
      // Clear agent memories
      await this.clearAllAgentMemories();
      
      // Update current chat ID
      this._currentChatId = newChat.id;
      
      await this.save();
      
      // Publish system message
      this.publishSystemMessage('chat-created', {
        chatId: newChat.id,
        name: newChat.name
      });
      
      return this;
    }
    
    public async loadChatById(chatId: string): Promise<void> {
      // Save current state first
      if (this._currentChatId && this._currentChatId !== chatId) {
        await this.saveCurrentState();
      }
      
      // Load chat data
      const chat = await this._chatManager.getChat(chatId);
      if (!chat) {
        throw new Error(`Chat ${chatId} not found`);
      }
      
      // Update current chat ID
      this._currentChatId = chatId;
      
      // Restore world state if chat has snapshot
      if (chat.chat) {
        await this.restoreFromWorldChat(chat.chat);
      }
      
      await this.save();
    }
    
    public async saveCurrentState(): Promise<void> {
      if (!this._currentChatId) return;
      
      // Create world chat snapshot
      const worldChat = await this.createWorldChat();
      
      // Save snapshot
      await this._storage.saveWorldChat(this._id, this._currentChatId, worldChat);
      
      // Update message count
      await this._chatManager.updateChat(this._currentChatId, {
        messageCount: worldChat.totalMessages
      });
    }
    
    // === PRIVATE METHODS ===
    
    private convertNameToId(name: string): string {
      const { toKebabCase } = require('../utils.js');
      return toKebabCase(name);
    }
    
    private createMessageProcessor(): MessageProcessor {
      const { createMessageProcessor } = require('../managers.js');
      return createMessageProcessor();
    }
    
    private evaluateReuseability(chat: ChatData): boolean {
      const NEW_CHAT_CONFIG = {
        MAX_REUSABLE_AGE_MS: 5 * 60 * 1000,
        REUSABLE_CHAT_TITLE: 'New Chat',
        MAX_REUSABLE_MESSAGE_COUNT: 0,
        ENABLE_OPTIMIZATION: true
      };
      
      if (!NEW_CHAT_CONFIG.ENABLE_OPTIMIZATION) return false;
      if (chat.name !== NEW_CHAT_CONFIG.REUSABLE_CHAT_TITLE) return false;
      if (chat.messageCount > NEW_CHAT_CONFIG.MAX_REUSABLE_MESSAGE_COUNT) return false;
      
      const age = Date.now() - chat.createdAt.getTime();
      return age <= NEW_CHAT_CONFIG.MAX_REUSABLE_AGE_MS;
    }
    
    private async clearAllAgentMemories(): Promise<void> {
      for (const agent of this.agents.values()) {
        await agent.clearMemory();
      }
    }
    
    private async createWorldChat(): Promise<WorldChat> {
      const agents = Array.from(this.agents.values()).map(agent => agent.toAgentData());
      const messages: AgentMessage[] = [];
      
      for (const agent of this.agents.values()) {
        messages.push(...agent.memory);
      }
      
      return new WorldChat(this.toWorldData(), agents, messages);
    }
    
    private async restoreFromWorldChat(worldChat: WorldChat): Promise<void> {
      // Restore world configuration
      this.updateFromWorldData(worldChat.world);
      
      // Restore agents
      for (const agentData of worldChat.agents) {
        const agent = Agent.fromAgentData(agentData);
        agent._setWorld(this);
        this._agentManager._addAgentToRuntime(agent);
      }
    }
    
    private publishSystemMessage(type: string, data: any): void {
      this.publishMessage(JSON.stringify({
        type,
        ...data,
        action: type
      }), 'system');
    }
    
    private updateFromWorldData(data: WorldData): void {
      this._name = data.name;
      this._description = data.description;
      this._turnLimit = data.turnLimit;
      this._chatLLMProvider = data.chatLLMProvider;
      this._chatLLMModel = data.chatLLMModel;
      this._currentChatId = data.currentChatId || null;
    }
    
    private toWorldData(): WorldData {
      return {
        id: this._id,
        name: this._name,
        description: this._description,
        turnLimit: this._turnLimit,
        chatLLMProvider: this._chatLLMProvider,
        chatLLMModel: this._chatLLMModel,
        currentChatId: this._currentChatId,
        createdAt: new Date(),
        lastUpdated: new Date(),
        totalAgents: this.agents.size,
        totalMessages: Array.from(this.agents.values()).reduce((total, agent) => total + agent.memorySize, 0)
      };
    }
    
    // Factory method
    public static async create(data: WorldData, rootPath: string, storage: BaseStorageManager): Promise<World> {
      const world = new World(data, rootPath, storage);
      
      // Load all agents
      const agentDataList = await storage.listAgents(data.id);
      for (const agentData of agentDataList) {
        const agent = Agent.fromAgentData(agentData);
        agent._setWorld(world);
        world._agentManager._addAgentToRuntime(agent);
      }
      
      return world;
    }
  }
  ```

### Phase 5: Migration and Integration
**Priority**: Critical | **Estimated Time**: 2-3 days

#### 5.1 Update Type Definitions
- [ ] **Update `core/types.ts`**
  - [ ] Remove function-based interface methods
  - [ ] Keep interfaces for data transfer objects
  - [ ] Update imports to reference new classes
  - [ ] Maintain backward compatibility for external APIs

#### 5.2 Update Manager Functions
- [ ] **Update `core/managers.ts`**
  - [ ] Replace `worldDataToWorld` factory with `World.create()`
  - [ ] Update `createWorld`, `getWorld`, `updateWorld` to use classes
  - [ ] Maintain existing function signatures for API compatibility
  - [ ] Add deprecation warnings for old functions

#### 5.3 Update Storage Factory
- [ ] **Update `core/storage-factory.ts`**
  - [ ] Return class instances instead of interface objects
  - [ ] Add storage type detection and instantiation logic
  - [ ] Maintain compatibility with existing wrapper pattern

#### 5.4 Update Event System
- [ ] **Update `core/events.ts`**
  - [ ] Modify functions to work with class instances
  - [ ] Update event handlers to call class methods
  - [ ] Ensure proper `this` binding for class methods

### Phase 6: Testing and Validation
**Priority**: Critical | **Estimated Time**: 3-4 weeks

#### 6.1 Unit Test Strategy: Recreation vs Migration Decision
**Decision**: **RECREATE** unit tests from scratch rather than migrate existing tests

**Rationale**:
- **Current complexity**: 78+ test files with complex interface mocking patterns
- **Migration effort**: 3-4 weeks with high risk of errors and maintenance issues
- **Recreation effort**: 2-3 weeks with significantly better quality outcomes
- **Quality improvement**: 50% fewer lines, 2x faster execution, 3x easier maintenance

#### 6.2 Core Class Unit Tests (Week 1)
- [ ] **Create `tests/core/storage/BaseStorageManager.test.ts`**
  - [ ] Test abstract base class functionality
  - [ ] Test common validation and error handling
  - [ ] Test protected utility methods
  - [ ] Mock concrete implementations for testing

- [ ] **Create `tests/core/storage/SQLiteStorageManager.test.ts`**
  - [ ] Test database connection and transaction management
  - [ ] Test CRUD operations for worlds, agents, chats
  - [ ] Test error handling and recovery
  - [ ] Use in-memory SQLite for test isolation

- [ ] **Create `tests/core/storage/FileStorageManager.test.ts`**
  - [ ] Test file I/O operations with atomic writes
  - [ ] Test backup/restore functionality
  - [ ] Test concurrent access handling
  - [ ] Use temporary directories for test isolation

- [ ] **Create `tests/core/chat/ChatData.test.ts`**
  - [ ] Test constructor and property initialization
  - [ ] Test update methods (name, description, message count)
  - [ ] Test serialization/deserialization (toJSON/fromJSON)
  - [ ] Test immutability of private properties

- [ ] **Create `tests/core/chat/WorldChat.test.ts`**
  - [ ] Test construction with sorted messages
  - [ ] Test metadata generation and updates
  - [ ] Test message addition and timestamp handling
  - [ ] Test serialization with large datasets

- [ ] **Create `tests/core/chat/ChatManager.test.ts`**
  - [ ] Test chat CRUD operations
  - [ ] Test chat ID generation and validation
  - [ ] Test storage integration with mocked storage
  - [ ] Test error handling for invalid operations

#### 6.3 Agent Class Unit Tests (Week 2)
- [ ] **Create `tests/core/agent/Agent.test.ts`**
  - [ ] Test constructor and property initialization
  - [ ] Test public API methods (generateResponse, addToMemory, etc.)
  - [ ] Test internal methods using bracket notation access
  - [ ] Test memory management and archiving
  - [ ] Test serialization/deserialization
  - [ ] Test world association and removal
  - [ ] Mock LLM calls for isolated testing

- [ ] **Create `tests/core/agent/AgentManager.test.ts`**
  - [ ] Test agent CRUD operations
  - [ ] Test runtime map management
  - [ ] Test storage integration with mocked storage
  - [ ] Test agent ID generation and validation
  - [ ] Test bulk operations (list, search)

#### 6.4 World Class Unit Tests (Week 3)
- [ ] **Create `tests/core/world/World.test.ts`**
  - [ ] Test constructor and factory method (World.create)
  - [ ] Test agent operations (create, get, update, delete)
  - [ ] Test chat operations delegation to ChatManager
  - [ ] Test chat session management (newChat, reuseCurrentChat)
  - [ ] Test event publishing and subscription
  - [ ] Test world serialization and state management
  - [ ] Test private methods using bracket notation
  - [ ] Mock storage and manager dependencies

#### 6.5 Integration Testing (Week 4)
- [ ] **Create `tests/integration/class-based-workflow.test.ts`**
  - [ ] Test complete world creation to deletion workflow
  - [ ] Test agent lifecycle within world context
  - [ ] Test chat session management end-to-end
  - [ ] Test cross-class communication and data flow
  - [ ] Use real storage implementations with test databases

- [ ] **Create `tests/integration/api-compatibility.test.ts`**
  - [ ] Test all existing API endpoints with class-based backend
  - [ ] Verify response format compatibility
  - [ ] Test error handling consistency
  - [ ] Compare response times and data integrity

- [ ] **Create `tests/integration/migration-validation.test.ts`**
  - [ ] Test data migration from function-based to class-based
  - [ ] Verify no data loss during conversion
  - [ ] Test backward compatibility scenarios
  - [ ] Validate existing world data loads correctly

#### 6.6 Performance Testing
- [ ] **Create `tests/performance/class-vs-function.test.ts`**
  - [ ] Memory usage comparison: classes vs factory functions
  - [ ] Execution speed: method calls vs closure calls
  - [ ] Initialization time: class instantiation vs factory creation
  - [ ] Concurrent operation performance
  - [ ] Document performance improvements with benchmarks

#### 6.7 Test Infrastructure Improvements
- [ ] **Create `tests/helpers/class-test-utils.ts`**
  - [ ] Helper functions for class instantiation
  - [ ] Mock factory functions for dependencies
  - [ ] Test data generators for consistent test data
  - [ ] Performance measurement utilities

- [ ] **Create `tests/helpers/storage-mocks.ts`**
  - [ ] Clean mock implementations for storage managers
  - [ ] In-memory storage for fast test execution
  - [ ] Configurable mock behaviors for edge cases
  - [ ] Mock state validation helpers

- [ ] **Update Jest configuration**
  - [ ] Separate test suites for unit vs integration
  - [ ] Performance test configuration
  - [ ] Coverage reporting for class-based code
  - [ ] Test timeout adjustments for integration tests

### Phase 7: API Compatibility and Documentation
**Priority**: Medium | **Estimated Time**: 1-2 days

#### 7.1 API Server Updates
- [ ] **Update `server/api.ts`**
  - [ ] Modify endpoints to use class methods
  - [ ] Ensure serialization works with class instances
  - [ ] Maintain response format compatibility
  - [ ] Add proper error handling for class operations

#### 7.2 CLI Updates
- [ ] **Update `cli/` modules**
  - [ ] Modify commands to use class-based API
  - [ ] Update export/import functionality
  - [ ] Ensure backward compatibility

#### 7.3 Documentation Updates
- [ ] **Update documentation**
  - [ ] Create class diagrams and API documentation
  - [ ] Update README with new architecture information
  - [ ] Create migration guide for external consumers
  - [ ] Document best practices for class usage

## Implementation Timeline

### Week 1: Core Infrastructure
- [ ] Days 1-2: Storage manager classes (Phase 1)
- [ ] Days 3-4: Chat management classes (Phase 2)
- [ ] Day 5: Begin agent implementation

### Week 2: Core Classes
- [ ] Days 1-3: Complete agent class implementation (Phase 3)
- [ ] Days 4-5: Begin world class implementation (Phase 4)

### Week 3: Integration and Migration
- [ ] Days 1-2: Complete world class and migration (Phases 4-5)
- [ ] Days 3-5: Begin unit test recreation (Phase 6.1-6.2)

### Week 4: Core Testing
- [ ] Days 1-5: Complete core class unit tests (Phase 6.2-6.3)

### Week 5: Advanced Testing
- [ ] Days 1-3: Complete world class unit tests (Phase 6.4)
- [ ] Days 4-5: Begin integration testing (Phase 6.5)

### Week 6: Integration and Performance
- [ ] Days 1-2: Complete integration testing (Phase 6.5)
- [ ] Days 3-4: Performance testing and optimization (Phase 6.6)
- [ ] Day 5: Test infrastructure finalization (Phase 6.7)

### Week 7: API Compatibility and Documentation
- [ ] Days 1-2: API compatibility and documentation (Phase 7)
- [ ] Days 3-4: Final integration testing and bug fixes
- [ ] Day 5: Deployment preparation and final validation

## Success Criteria

### Functional Requirements
- [ ] All existing functionality preserved
- [ ] API compatibility maintained
- [ ] All tests passing
- [ ] Performance equal or better than current implementation

### Quality Requirements
- [ ] TypeScript compilation with strict mode
- [ ] 100% test coverage for new classes
- [ ] No breaking changes to external APIs
- [ ] Comprehensive documentation
- [ ] **Test Quality Improvements**:
  - [ ] 50% reduction in test code lines vs migration approach
  - [ ] 2x faster test execution with cleaner mocks
  - [ ] 3x easier maintenance with class-based testing patterns
  - [ ] 100% coverage of public and critical private methods

### Performance Requirements
- [ ] Memory usage <= current implementation
- [ ] Method call performance >= current implementation
- [ ] Initialization time <= current implementation
- [ ] No memory leaks in class instances

## Risk Mitigation

### Technical Risks
- [ ] **Risk**: Breaking changes to existing APIs
  - **Mitigation**: Maintain wrapper functions for backward compatibility
  - **Contingency**: Feature flags to switch between implementations

- [ ] **Risk**: Performance degradation
  - **Mitigation**: Continuous performance monitoring during development
  - **Contingency**: Optimize critical paths, consider hybrid approach

- [ ] **Risk**: Complex migration dependencies
  - **Mitigation**: Phased approach with incremental testing
  - **Contingency**: Parallel implementation with gradual switchover

### Project Risks
- [ ] **Risk**: Extended development timeline
  - **Mitigation**: Clear phases with deliverable milestones
  - **Contingency**: Reduce scope to core functionality first

- [ ] **Risk**: Integration issues with existing codebase
  - **Mitigation**: Extensive integration testing
  - **Contingency**: Maintain both implementations until stability proven

## Post-Implementation Benefits

### Developer Experience
- [ ] Better IDE support with autocompletion and navigation
- [ ] Clearer code organization and maintainability
- [ ] Easier debugging with explicit method boundaries
- [ ] Improved refactoring capabilities

### Architecture Benefits
- [ ] True encapsulation with private methods
- [ ] Better separation of concerns
- [ ] Easier testing with focused class responsibilities
- [ ] Future extensibility through inheritance

### Performance Benefits
- [ ] Reduced memory overhead from shared prototype methods
- [ ] Faster method resolution through prototype chain
- [ ] Better garbage collection with explicit instance lifecycle
- [ ] Potential for future optimizations (caching, pooling)

---

**Plan Status**: Draft - Awaiting Review and Confirmation
**Created**: 2025-08-02
**Updated**: 2025-08-02 (Added comprehensive unit test recreation strategy)
**Estimated Total Time**: 6-7 weeks (extended for comprehensive test recreation)
**Priority**: High - Foundation for future scalability

### Test Strategy Summary

**Decision**: Recreate unit tests from scratch (2-3 weeks) vs migrate existing tests (3-4 weeks)

**Benefits of Recreation Approach**:
- **Quality**: Cleaner, more maintainable test code designed for class architecture
- **Performance**: 2x faster execution with optimized mocking strategies  
- **Maintainability**: 3x easier to maintain with class-based testing patterns
- **Coverage**: Better coverage of both public APIs and critical private methods
- **Efficiency**: 50% fewer lines of test code vs complex migration patterns

**Timeline Impact**: Extended from 4 weeks to 6-7 weeks, but with significantly higher quality outcomes and better long-term maintainability.

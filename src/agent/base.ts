import { EventEmitter } from 'events';
import { Tool, LLMResponse, ChatMessage, LLMProvider, AgentType, AgentConfig } from '../types';
import { logger } from '../config';
import { LLMFactory } from '../llm/base';

class AgentError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AgentError';
  }
}

export class Agent extends EventEmitter implements AgentConfig {
  // Required AgentConfig properties
  public readonly id: string;
  public readonly name: string;
  public readonly role: string;
  public readonly provider: 'openai' | 'anthropic' | 'ollama';
  public readonly model: string;
  
  // Optional AgentConfig properties with public getters/setters
  public type: AgentType;
  public knowledge: string;
  public status: 'idle' | 'busy' | 'error';
  public lastActive: Date;
  public chatHistory: ChatMessage[];

  // Additional properties
  protected llmProvider?: LLMProvider;
  protected tools: Map<string, Tool>;
  private maxRetries: number = 3;
  private maxChatHistory: number = 10;
  private readonly memoryLimit: number = 100000; // Limit total memory size

  // Rate limiting
  private rateLimiter = {
    tokens: 10,
    maxTokens: 10,
    lastRefill: Date.now(),
    refillRate: 1000, // 1 token per second
  };

  constructor(config: AgentConfig, apiKey: string) {
    super();
    if (!this.isValidProvider(config.provider)) {
      throw new AgentError('Invalid provider specified', 'INVALID_PROVIDER');
    }

    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.provider = config.provider;
    this.model = config.model;
    this.type = config.type || AgentType.BASE;
    this.knowledge = config.knowledge || '';
    this.status = config.status || 'idle';
    this.lastActive = config.lastActive || new Date();
    this.chatHistory = config.chatHistory || [];
    this.tools = new Map();

    // Initialize the provider asynchronously
    this.initializeProvider(config.provider, apiKey, config.model);
  }

  protected isValidProvider(provider: string): provider is 'openai' | 'anthropic' | 'ollama' {
    return ['openai', 'anthropic', 'ollama'].includes(provider);
  }

  private async initializeProvider(
    provider: 'openai' | 'anthropic' | 'ollama',
    apiKey: string,
    model: string
  ): Promise<void> {
    try {
      this.llmProvider = await LLMFactory.createProvider(provider, apiKey, model);

      // Register tools if provider supports them
      if ('registerTool' in this.llmProvider) {
        this.tools.forEach(tool => {
          (this.llmProvider as any).registerTool(tool);
        });
      }
    } catch (error) {
      logger.error('Failed to initialize provider:', error);
      this.status = 'error';
      throw new AgentError('Provider initialization failed', 'PROVIDER_INIT_FAILED');
    }
  }

  protected validateMessage(content: string): boolean {
    if (!content || typeof content !== 'string') {
      return false;
    }
    
    // Check for common issues
    const containsOnlyWhitespace = /^\s*$/.test(content);
    const containsControlCharacters = /[\x00-\x1F\x7F]/.test(content);
    const exceedsMaxLength = content.length >= 32768;
    
    if (containsOnlyWhitespace || containsControlCharacters || exceedsMaxLength) {
      return false;
    }
    
    // Validate UTF-8 encoding
    try {
      const encoded = new TextEncoder().encode(content);
      new TextDecoder('utf-8', {fatal: true}).decode(encoded);
      return true;
    } catch {
      return false;
    }
  }

  protected cleanupMemory(): void {
    if (!this.chatHistory.length) return;
    
    let totalSize = 0;
    const reversedHistory = [...this.chatHistory].reverse();
    const newHistory: ChatMessage[] = [];
    
    for (const message of reversedHistory) {
      totalSize += message.content.length;
      if (totalSize > this.memoryLimit) break;
      newHistory.unshift(message);
    }
    
    this.chatHistory = newHistory;
  }

  private async acquireToken(): Promise<void> {
    const now = Date.now();
    const timePassed = now - this.rateLimiter.lastRefill;
    const tokensToAdd = Math.floor(timePassed / this.rateLimiter.refillRate);
    
    if (tokensToAdd > 0) {
      this.rateLimiter.tokens = Math.min(
        this.rateLimiter.maxTokens,
        this.rateLimiter.tokens + tokensToAdd
      );
      this.rateLimiter.lastRefill = now;
    }
    
    if (this.rateLimiter.tokens <= 0) {
      await new Promise(resolve => 
        setTimeout(resolve, this.rateLimiter.refillRate)
      );
      return this.acquireToken();
    }
    
    this.rateLimiter.tokens--;
  }

  protected addMessage(role: ChatMessage['role'], content: string): void {
    if (!this.validateMessage(content)) {
      throw new AgentError('Invalid message content', 'INVALID_MESSAGE');
    }
    
    const timestamp = Date.now();
    const message: ChatMessage = {
      role,
      content,
      timestamp
    };

    this.chatHistory.push(message);
    this.cleanupMemory();

    // Emit state update
    this.emit('stateUpdate', this.toConfig());
  }

  public clearChatHistory(): void {
    this.chatHistory = [];
    this.emit('stateUpdate', this.toConfig());
  }

  public getMemory(): { chatHistory: ChatMessage[] } {
    return {
      chatHistory: this.chatHistory
    };
  }

  public getChatHistory(): ChatMessage[] {
    return this.chatHistory;
  }

  public toConfig(): AgentConfig {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      provider: this.provider,
      model: this.model,
      type: this.type,
      knowledge: this.knowledge,
      status: this.status,
      lastActive: this.lastActive,
      chatHistory: this.chatHistory
    };
  }

  public getStatus(): AgentConfig {
    this.lastActive = new Date();
    return this.toConfig();
  }

  public registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new AgentError(`Tool ${tool.name} already registered`, 'DUPLICATE_TOOL');
    }
    
    this.tools.set(tool.name, tool);
    // Register tool with provider if supported
    if (this.llmProvider && 'registerTool' in this.llmProvider) {
      (this.llmProvider as any).registerTool(tool);
    }
    logger.info(`Tool ${tool.name} registered for agent ${this.name}`);
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries: number = this.maxRetries
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (retries > 0 && this.isRetryableError(error)) {
        logger.warn(`Retrying operation, ${retries} attempts remaining`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (this.maxRetries - retries + 1)));
        return this.retryOperation(operation, retries - 1);
      }
      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    const retryableStatusCodes = [429, 500, 502, 503, 504];
    return retryableStatusCodes.includes(error.status) || 
           error.code === 'ECONNRESET' || 
           error.message?.includes('timeout');
  }

  public async chat(
    input: string,
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse> {
    if (!this.llmProvider) {
      throw new AgentError('Provider not initialized', 'PROVIDER_NOT_INITIALIZED');
    }

    if (!this.validateMessage(input)) {
      throw new AgentError('Invalid input message', 'INVALID_INPUT');
    }

    await this.acquireToken(); // Add rate limiting

    this.status = 'busy';
    this.lastActive = new Date();
    this.emit('stateUpdate', this.toConfig());

    try {
      // Add user message to memory
      this.addMessage('user', input);

      // Get recent messages including system role
      const messages: ChatMessage[] = [
        { role: 'system', content: this.role, timestamp: Date.now() },
        ...this.chatHistory.slice(-this.maxChatHistory)
      ];

      const response = await this.retryOperation(async () => {
        return this.llmProvider!.chat(messages, onStream);
      });

      // Add assistant response to memory
      this.addMessage('assistant', response.content);

      this.status = 'idle';
      this.lastActive = new Date();
      this.emit('stateUpdate', this.toConfig());

      return response;
    } catch (error) {
      this.status = 'error';
      this.lastActive = new Date();
      this.emit('stateUpdate', this.toConfig());
      
      if (error instanceof AgentError) {
        throw error;
      }
      throw new AgentError('Chat operation failed', 'CHAT_FAILED');
    }
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public getProvider(): 'openai' | 'anthropic' | 'ollama' {
    return this.provider;
  }

  public getRole(): string {
    return this.role;
  }

  public setKnowledge(knowledge: string): void {
    if (!this.validateMessage(knowledge)) {
      throw new AgentError('Invalid knowledge content', 'INVALID_KNOWLEDGE');
    }
    this.knowledge = knowledge;
    this.emit('stateUpdate', this.toConfig());
  }

  public getKnowledge(): string {
    return this.knowledge;
  }
}

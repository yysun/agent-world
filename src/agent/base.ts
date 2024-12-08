import { EventEmitter } from 'events';
import { Tool, LLMResponse, ChatMessage, LLMProvider, AgentType, AgentConfig } from '../types';
import { logger } from '../config';
import { LLMFactory } from '../llm/base';

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

  constructor(config: AgentConfig, apiKey: string) {
    super();
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
      throw error;
    }
  }

  protected addMessage(role: ChatMessage['role'], content: string): void {
    const timestamp = Date.now();
    const message: ChatMessage = {
      role,
      content,
      timestamp
    };

    this.chatHistory.push(message);

    // Keep only last N messages in chat history
    while (this.chatHistory.length > this.maxChatHistory) {
      this.chatHistory.shift();
    }

    // Emit state update
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
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.retryOperation(operation, retries - 1);
      }
      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    const retryableStatusCodes = [429, 500, 502, 503, 504];
    return retryableStatusCodes.includes(error.status) || error.code === 'ECONNRESET';
  }

  public async chat(
    input: string,
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse> {
    if (!this.llmProvider) {
      throw new Error('Provider not initialized');
    }

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
      throw error;
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
    this.knowledge = knowledge;
    this.emit('stateUpdate', this.toConfig());
  }

  public getKnowledge(): string {
    return this.knowledge;
  }
}

import { EventEmitter } from 'events';
import { AgentConfig, Tool, LLMResponse, ChatMessage, LLMProvider } from '../types';
import { logger } from '../config';
import { LLMFactory } from '../llm/base';

export class Agent extends EventEmitter {
  private id: string;
  private name: string;
  private role: string;
  private knowledge: string;
  private providerType: AgentConfig['provider'];
  private provider?: LLMProvider;
  private status: 'idle' | 'busy' | 'error';
  private lastActive: Date;
  private shortTermMemory: Map<string, ChatMessage>;
  private longTermMemory: Map<string, ChatMessage>;
  private tools: Map<string, Tool>;
  private maxRetries: number = 3;

  constructor(config: AgentConfig, apiKey: string) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.knowledge = config.knowledge || '';
    this.providerType = config.provider;
    this.status = config.status || 'idle';
    this.lastActive = config.lastActive || new Date();
    this.shortTermMemory = new Map();
    this.longTermMemory = config.memory?.longTerm
      ? new Map(Object.entries(config.memory.longTerm))
      : new Map();
    this.tools = new Map();

    // Initialize the provider asynchronously
    this.initializeProvider(config.provider, apiKey, config.model);
  }

  private async initializeProvider(
    provider: AgentConfig['provider'],
    apiKey: string,
    model: string
  ): Promise<void> {
    try {
      this.provider = await LLMFactory.createProvider(provider, apiKey, model);

      // Register tools if provider supports them
      if ('registerTool' in this.provider) {
        this.tools.forEach(tool => {
          (this.provider as any).registerTool(tool);
        });
      }
    } catch (error) {
      logger.error('Failed to initialize provider:', error);
      this.status = 'error';
      throw error;
    }
  }

  private addMessage(role: ChatMessage['role'], content: string): void {
    const timestamp = Date.now();
    const message: ChatMessage = {
      role,
      content,
      timestamp
    };

    // Add to both memories
    const key = `chat-${timestamp}`;
    this.longTermMemory.set(key, message);
    this.shortTermMemory.set(key, message);

    // Keep only last 10 messages in short term memory
    const shortTermKeys = Array.from(this.shortTermMemory.keys()).sort();
    while (shortTermKeys.length > 10) {
      const oldestKey = shortTermKeys.shift();
      if (oldestKey) {
        this.shortTermMemory.delete(oldestKey);
      }
    }

    this.emit('memoryUpdate', { type: 'message', key, value: message });
  }

  public setShortTermMemory(key: string, value: any): void {
    this.shortTermMemory.set(key, value);
    this.emit('memoryUpdate', { type: 'shortTerm', key, value });
  }

  public setLongTermMemory(key: string, value: any): void {
    this.longTermMemory.set(key, value);
    this.emit('memoryUpdate', { type: 'longTerm', key, value });
  }

  public getMemory(): { shortTerm: Map<string, any>; longTerm: Map<string, any> } {
    return {
      shortTerm: this.shortTermMemory,
      longTerm: this.longTermMemory
    };
  }

  public getStatus(): AgentConfig {
    this.lastActive = new Date();
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      knowledge: this.knowledge,
      provider: this.providerType,
      model: this.provider?.model || '',
      status: this.status,
      lastActive: this.lastActive,
      memory: {
        longTerm: Object.fromEntries(this.longTermMemory)
      }
    };
  }

  public registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    // Register tool with provider if supported
    if (this.provider && 'registerTool' in this.provider) {
      (this.provider as any).registerTool(tool);
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
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    this.status = 'busy';
    this.lastActive = new Date();
    this.emit('stateUpdate', this.getStatus());

    try {
      // Add user message to memory
      this.addMessage('user', input);

      // Get recent messages including system role
      const messages: ChatMessage[] = [
        { role: 'system', content: this.role, timestamp: Date.now() },
        ...Array.from(this.shortTermMemory.values())
      ];

      const response = await this.retryOperation(async () => {
        return this.provider!.chat(messages, onStream);
      });

      // Add assistant response to memory
      this.addMessage('assistant', response.content);

      this.status = 'idle';
      this.lastActive = new Date();
      this.emit('stateUpdate', this.getStatus());

      return response;
    } catch (error) {
      this.status = 'error';
      this.lastActive = new Date();
      this.emit('stateUpdate', this.getStatus());
      throw error;
    }
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public getProvider(): AgentConfig['provider'] {
    return this.providerType;
  }

  public getRole(): string {
    return this.role;
  }

  public setKnowledge(knowledge: string): void {
    this.knowledge = knowledge;
    this.emit('stateUpdate', this.getStatus());
  }

  public getKnowledge(): string {
    return this.knowledge;
  }
}

import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { AgentConfig, Tool, LLMResponse, ChatMessage } from '../types';
import { logger } from '../config';

export class Agent extends EventEmitter {
  private id: string;
  private name: string;
  private role: string;
  private provider: 'openai' | 'anthropic';
  private model: string;
  private status: 'idle' | 'busy' | 'error';
  private lastActive: Date;
  private shortTermMemory: Map<string, ChatMessage>;
  private longTermMemory: Map<string, ChatMessage>;
  private tools: Map<string, Tool>;
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;
  private maxRetries: number = 3;

  constructor(config: AgentConfig, apiKey: string) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.provider = config.provider;
    this.model = config.model;
    this.status = config.status || 'idle';
    this.lastActive = config.lastActive || new Date();
    this.shortTermMemory = new Map();
    this.longTermMemory = config.memory?.longTerm 
      ? new Map(Object.entries(config.memory.longTerm))
      : new Map();
    this.tools = new Map();

    // Initialize the appropriate client based on provider
    if (this.provider === 'openai') {
      this.openaiClient = new OpenAI({
        apiKey
      });
    } else {
      this.anthropicClient = new Anthropic({
        apiKey
      });
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
      provider: this.provider,
      model: this.model,
      status: this.status,
      lastActive: this.lastActive,
      memory: {
        longTerm: Object.fromEntries(this.longTermMemory)
      }
    };
  }

  public registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
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

  public async interact(
    input: string,
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse> {
    this.status = 'busy';
    this.lastActive = new Date();
    this.emit('stateUpdate', this.getStatus());

    try {
      // Add user message to memory
      this.addMessage('user', input);

      const response = await this.retryOperation(async () => {
        if (this.provider === 'openai') {
          return this.handleOpenAIInteraction(input, onStream);
        } else {
          return this.handleAnthropicInteraction(input, onStream);
        }
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

  private async handleOpenAIInteraction(
    input: string,
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse> {
    if (!this.openaiClient) throw new Error('OpenAI client not initialized');

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = Array.from(this.tools.values()).map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    }));

    if (onStream) {
      const stream = await this.openaiClient.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: this.role },
          { role: 'user', content: input }
        ],
        tools,
        stream: true
      });

      let fullContent = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullContent += content;
          onStream(content);
        }
      }
      return { content: fullContent };
    }

    const completion = await this.openaiClient.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: this.role },
        { role: 'user', content: input }
      ],
      tools,
      stream: false
    });

    return {
      content: completion.choices[0]?.message?.content || '',
      toolCalls: completion.choices[0]?.message?.tool_calls?.map(call => ({
        name: call.function.name,
        arguments: JSON.parse(call.function.arguments)
      }))
    };
  }

  private async handleAnthropicInteraction(
    input: string,
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse> {
    if (!this.anthropicClient) throw new Error('Anthropic client not initialized');

    const systemMessage = `\n\nSystem: ${this.role}\n\n`;
    const fullInput = systemMessage + input;

    if (onStream) {
      const stream = await this.anthropicClient.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: fullInput }],
        stream: true
      });

      let fullContent = '';
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && 'text' in chunk.delta) {
          const content = chunk.delta.text;
          if (content) {
            fullContent += content;
            onStream(content);
          }
        }
      }
      return { content: fullContent };
    }

    const response = await this.anthropicClient.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: fullInput }],
      stream: false
    });

    const textBlock = response.content.find(block => block.type === 'text');
    return {
      content: textBlock?.text || ''
    };
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public getProvider(): string {
    return this.provider;
  }

  public getRole(): string {
    return this.role;
  }
}

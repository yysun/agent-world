import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { EventEmitter } from 'events';
import { AgentConfig, Memory, Tool, LLMResponse } from '../types';
import { logger } from '../config';

export class Agent extends EventEmitter {
  private id: string;
  private name: string;
  private memory: Memory;
  private provider: 'openai' | 'anthropic';
  private model: string;
  private tools: Map<string, Tool>;
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;
  private maxRetries: number = 3;

  constructor(config: AgentConfig) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.provider = config.provider;
    this.model = config.model;
    this.memory = {
      shortTerm: new Map(),
      longTerm: new Map()
    };
    this.tools = new Map();

    // Initialize LLM client based on provider
    if (this.provider === 'openai') {
      this.openaiClient = new OpenAI({
        apiKey: config.apiKey
      });
    } else {
      this.anthropicClient = new Anthropic({
        apiKey: config.apiKey
      });
    }
  }

  // Memory management
  public setShortTermMemory(key: string, value: any): void {
    this.memory.shortTerm.set(key, value);
    this.emit('memoryUpdate', { type: 'shortTerm', key, value });
  }

  public setLongTermMemory(key: string, value: any): void {
    this.memory.longTerm.set(key, value);
    this.emit('memoryUpdate', { type: 'longTerm', key, value });
  }

  public getMemory(): Memory {
    return this.memory;
  }

  // Tool management
  public registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    logger.info(`Tool ${tool.name} registered for agent ${this.name}`);
  }

  // LLM interaction with retry mechanism
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

  // Main interaction method with streaming support
  public async interact(
    input: string,
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse> {
    return this.retryOperation(async () => {
      if (this.provider === 'openai') {
        return this.handleOpenAIInteraction(input, onStream);
      } else {
        return this.handleAnthropicInteraction(input, onStream);
      }
    });
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
        messages: [{ role: 'user', content: input }],
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
      messages: [{ role: 'user', content: input }],
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

    if (onStream) {
      const stream = await this.anthropicClient.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: input }],
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
      messages: [{ role: 'user', content: input }],
      stream: false
    });

    const textBlock = response.content.find(block => block.type === 'text');
    return {
      content: textBlock?.text || ''
    };
  }

  // Utility methods
  public getId(): string {
    return this.id;
  }

  public getName(): string {
    return this.name;
  }

  public getProvider(): string {
    return this.provider;
  }
}

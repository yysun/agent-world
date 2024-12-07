import { ChatMessage, LLMResponse } from '../types';

export interface LLMProvider {
  model: string;
  chat(
    messages: ChatMessage[],
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse>;
}

export abstract class BaseLLMProvider implements LLMProvider {
  protected apiKey: string;
  public model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  abstract chat(
    messages: ChatMessage[],
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse>;
}

export class LLMFactory {
  static async createProvider(
    provider: 'openai' | 'anthropic' | 'ollama',
    apiKey: string,
    model: string
  ): Promise<LLMProvider> {
    switch (provider) {
      case 'openai': {
        const { OpenAIProvider } = await import('./openai');
        return new OpenAIProvider(apiKey, model);
      }
      case 'anthropic': {
        const { AnthropicProvider } = await import('./anthropic');
        return new AnthropicProvider(apiKey, model);
      }
      case 'ollama': {
        const { OllamaProvider } = await import('./ollama');
        return new OllamaProvider(apiKey, model);
      }
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}

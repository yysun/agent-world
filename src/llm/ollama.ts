import { ChatMessage, LLMResponse } from '../types';
import { BaseLLMProvider } from './base';
import { config } from '../config';

interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

interface OllamaStreamResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export class OllamaProvider extends BaseLLMProvider {
  private baseUrl: string;

  constructor(apiKey: string, model: string = config.ollama.defaultModel) {
    super(apiKey, model);
    this.baseUrl = config.ollama.url;
  }

  async chat(
    messages: ChatMessage[],
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse> {

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        stream: Boolean(onStream),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    if (onStream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(Boolean);
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line) as OllamaStreamResponse;
              if (data.message?.content) {
                onStream(data.message.content);
                fullResponse += data.message.content;
              }
              
              if (data.done) {
                break;
              }
            } catch (e) {
              console.error('Error parsing streaming response:', e);
            }
          }
        }
      } catch (e) {
        console.error('Error reading stream:', e);
      }

      return {
        content: fullResponse
      };
    }

    const data = await response.json() as OllamaResponse;
    return {
      content: data.message?.content || ''
    };
  }
}

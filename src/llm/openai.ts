import { OpenAI } from 'openai';
import { ChatMessage, LLMResponse, Tool } from '../types';
import { BaseLLMProvider } from './base';

export class OpenAIProvider extends BaseLLMProvider {
  private client: OpenAI;
  private tools: Map<string, Tool>;

  constructor(apiKey: string, model: string) {
    super(apiKey, model);
    this.client = new OpenAI({ apiKey });
    this.tools = new Map();
  }

  public registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  async chat(
    messages: ChatMessage[],
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse> {
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

    const formattedMessages = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    if (onStream) {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: formattedMessages,
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

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: formattedMessages,
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
}

import Anthropic from '@anthropic-ai/sdk';
import { ChatMessage, LLMResponse } from '../types';
import { BaseLLMProvider } from './base';

export class AnthropicProvider extends BaseLLMProvider {
  private client: Anthropic;

  constructor(apiKey: string, model: string) {
    super(apiKey, model);
    this.client = new Anthropic({ apiKey });
  }

  async chat(
    messages: ChatMessage[],
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse> {
    // Format messages for Anthropic API
    const formattedMessages = messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content
      }));

    // If there's a system message, prepend it to the first user message
    const systemMessage = messages.find(msg => msg.role === 'system');
    if (systemMessage && formattedMessages.length > 0) {
      const firstUserMessageIndex = formattedMessages.findIndex(msg => msg.role === 'user');
      if (firstUserMessageIndex !== -1) {
        formattedMessages[firstUserMessageIndex].content = 
          `\n\nSystem: ${systemMessage.content}\n\n${formattedMessages[firstUserMessageIndex].content}`;
      }
    }

    if (onStream) {
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: formattedMessages,
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

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: formattedMessages,
      stream: false
    });

    const textBlock = response.content.find(block => block.type === 'text');
    return {
      content: textBlock?.text || ''
    };
  }
}

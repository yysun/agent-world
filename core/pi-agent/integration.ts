/**
 * Pi-AI Integration Module
 * 
 * Main integration class that replaces direct provider SDKs with pi-ai.
 * 
 * Features:
 * - Unified LLM calling via pi-ai
 * - Streaming and non-streaming support
 * - Event adaptation to Agent-World SSE format
 * - Tool handling (description only, execution remains in MCP layer)
 * - Provider abstraction
 * 
 * Implementation:
 * - Feature flag controlled (USE_PI_AGENT)
 * - Per-provider enablement (PI_AGENT_PROVIDERS)
 * - Minimal changes to existing flow
 * - Compatible with current event system
 * - Preserves all Agent-World features
 */

import { getModel, stream as piStream, complete as piComplete, type Model } from '@mariozechner/pi-ai';
import type { World, Agent, ChatMessage, LLMResponse } from '../types.js';
import { createCategoryLogger } from '../logger.js';
import { generateId } from '../utils.js';
import { getMCPToolsForWorld } from '../mcp-server-registry.js';
import {
  adaptToPiAiContext,
  mapProviderName,
  getModelIdentifier,
  adaptFromPiAiMessage,
} from './types.js';
import { preparePiAiTools } from './tool-adapter.js';
import { getPiAiOptions, createApiKeyGetter } from './provider-config.js';
import { adaptPiAiStreamEvent, shouldPublishEvent } from './event-adapter.js';

const logger = createCategoryLogger('pi-agent');

/**
 * Pi-AI Integration Class
 * 
 * Provides methods to replace current LLM calling logic with pi-ai.
 */
export class PiAgentIntegration {
  private modelCache = new Map<string, Model<any>>();

  /**
   * Get or create pi-ai Model for agent
   */
  private getModel(agent: Agent): Model<any> {
    const cacheKey = `${agent.provider}:${agent.model}`;
    
    if (!this.modelCache.has(cacheKey)) {
      const provider = mapProviderName(agent.provider);
      const modelId = getModelIdentifier(agent.provider, agent.model);
      
      try {
        const model = getModel(provider as any, modelId as any);
        this.modelCache.set(cacheKey, model);
        
        logger.debug('Created pi-ai model', {
          agentId: agent.id,
          provider,
          model: modelId,
          cacheKey,
        });
        
        return model;
      } catch (error) {
        logger.error('Failed to create pi-ai model', {
          agentId: agent.id,
          provider,
          model: modelId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(`Failed to create model for ${provider}/${modelId}: ${error}`);
      }
    }
    
    return this.modelCache.get(cacheKey)!;
  }

  /**
   * Stream agent response using pi-ai
   * 
   * Replaces: streamAgentResponse() in llm-manager.ts
   */
  async streamAgentResponse(
    world: World,
    agent: Agent,
    messages: ChatMessage[],
    onChunk: (event: any) => void
  ): Promise<{ response: LLMResponse; messageId: string }> {
    logger.info('Streaming agent response with pi-ai', {
      worldId: world.id,
      agentId: agent.id,
      messageCount: messages.length,
    });

    try {
      // 1. Get model
      const model = this.getModel(agent);
      
      // 2. Convert messages to pi-ai context
      const context = adaptToPiAiContext(agent, messages);
      
      // 3. Get MCP tools
      const mcpTools = await getMCPToolsForWorld(world.id);
      const piTools = preparePiAiTools(mcpTools);
      context.tools = piTools;
      
      logger.debug('Prepared context for pi-ai', {
        agentId: agent.id,
        systemPromptLength: context.systemPrompt?.length || 0,
        messageCount: context.messages.length,
        toolCount: piTools.length,
      });
      
      // 4. Get options
      const options = getPiAiOptions(agent);
      options.apiKey = options.apiKey || await createApiKeyGetter(agent)(mapProviderName(agent.provider));
      
      // 5. Create stream
      const messageId = generateId();
      const streamGen = piStream(model, context, options as any);
      
      // 6. Process stream events
      let responseText = '';
      const toolCalls: any[] = [];
      
      for await (const event of streamGen) {
        // Adapt and publish SSE events
        if (shouldPublishEvent(event)) {
          const adapted = adaptPiAiStreamEvent(event, agent.id, messageId);
          if (adapted) {
            onChunk(adapted);
            
            // Track content for final response
            if (event.type === 'text_delta') {
              responseText += event.delta;
            }
          }
        }
        
        // Track tool calls
        if (event.type === 'toolcall_end') {
          toolCalls.push({
            id: event.toolCall.id,
            type: 'function',
            function: {
              name: event.toolCall.name,
              arguments: JSON.stringify(event.toolCall.arguments),
            },
          });
        }
        
        // Log errors
        if (event.type === 'error') {
          logger.error('Pi-ai streaming error', {
            agentId: agent.id,
            error: (event as any).error?.message || 'Unknown error',
          });
        }
      }
      
      // 7. Get final result
      const piMessage = await streamGen.result();
      
      logger.debug('Pi-ai stream complete', {
        agentId: agent.id,
        messageId,
        stopReason: piMessage.stopReason,
        usage: piMessage.usage,
      });
      
      // 8. Convert to LLMResponse format
      const response: LLMResponse = {
        type: toolCalls.length > 0 ? 'tool_calls' : 'text',
        content: responseText,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        assistantMessage: {
          role: 'assistant',
          content: responseText,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        usage: {
          inputTokens: piMessage.usage.input,
          outputTokens: piMessage.usage.output,
        },
      };
      
      return { response, messageId };
      
    } catch (error) {
      logger.error('Pi-ai streaming failed', {
        agentId: agent.id,
        worldId: world.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate agent response using pi-ai (non-streaming)
   * 
   * Replaces: generateAgentResponse() in llm-manager.ts
   */
  async generateAgentResponse(
    world: World,
    agent: Agent,
    messages: ChatMessage[]
  ): Promise<{ response: LLMResponse; messageId: string }> {
    logger.info('Generating agent response with pi-ai', {
      worldId: world.id,
      agentId: agent.id,
      messageCount: messages.length,
    });

    try {
      // 1. Get model
      const model = this.getModel(agent);
      
      // 2. Convert messages to pi-ai context
      const context = adaptToPiAiContext(agent, messages);
      
      // 3. Get MCP tools
      const mcpTools = await getMCPToolsForWorld(world.id);
      const piTools = preparePiAiTools(mcpTools);
      context.tools = piTools;
      
      logger.debug('Prepared context for pi-ai', {
        agentId: agent.id,
        systemPromptLength: context.systemPrompt?.length || 0,
        messageCount: context.messages.length,
        toolCount: piTools.length,
      });
      
      // 4. Get options
      const options = getPiAiOptions(agent);
      options.apiKey = options.apiKey || await createApiKeyGetter(agent)(mapProviderName(agent.provider));
      
      // 5. Complete (non-streaming)
      const piMessage = await piComplete(model, context, options as any);
      
      logger.debug('Pi-ai generation complete', {
        agentId: agent.id,
        stopReason: piMessage.stopReason,
        usage: piMessage.usage,
      });
      
      // 6. Convert to Agent-World format
      const messageId = generateId();
      const agentMessage = adaptFromPiAiMessage(piMessage, agent.id);
      
      // 7. Convert to LLMResponse format
      const response: LLMResponse = {
        type: agentMessage.tool_calls && agentMessage.tool_calls.length > 0 ? 'tool_calls' : 'text',
        content: agentMessage.content,
        tool_calls: agentMessage.tool_calls,
        assistantMessage: {
          role: 'assistant',
          content: agentMessage.content,
          tool_calls: agentMessage.tool_calls,
        },
        usage: {
          inputTokens: piMessage.usage.input,
          outputTokens: piMessage.usage.output,
        },
      };
      
      return { response, messageId };
      
    } catch (error) {
      logger.error('Pi-ai generation failed', {
        agentId: agent.id,
        worldId: world.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clear model cache
   */
  clearCache(): void {
    this.modelCache.clear();
    logger.debug('Cleared pi-ai model cache');
  }
}

// Singleton instance
export const piAgentIntegration = new PiAgentIntegration();

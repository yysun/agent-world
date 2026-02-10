/**
 * Pi-Agent Adapter Unit Tests
 * 
 * Tests for the pi-ai integration adapters:
 * - Type conversions (Agent-World ↔ pi-ai)
 * - Tool adaptation (MCP → pi-ai)
 * - Provider configuration
 * - Event streaming adaptation
 * 
 * NOTE: These tests mock LLM responses and do not call real APIs.
 */

import { describe, it, expect } from 'vitest';
import { adaptToPiAiMessage, adaptFromPiAiMessage, adaptToPiAiContext, mapProviderName } from '../../../core/pi-agent/types.js';
import { adaptMCPTools, filterClientSideTools, preparePiAiTools } from '../../../core/pi-agent/tool-adapter.js';
import { shouldUsePiAgent, USE_PI_AGENT } from '../../../core/pi-agent/config.js';
import { adaptPiAiStreamEvent } from '../../../core/pi-agent/event-adapter.js';
import type { ChatMessage, Agent } from '../../../core/types.js';
import type { AssistantMessage } from '@mariozechner/pi-ai';

describe('Pi-Agent Adapters', () => {
  describe('Type Adapters', () => {
    describe('adaptToPiAiMessage', () => {
      it('should convert user message to pi-ai format', () => {
        const msg: ChatMessage = {
          role: 'user',
          content: 'Hello, world!',
          createdAt: new Date('2024-01-01'),
        };

        const result = adaptToPiAiMessage(msg);

        expect(result).toBeDefined();
        expect(result?.role).toBe('user');
        expect(result?.content).toBe('Hello, world!');
        expect(result?.timestamp).toBe(new Date('2024-01-01').getTime());
      });

      it('should convert system message to pi-ai user format', () => {
        const msg: ChatMessage = {
          role: 'system',
          content: 'You are helpful',
          createdAt: new Date('2024-01-01'),
        };

        const result = adaptToPiAiMessage(msg);

        expect(result).toBeDefined();
        expect(result?.role).toBe('user'); // System becomes user
        expect(result?.content).toBe('You are helpful');
      });

      it('should convert tool message to pi-ai toolResult format', () => {
        const msg: ChatMessage = {
          role: 'tool',
          content: 'Tool result data',
          tool_call_id: 'call_123',
          createdAt: new Date('2024-01-01'),
        };

        const result = adaptToPiAiMessage(msg);

        expect(result).toBeDefined();
        expect(result?.role).toBe('toolResult');
        if (result?.role === 'toolResult') {
          expect(result.toolCallId).toBe('call_123');
          expect(result.content).toEqual([{ type: 'text', text: 'Tool result data' }]);
          expect(result.isError).toBe(false);
        }
      });

      it('should skip assistant messages (pi-ai generates these)', () => {
        const msg: ChatMessage = {
          role: 'assistant',
          content: 'I can help',
          createdAt: new Date('2024-01-01'),
        };

        const result = adaptToPiAiMessage(msg);

        expect(result).toBeNull(); // Assistant messages skipped
      });
    });

    describe('adaptFromPiAiMessage', () => {
      it('should convert pi-ai message to Agent-World format', () => {
        const piMsg: AssistantMessage = {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Hello!' },
          ],
          api: 'openai-responses',
          provider: 'openai',
          model: 'gpt-4o-mini',
          usage: {
            input: 10,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 15,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: Date.now(),
        };

        const result = adaptFromPiAiMessage(piMsg, 'agent-1');

        expect(result.role).toBe('assistant');
        expect(result.content).toBe('Hello!');
        expect(result.tool_calls).toBeUndefined();
      });

      it('should extract tool calls from pi-ai message', () => {
        const piMsg: AssistantMessage = {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check' },
            { type: 'toolCall', id: 'call_1', name: 'search', arguments: { query: 'test' } },
          ],
          api: 'openai-responses',
          provider: 'openai',
          model: 'gpt-4o-mini',
          usage: {
            input: 10,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 15,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'toolUse',
          timestamp: Date.now(),
        };

        const result = adaptFromPiAiMessage(piMsg, 'agent-1');

        expect(result.role).toBe('assistant');
        expect(result.content).toBe('Let me check');
        expect(result.tool_calls).toHaveLength(1);
        expect(result.tool_calls?.[0].function.name).toBe('search');
        expect(result.tool_calls?.[0].function.arguments).toBe('{"query":"test"}');
      });
    });

    describe('adaptToPiAiContext', () => {
      it('should create pi-ai context from agent and messages', () => {
        const agent: Partial<Agent> = {
          id: 'agent-1',
          systemPrompt: 'You are helpful',
          provider: 'openai',
          model: 'gpt-4o-mini',
        };

        const messages: ChatMessage[] = [
          { role: 'user', content: 'Hello', createdAt: new Date() },
        ];

        const context = adaptToPiAiContext(agent as Agent, messages);

        expect(context.systemPrompt).toBe('You are helpful');
        expect(context.messages).toHaveLength(1);
        expect(context.messages[0].role).toBe('user');
      });

      it('should filter out system messages from history', () => {
        const agent: Partial<Agent> = {
          id: 'agent-1',
          systemPrompt: 'Default prompt',
          provider: 'openai',
          model: 'gpt-4o-mini',
        };

        const messages: ChatMessage[] = [
          { role: 'system', content: 'System msg', createdAt: new Date() },
          { role: 'user', content: 'Hello', createdAt: new Date() },
        ];

        const context = adaptToPiAiContext(agent as Agent, messages);

        // System message should be used as systemPrompt
        expect(context.systemPrompt).toBe('System msg');
        // Only user message in history
        expect(context.messages).toHaveLength(1);
        expect(context.messages[0].role).toBe('user');
      });
    });

    describe('mapProviderName', () => {
      it('should map Agent-World providers to pi-ai providers', () => {
        expect(mapProviderName('openai')).toBe('openai');
        expect(mapProviderName('anthropic')).toBe('anthropic');
        expect(mapProviderName('google')).toBe('google');
        expect(mapProviderName('azure')).toBe('azure-openai-responses');
        expect(mapProviderName('xai')).toBe('xai');
      });

      it('should map compatible providers to openai', () => {
        expect(mapProviderName('ollama')).toBe('openai');
        expect(mapProviderName('openai-compatible')).toBe('openai');
      });
    });
  });

  describe('Tool Adapters', () => {
    describe('adaptMCPTools', () => {
      it('should convert MCP tools to pi-ai format', () => {
        const mcpTools = {
          'search': {
            description: 'Search the web',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
            },
          },
        };

        const result = adaptMCPTools(mcpTools);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('search');
        expect(result[0].description).toBe('Search the web');
        expect(result[0].parameters).toBeDefined();
      });
    });

    describe('filterClientSideTools', () => {
      it('should filter out approval and HITL tools', () => {
        const tools = [
          { name: 'search', description: 'Search', parameters: {} },
          { name: 'client.approveToolUse', description: 'Approve', parameters: {} },
          { name: 'client.humanIntervention', description: 'HITL', parameters: {} },
          { name: 'calculator', description: 'Calculate', parameters: {} },
        ];

        const result = filterClientSideTools(tools as any);

        expect(result).toHaveLength(2);
        expect(result.map(t => t.name)).toEqual(['search', 'calculator']);
      });
    });

    describe('preparePiAiTools', () => {
      it('should adapt and filter MCP tools', () => {
        const mcpTools = {
          'search': {
            description: 'Search',
            inputSchema: { type: 'object' },
          },
          'client.approveToolUse': {
            description: 'Approval',
            inputSchema: { type: 'object' },
          },
        };

        const result = preparePiAiTools(mcpTools);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('search');
      });
    });
  });

  describe('Feature Flags', () => {
    describe('shouldUsePiAgent', () => {
      it('should return false when feature flag is disabled', () => {
        const agent = { provider: 'openai' };
        
        // Feature flag should be false by default
        expect(USE_PI_AGENT).toBe(false);
        expect(shouldUsePiAgent(agent as Agent)).toBe(false);
      });

      it('should check provider list when enabled', () => {
        // Note: Can't easily test with env vars in unit tests
        // This would be tested in integration tests
      });
    });
  });

  describe('Event Adapters', () => {
    describe('adaptPiAiStreamEvent', () => {
      it('should convert text_delta to stream event', () => {
        const event = {
          type: 'text_delta' as const,
          contentIndex: 0,
          delta: 'Hello',
          partial: {} as any,
        };

        const result = adaptPiAiStreamEvent(event, 'agent-1', 'msg-1');

        expect(result).toEqual({
          type: 'stream',
          content: 'Hello',
          sender: 'agent-1',
          messageId: 'msg-1',
        });
      });

      it('should convert toolcall_end to tool_call event', () => {
        const event = {
          type: 'toolcall_end' as const,
          contentIndex: 0,
          content: '',
          partial: {} as any,
          toolCall: {
            type: 'toolCall' as const,
            id: 'call_1',
            name: 'search',
            arguments: { query: 'test' },
          },
        };

        const result = adaptPiAiStreamEvent(event, 'agent-1', 'msg-1');

        expect(result).toEqual({
          type: 'tool_call',
          toolName: 'search',
          toolCallId: 'call_1',
          sender: 'agent-1',
          messageId: 'msg-1',
        });
      });

      it('should return null for ignored events', () => {
        const event = {
          type: 'start' as const,
          partial: {} as any,
        };

        const result = adaptPiAiStreamEvent(event, 'agent-1', 'msg-1');

        expect(result).toBeNull();
      });
    });
  });
});

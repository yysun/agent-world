/**
 * Tool Action Runtime Tests
 *
 * Purpose:
 * - Verify the shared tool-action runtime preserves host-side shell semantics while resolving executable tools through the runtime-backed resolver.
 *
 * Key Features:
 * - Confirms shell tool execution uses `getRuntimeToolsForWorld(...)`.
 * - Confirms enveloped shell results still publish tool lifecycle events and synthetic assistant display rows.
 * - Confirms thrown shell approval errors are normalized into canonical shell envelopes at the shared runtime seam.
 *
 * Notes on Implementation:
 * - Uses in-memory world and agent fixtures only.
 * - Mocks the runtime tool resolver and tool-event publisher; no real filesystem, network, or process execution.
 *
 * Summary of Recent Changes:
 * - 2026-04-24: Added write_file runtime-boundary coverage so all rich runtime-owned tools now have explicit seam assertions here or at the resolver layer.
 * - 2026-04-24: Added web_fetch and load_skill runtime-boundary coverage so rich-tool seam assertions are not shell-only.
 * - 2026-04-24: Added initial boundary coverage for shell host-side behaviors after executable tool lookup moved to `getRuntimeToolsForWorld(...)`.
 */

import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Agent, AgentMessage, World } from '../../../core/types.js';
import {
  executeToolActionStep,
  parseToolCallArguments,
} from '../../../core/events/tool-action-runtime.js';
import {
  parseToolExecutionEnvelopeContent,
  serializeToolExecutionEnvelope,
} from '../../../core/tool-execution-envelope.js';
import { parseSyntheticAssistantToolResultContent } from '../../../core/synthetic-assistant-tool-result.js';

const mocks = vi.hoisted(() => ({
  getRuntimeToolsForWorld: vi.fn(async () => ({})),
  publishToolEvent: vi.fn(),
}));

vi.mock('../../../core/llm-runtime.js', () => ({
  getRuntimeToolsForWorld: mocks.getRuntimeToolsForWorld,
}));

vi.mock('../../../core/events/publishers.js', () => ({
  publishToolEvent: mocks.publishToolEvent,
}));

function createWorld(): World {
  return {
    id: 'world-1',
    name: 'World 1',
    createdAt: new Date(),
    lastUpdated: new Date(),
    turnLimit: 20,
    totalAgents: 1,
    totalMessages: 0,
    currentChatId: 'chat-1',
    variables: 'working_directory=/tmp/work',
    eventEmitter: new EventEmitter(),
    agents: new Map(),
    chats: new Map(),
  } as World;
}

function createAgent(): Agent {
  return {
    id: 'agent-a',
    name: 'Agent A',
    type: 'assistant',
    provider: 'openai' as any,
    model: 'gpt-4o-mini',
    llmCallCount: 0,
    memory: [],
  } as Agent;
}

function createAssistantToolCallMessage(toolName: string, rawArguments: string, toolCallId: string): AgentMessage {
  return {
    role: 'assistant',
    content: `Calling tool: ${toolName}`,
    sender: 'agent-a',
    createdAt: new Date('2026-04-24T12:00:00.000Z'),
    chatId: 'chat-1',
    messageId: 'assistant-tool-call-1',
    agentId: 'agent-a',
    tool_calls: [
      {
        id: toolCallId,
        type: 'function',
        function: {
          name: toolName,
          arguments: rawArguments,
        },
      },
    ],
    toolCallStatus: {
      [toolCallId]: {
        complete: false,
        result: null,
      },
    },
  } as AgentMessage;
}

describe('tool-action runtime boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRuntimeToolsForWorld.mockResolvedValue({});
  });

  it('preserves shell envelope previews and synthetic display rows through the runtime-backed resolver', async () => {
    const world = createWorld();
    const agent = createAgent();
    const emittedMessages: any[] = [];
    world.eventEmitter.on('message', (event) => emittedMessages.push(event));

    const rawArguments = JSON.stringify({ command: 'python', parameters: ['render.py'] });
    const toolCallId = 'tc-shell-runtime-1';
    const assistantToolCallMessage = createAssistantToolCallMessage('shell_cmd', rawArguments, toolCallId);
    agent.memory.push(assistantToolCallMessage);

    const serializedToolResult = serializeToolExecutionEnvelope({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'shell_cmd',
      tool_call_id: toolCallId,
      status: 'completed',
      preview: {
        kind: 'markdown',
        renderer: 'markdown',
        text: 'status: success\nstdout_preview:\nrender complete',
      },
      display_content: '<div><strong>Render complete.</strong></div>',
      result: 'status: success\nstdout_preview:\nrender complete',
    });
    const execute = vi.fn(async () => serializedToolResult);
    mocks.getRuntimeToolsForWorld.mockResolvedValue({
      shell_cmd: { execute },
    });

    const toolCall = assistantToolCallMessage.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('Expected tool call fixture');
    }

    const result = await executeToolActionStep({
      world,
      agent,
      assistantToolCallMessage,
      toolCall,
      chatId: 'chat-1',
      toolArgs: parseToolCallArguments(rawArguments),
      trustedWorkingDirectory: '/tmp/work',
      toolEventInput: { command: 'python', parameters: ['render.py'] },
      llmResultMode: 'minimal',
      persistToolEnvelope: true,
    });

    expect(result.status).toBe('success');
    expect(mocks.getRuntimeToolsForWorld).toHaveBeenCalledWith(world);
    expect(execute).toHaveBeenCalledWith(
      { command: 'python', parameters: ['render.py'] },
      expect.objectContaining({
        chatId: 'chat-1',
        agentName: 'agent-a',
        llmResultMode: 'minimal',
        persistToolEnvelope: true,
      }),
    );
    expect(assistantToolCallMessage.toolCallStatus?.[toolCallId]).toMatchObject({
      complete: true,
      result: serializedToolResult,
    });

    const persistedToolMessage = agent.memory.find((message) => message.role === 'tool' && message.tool_call_id === toolCallId);
    expect(persistedToolMessage?.content).toBe(serializedToolResult);

    const syntheticAssistantMessage = agent.memory.find((message) => message.role === 'assistant' && message.messageId !== 'assistant-tool-call-1');
    expect(parseSyntheticAssistantToolResultContent(String(syntheticAssistantMessage?.content || ''))).toMatchObject({
      tool: 'shell_cmd',
      tool_call_id: toolCallId,
      content: '<div><strong>Render complete.</strong></div>',
    });
    expect(emittedMessages).toContainEqual(expect.objectContaining({
      role: 'assistant',
      chatId: 'chat-1',
      syntheticDisplayOnly: true,
    }));

    expect(mocks.publishToolEvent).toHaveBeenNthCalledWith(
      1,
      world,
      expect.objectContaining({
        type: 'tool-start',
        messageId: toolCallId,
        chatId: 'chat-1',
        toolExecution: expect.objectContaining({
          toolName: 'shell_cmd',
          toolCallId,
        }),
      }),
    );
    expect(mocks.publishToolEvent).toHaveBeenNthCalledWith(
      2,
      world,
      expect.objectContaining({
        type: 'tool-result',
        messageId: toolCallId,
        chatId: 'chat-1',
        toolExecution: expect.objectContaining({
          toolName: 'shell_cmd',
          toolCallId,
          preview: {
            kind: 'markdown',
            renderer: 'markdown',
            text: 'status: success\nstdout_preview:\nrender complete',
          },
          result: 'status: success\nstdout_preview:\nrender complete',
          resultType: 'string',
          resultSize: serializedToolResult.length,
        }),
      }),
    );
  });

  it('normalizes thrown shell approval errors into canonical envelopes at the runtime boundary', async () => {
    const world = createWorld();
    const agent = createAgent();

    const rawArguments = JSON.stringify({ command: 'curl', parameters: ['-O', 'https://example.com/file'] });
    const toolCallId = 'tc-shell-runtime-error-1';
    const assistantToolCallMessage = createAssistantToolCallMessage('shell_cmd', rawArguments, toolCallId);
    agent.memory.push(assistantToolCallMessage);

    const execute = vi.fn(async () => {
      throw new Error('approval required for remote_download and request was not approved');
    });
    mocks.getRuntimeToolsForWorld.mockResolvedValue({
      shell_cmd: { execute },
    });

    const toolCall = assistantToolCallMessage.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('Expected tool call fixture');
    }

    const result = await executeToolActionStep({
      world,
      agent,
      assistantToolCallMessage,
      toolCall,
      chatId: 'chat-1',
      toolArgs: parseToolCallArguments(rawArguments),
      trustedWorkingDirectory: '/tmp/work',
      toolEventInput: { command: 'curl', parameters: ['-O', 'https://example.com/file'] },
      llmResultMode: 'minimal',
      persistToolEnvelope: true,
    });

    expect(result.status).toBe('error');
    expect(mocks.getRuntimeToolsForWorld).toHaveBeenCalledWith(world);
    const envelope = parseToolExecutionEnvelopeContent(result.serializedToolResult);
    expect(envelope).not.toBeNull();
    expect(envelope?.tool).toBe('shell_cmd');
    expect(String(envelope?.result || '')).toContain('status: failed');
    expect(String(envelope?.result || '')).toContain('reason: approval_denied');
    expect(String(envelope?.result || '')).toContain('exit_code: null');
    expect(JSON.stringify(envelope?.preview || null)).toContain('approval required for remote_download and request was not approved');

    expect(assistantToolCallMessage.toolCallStatus?.[toolCallId]).toMatchObject({
      complete: true,
      result: result.serializedToolResult,
    });
    expect(agent.memory.some((message) => message.role === 'assistant' && message.messageId !== 'assistant-tool-call-1')).toBe(false);

    expect(mocks.publishToolEvent).toHaveBeenNthCalledWith(
      1,
      world,
      expect.objectContaining({
        type: 'tool-start',
        messageId: toolCallId,
      }),
    );
    expect(mocks.publishToolEvent).toHaveBeenNthCalledWith(
      2,
      world,
      expect.objectContaining({
        type: 'tool-error',
        messageId: toolCallId,
        chatId: 'chat-1',
        toolExecution: expect.objectContaining({
          toolName: 'shell_cmd',
          toolCallId,
          error: 'approval required for remote_download and request was not approved',
        }),
      }),
    );
  });

  it('preserves web_fetch preview payloads and synthetic display rows through the runtime-backed resolver', async () => {
    const world = createWorld();
    const agent = createAgent();
    const emittedMessages: any[] = [];
    world.eventEmitter.on('message', (event) => emittedMessages.push(event));

    const rawArguments = JSON.stringify({ url: 'https://example.com/docs' });
    const toolCallId = 'tc-web-fetch-runtime-1';
    const assistantToolCallMessage = createAssistantToolCallMessage('web_fetch', rawArguments, toolCallId);
    agent.memory.push(assistantToolCallMessage);

    const serializedToolResult = serializeToolExecutionEnvelope({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'web_fetch',
      tool_call_id: toolCallId,
      status: 'completed',
      preview: {
        kind: 'url',
        renderer: 'url',
        url: 'https://example.com/docs',
        title: 'Example Docs',
        text: 'Status 200 • text/html • html',
      },
      display_content: '# Example Docs\n\nHello from the docs page.',
      result: JSON.stringify({
        url: 'https://example.com/docs',
        resolvedUrl: 'https://example.com/docs',
        status: 200,
        ok: true,
        contentType: 'text/html; charset=utf-8',
        title: 'Example Docs',
        mode: 'html',
        markdown: '# Example Docs\n\nHello from the docs page.',
        truncated: false,
        timingMs: 12,
      }),
    });
    const execute = vi.fn(async () => serializedToolResult);
    mocks.getRuntimeToolsForWorld.mockResolvedValue({
      web_fetch: { execute },
    });

    const toolCall = assistantToolCallMessage.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('Expected tool call fixture');
    }

    const result = await executeToolActionStep({
      world,
      agent,
      assistantToolCallMessage,
      toolCall,
      chatId: 'chat-1',
      toolArgs: parseToolCallArguments(rawArguments),
      trustedWorkingDirectory: '/tmp/work',
      toolEventInput: { url: 'https://example.com/docs' },
      llmResultMode: 'verbose',
      persistToolEnvelope: true,
    });

    expect(result.status).toBe('success');
    expect(mocks.getRuntimeToolsForWorld).toHaveBeenCalledWith(world);
    expect(execute).toHaveBeenCalledWith(
      { url: 'https://example.com/docs' },
      expect.objectContaining({
        chatId: 'chat-1',
        agentName: 'agent-a',
        llmResultMode: 'verbose',
        persistToolEnvelope: true,
      }),
    );

    const syntheticAssistantMessage = agent.memory.find((message) => message.role === 'assistant' && message.messageId !== 'assistant-tool-call-1');
    expect(parseSyntheticAssistantToolResultContent(String(syntheticAssistantMessage?.content || ''))).toMatchObject({
      tool: 'web_fetch',
      tool_call_id: toolCallId,
      content: '# Example Docs\n\nHello from the docs page.',
    });
    expect(emittedMessages).toContainEqual(expect.objectContaining({
      role: 'assistant',
      chatId: 'chat-1',
      syntheticDisplayOnly: true,
    }));

    expect(mocks.publishToolEvent).toHaveBeenNthCalledWith(
      2,
      world,
      expect.objectContaining({
        type: 'tool-result',
        messageId: toolCallId,
        chatId: 'chat-1',
        toolExecution: expect.objectContaining({
          toolName: 'web_fetch',
          toolCallId,
          preview: {
            kind: 'url',
            renderer: 'url',
            url: 'https://example.com/docs',
            title: 'Example Docs',
            text: 'Status 200 • text/html • html',
          },
          result: String(parseToolExecutionEnvelopeContent(serializedToolResult)?.result || ''),
          resultType: 'string',
          resultSize: serializedToolResult.length,
        }),
      }),
    );
  });

  it('persists load_skill envelopes without synthetic display rows through the runtime-backed resolver', async () => {
    const world = createWorld();
    const agent = createAgent();
    const emittedMessages: any[] = [];
    world.eventEmitter.on('message', (event) => emittedMessages.push(event));

    const rawArguments = JSON.stringify({ skill_id: 'find-skills' });
    const toolCallId = 'tc-load-skill-runtime-1';
    const assistantToolCallMessage = createAssistantToolCallMessage('load_skill', rawArguments, toolCallId);
    agent.memory.push(assistantToolCallMessage);

    const skillContext = '<skill_context id="find-skills"><description>Find skills</description><skill_root>/tmp/skills/find-skills</skill_root><instructions># Skill</instructions></skill_context>';
    const serializedToolResult = serializeToolExecutionEnvelope({
      __type: 'tool_execution_envelope',
      version: 1,
      tool: 'load_skill',
      tool_call_id: toolCallId,
      status: 'completed',
      preview: null,
      result: skillContext,
    });
    const execute = vi.fn(async () => serializedToolResult);
    mocks.getRuntimeToolsForWorld.mockResolvedValue({
      load_skill: { execute },
    });

    const toolCall = assistantToolCallMessage.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('Expected tool call fixture');
    }

    const result = await executeToolActionStep({
      world,
      agent,
      assistantToolCallMessage,
      toolCall,
      chatId: 'chat-1',
      toolArgs: parseToolCallArguments(rawArguments),
      trustedWorkingDirectory: '/tmp/work',
      toolEventInput: { skill_id: 'find-skills' },
      llmResultMode: 'verbose',
      persistToolEnvelope: true,
    });

    expect(result.status).toBe('success');
    expect(mocks.getRuntimeToolsForWorld).toHaveBeenCalledWith(world);
    expect(execute).toHaveBeenCalledWith(
      { skill_id: 'find-skills' },
      expect.objectContaining({
        chatId: 'chat-1',
        agentName: 'agent-a',
        llmResultMode: 'verbose',
        persistToolEnvelope: true,
      }),
    );

    expect(parseSyntheticAssistantToolResultContent(String(agent.memory.find((message) => message.role === 'assistant' && message.messageId !== 'assistant-tool-call-1')?.content || ''))).toBeNull();
    expect(emittedMessages).toHaveLength(0);
    expect(assistantToolCallMessage.toolCallStatus?.[toolCallId]).toMatchObject({
      complete: true,
      result: serializedToolResult,
    });

    expect(mocks.publishToolEvent).toHaveBeenNthCalledWith(
      2,
      world,
      expect.objectContaining({
        type: 'tool-result',
        messageId: toolCallId,
        chatId: 'chat-1',
        toolExecution: expect.objectContaining({
          toolName: 'load_skill',
          toolCallId,
          result: skillContext,
          resultType: 'string',
          resultSize: serializedToolResult.length,
        }),
      }),
    );
  });

  it('persists write_file results without synthetic display rows through the runtime-backed resolver', async () => {
    const world = createWorld();
    const agent = createAgent();
    const emittedMessages: any[] = [];
    world.eventEmitter.on('message', (event) => emittedMessages.push(event));

    const rawArguments = JSON.stringify({ filePath: 'notes/todo.txt', content: 'hello' });
    const toolCallId = 'tc-write-file-runtime-1';
    const assistantToolCallMessage = createAssistantToolCallMessage('write_file', rawArguments, toolCallId);
    agent.memory.push(assistantToolCallMessage);

    const serializedToolResult = JSON.stringify({
      ok: true,
      status: 'success',
      filePath: '/tmp/work/notes/todo.txt',
      mode: 'overwrite',
      operation: 'created',
      created: true,
      updated: false,
      bytesWritten: 5,
    });
    const execute = vi.fn(async () => serializedToolResult);
    mocks.getRuntimeToolsForWorld.mockResolvedValue({
      write_file: { execute },
    });

    const toolCall = assistantToolCallMessage.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('Expected tool call fixture');
    }

    const result = await executeToolActionStep({
      world,
      agent,
      assistantToolCallMessage,
      toolCall,
      chatId: 'chat-1',
      toolArgs: parseToolCallArguments(rawArguments),
      trustedWorkingDirectory: '/tmp/work',
      toolEventInput: { filePath: 'notes/todo.txt', content: 'hello' },
      llmResultMode: 'verbose',
      persistToolEnvelope: true,
    });

    expect(result.status).toBe('success');
    expect(mocks.getRuntimeToolsForWorld).toHaveBeenCalledWith(world);
    expect(execute).toHaveBeenCalledWith(
      { filePath: 'notes/todo.txt', content: 'hello' },
      expect.objectContaining({
        chatId: 'chat-1',
        agentName: 'agent-a',
        llmResultMode: 'verbose',
        persistToolEnvelope: true,
      }),
    );

    expect(parseSyntheticAssistantToolResultContent(String(agent.memory.find((message) => message.role === 'assistant' && message.messageId !== 'assistant-tool-call-1')?.content || ''))).toBeNull();
    expect(emittedMessages).toHaveLength(0);
    expect(assistantToolCallMessage.toolCallStatus?.[toolCallId]).toMatchObject({
      complete: true,
      result: serializedToolResult,
    });

    expect(mocks.publishToolEvent).toHaveBeenNthCalledWith(
      2,
      world,
      expect.objectContaining({
        type: 'tool-result',
        messageId: toolCallId,
        chatId: 'chat-1',
        toolExecution: expect.objectContaining({
          toolName: 'write_file',
          toolCallId,
          result: serializedToolResult,
          resultType: 'string',
          resultSize: serializedToolResult.length,
        }),
      }),
    );
  });
});
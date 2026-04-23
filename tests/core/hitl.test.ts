/**
 * HITL Option Runtime Tests
 *
 * Purpose:
 * - Validate generic world HITL option request/response behavior.
 *
 * Features tested:
 * - Emits tool-progress events with HITL prompt payload metadata
 * - Resolves pending request on submitted user response
 * - Replays unresolved requests deterministically for loaded chat scope
 * - Message-authoritative read model: pending/resolved state from persisted messages
 * - Chained live-session HITL: simultaneous requests from different producers
 *
 * Implementation notes:
 * - Uses in-memory EventEmitter world doubles.
 * - No filesystem or network access.
 *
 * Recent changes:
 * - 2026-03-06: Added message-authoritative HITL read model tests and chained live-session test.
 * - 2026-03-10: Added persisted `load_skill` approval prompt identity coverage for the message-authoritative read model.
 * - 2026-02-24: Replaced timeout fallback expectations with replay/scoping coverage.
 * - 2026-02-14: Added initial coverage for core HITL option runtime.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHitlStateForTests,
  listPendingHitlPromptEventsFromMessages,
  replayPendingHitlRequests,
  requestWorldOption,
  submitWorldHitlResponse,
  submitWorldOptionResponse,
} from '../../core/hitl.js';

describe('core/hitl', () => {
  beforeEach(() => {
    clearHitlStateForTests();
    vi.useRealTimers();
  });

  it('emits a HITL tool-progress event and resolves with submitted user option', async () => {
    const worldEventEmitter = new EventEmitter();
    const world = {
      id: 'world-1',
      currentChatId: 'chat-1',
      eventEmitter: worldEventEmitter,
    } as any;

    let capturedRequestId = '';
    worldEventEmitter.on('world', (event: any) => {
      capturedRequestId = String(event?.toolExecution?.metadata?.hitlPrompt?.requestId || '');
    });

    const pending = requestWorldOption(world, {
      title: 'Approval required',
      message: 'Run scripts?',
      options: [
        { id: 'yes_once', label: 'Yes once' },
        { id: 'no', label: 'No' },
      ],
      defaultOptionId: 'no',
      chatId: 'chat-1',
      timeoutMs: 5000,
    });

    await Promise.resolve();
    expect(capturedRequestId).not.toBe('');

    const submitResult = submitWorldOptionResponse({
      worldId: 'world-1',
      requestId: capturedRequestId,
      optionId: 'yes_once',
    });
    expect(submitResult).toEqual({ accepted: true, metadata: null });

    const resolution = await pending;
    expect(resolution).toMatchObject({
      worldId: 'world-1',
      requestId: capturedRequestId,
      optionId: 'yes_once',
      source: 'user',
      chatId: 'chat-1',
    });
  });

  it('includes explicit agentName in emitted HITL prompt payload', async () => {
    const worldEventEmitter = new EventEmitter();
    const world = {
      id: 'world-agent-explicit',
      currentChatId: 'chat-1',
      mainAgent: 'main-agent',
      eventEmitter: worldEventEmitter,
    } as any;

    const seenAgentNames: string[] = [];
    worldEventEmitter.on('world', (event: any) => {
      seenAgentNames.push(String(event?.toolExecution?.metadata?.hitlPrompt?.agentName || ''));
    });

    const pending = requestWorldOption(world, {
      requestId: 'req-agent-explicit',
      title: 'Approval required',
      message: 'Proceed?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      chatId: 'chat-1',
      agentName: 'worker-1',
    });

    await Promise.resolve();
    expect(seenAgentNames).toEqual(['worker-1']);

    submitWorldHitlResponse({
      worldId: 'world-agent-explicit',
      requestId: 'req-agent-explicit',
      optionId: 'yes',
      chatId: 'chat-1',
    });
    await expect(pending).resolves.toMatchObject({ optionId: 'yes' });
  });

  it('falls back to world mainAgent for HITL prompt agentName when request omits it', async () => {
    const worldEventEmitter = new EventEmitter();
    const world = {
      id: 'world-agent-main',
      currentChatId: 'chat-2',
      mainAgent: 'main-agent-1',
      eventEmitter: worldEventEmitter,
    } as any;

    const seenAgentNames: string[] = [];
    worldEventEmitter.on('world', (event: any) => {
      seenAgentNames.push(String(event?.toolExecution?.metadata?.hitlPrompt?.agentName || ''));
    });

    const pending = requestWorldOption(world, {
      requestId: 'req-agent-main',
      title: 'Approval required',
      message: 'Proceed?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      chatId: 'chat-2',
    });

    await Promise.resolve();
    expect(seenAgentNames).toEqual(['main-agent-1']);

    replayPendingHitlRequests(world, 'chat-2');
    expect(seenAgentNames).toEqual(['main-agent-1', 'main-agent-1']);

    submitWorldHitlResponse({
      worldId: 'world-agent-main',
      requestId: 'req-agent-main',
      optionId: 'yes',
      chatId: 'chat-2',
    });
    await expect(pending).resolves.toMatchObject({ optionId: 'yes' });
  });

  it('replays unresolved HITL requests for the requested chat in deterministic order', async () => {
    const world = {
      id: 'world-1',
      currentChatId: 'chat-2',
      eventEmitter: new EventEmitter(),
    } as any;

    const seenRequests: Array<{ requestId: string; chatId: string | null }> = [];
    world.eventEmitter.on('world', (event: any) => {
      const content = event?.toolExecution?.metadata?.hitlPrompt || {};
      seenRequests.push({
        requestId: String(content.requestId || ''),
        chatId: event?.chatId ? String(event.chatId) : null,
      });
    });

    const pendingA = requestWorldOption(world, {
      requestId: 'req-a',
      title: 'A',
      message: 'A?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      chatId: 'chat-2',
    });

    const pendingB = requestWorldOption(world, {
      requestId: 'req-b',
      title: 'B',
      message: 'B?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      chatId: 'chat-2',
    });

    const pendingOtherChat = requestWorldOption(world, {
      requestId: 'req-c',
      title: 'C',
      message: 'C?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      chatId: 'chat-3',
    });

    await Promise.resolve();
    expect(seenRequests.map((entry) => entry.requestId)).toEqual(['req-a', 'req-b', 'req-c']);

    const replayedCount = replayPendingHitlRequests(world, 'chat-2');
    expect(replayedCount).toBe(2);

    expect(seenRequests.slice(3).map((entry) => entry.requestId)).toEqual(['req-a', 'req-b']);
    expect(seenRequests.slice(3).every((entry) => entry.chatId === 'chat-2')).toBe(true);

    submitWorldHitlResponse({ worldId: 'world-1', requestId: 'req-a', optionId: 'yes', chatId: 'chat-2' });
    submitWorldHitlResponse({ worldId: 'world-1', requestId: 'req-b', optionId: 'no', chatId: 'chat-2' });
    submitWorldHitlResponse({ worldId: 'world-1', requestId: 'req-c', optionId: 'yes', chatId: 'chat-3' });

    await expect(pendingA).resolves.toMatchObject({ requestId: 'req-a', optionId: 'yes', source: 'user' });
    await expect(pendingB).resolves.toMatchObject({ requestId: 'req-b', optionId: 'no', source: 'user' });
    await expect(pendingOtherChat).resolves.toMatchObject({ requestId: 'req-c', optionId: 'yes', source: 'user' });
  });

  it('rejects mismatched chat scope in generic response submission', async () => {
    const worldEventEmitter = new EventEmitter();
    const world = {
      id: 'world-3',
      currentChatId: 'chat-3',
      eventEmitter: worldEventEmitter,
    } as any;
    let capturedRequestId = '';
    worldEventEmitter.on('world', (event: any) => {
      capturedRequestId = String(event?.toolExecution?.metadata?.hitlPrompt?.requestId || '');
    });

    const pending = requestWorldOption(world, {
      title: 'Approval required',
      message: 'Continue?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      chatId: 'chat-3',
      timeoutMs: 5000,
    });

    await Promise.resolve();
    expect(capturedRequestId).not.toBe('');

    const rejection = submitWorldHitlResponse({
      worldId: 'world-3',
      requestId: capturedRequestId,
      optionId: 'yes',
      chatId: 'different-chat',
    });
    expect(rejection.accepted).toBe(false);
    expect(String(rejection.reason || '')).toContain('belongs to chat');

    submitWorldOptionResponse({
      worldId: 'world-3',
      requestId: capturedRequestId,
      optionId: 'yes',
      chatId: 'chat-3',
    });
    const resolution = await pending;
    expect(resolution.optionId).toBe('yes');
  });

  it('keeps a single logical pending request across repeated replay emissions', async () => {
    const world = {
      id: 'world-9',
      currentChatId: 'chat-9',
      eventEmitter: new EventEmitter(),
    } as any;

    const seenReplayIds: string[] = [];
    world.eventEmitter.on('world', (event: any) => {
      seenReplayIds.push(String(event?.toolExecution?.metadata?.hitlPrompt?.requestId || ''));
    });

    const pending = requestWorldOption(world, {
      requestId: 'req-single',
      title: 'Approval',
      message: 'Proceed?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      chatId: 'chat-9',
    });

    replayPendingHitlRequests(world, 'chat-9');
    replayPendingHitlRequests(world, 'chat-9');
    expect(seenReplayIds.slice(1)).toEqual(['req-single', 'req-single']);

    const accepted = submitWorldHitlResponse({
      worldId: 'world-9',
      requestId: 'req-single',
      optionId: 'yes',
      chatId: 'chat-9',
    });
    expect(accepted.accepted).toBe(true);

    const duplicateResolution = submitWorldHitlResponse({
      worldId: 'world-9',
      requestId: 'req-single',
      optionId: 'yes',
      chatId: 'chat-9',
    });
    expect(duplicateResolution.accepted).toBe(false);

    await expect(pending).resolves.toMatchObject({ requestId: 'req-single', optionId: 'yes', source: 'user' });
  });

  it('uses toolCallId as requestId when explicit requestId is omitted', async () => {
    const worldEventEmitter = new EventEmitter();
    const world = {
      id: 'world-tool-id',
      currentChatId: 'chat-tool-id',
      eventEmitter: worldEventEmitter,
    } as any;

    let emittedRequestId = '';
    worldEventEmitter.on('world', (event: any) => {
      emittedRequestId = String(event?.toolExecution?.metadata?.hitlPrompt?.requestId || '');
    });

    const pending = requestWorldOption(world, {
      title: 'Approval required',
      message: 'Proceed?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      chatId: 'chat-tool-id',
      metadata: {
        tool: 'human_intervention_request',
        toolCallId: 'call-hitl-identity-1',
      },
    });

    await Promise.resolve();
    expect(emittedRequestId).toBe('call-hitl-identity-1');

    const accepted = submitWorldHitlResponse({
      worldId: 'world-tool-id',
      requestId: 'call-hitl-identity-1',
      optionId: 'yes',
      chatId: 'chat-tool-id',
    });
    expect(accepted.accepted).toBe(true);

    await expect(pending).resolves.toMatchObject({
      requestId: 'call-hitl-identity-1',
      optionId: 'yes',
      source: 'user',
    });
  });

  it('accepts distinct requestId and toolCallId and keeps their roles separate', async () => {
    const worldEventEmitter = new EventEmitter();
    const world = {
      id: 'world-mismatch',
      currentChatId: 'chat-mismatch',
      eventEmitter: worldEventEmitter,
    } as any;

    const seenEvents: Array<{ requestId: string; toolCallId: string; messageId: string }> = [];
    worldEventEmitter.on('world', (event: any) => {
      seenEvents.push({
        requestId: String(event?.toolExecution?.metadata?.hitlPrompt?.requestId || ''),
        toolCallId: String(event?.toolExecution?.toolCallId || ''),
        messageId: String(event?.messageId || ''),
      });
    });

    const pending = requestWorldOption(world, {
      requestId: 'req-explicit',
      title: 'Approval required',
      message: 'Proceed?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      metadata: {
        tool: 'shell_cmd',
        toolCallId: 'call-different',
      },
      chatId: 'chat-mismatch',
    });

    await Promise.resolve();
    expect(seenEvents).toEqual([{
      requestId: 'req-explicit',
      toolCallId: 'call-different',
      messageId: 'call-different',
    }]);

    const accepted = submitWorldHitlResponse({
      worldId: 'world-mismatch',
      requestId: 'req-explicit',
      optionId: 'yes',
      chatId: 'chat-mismatch',
    });
    expect(accepted.accepted).toBe(true);

    await expect(pending).resolves.toMatchObject({
      requestId: 'req-explicit',
      optionId: 'yes',
      source: 'user',
    });
  });

  it('rejects HITL requests without an explicit chatId', async () => {
    const world = {
      id: 'world-missing-chat',
      currentChatId: 'chat-from-world',
      eventEmitter: new EventEmitter(),
    } as any;

    await expect(requestWorldOption(world, {
      title: 'Approval required',
      message: 'Proceed?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
    })).rejects.toThrow('explicit chatId');
  });
});

// ---------------------------------------------------------------------------
// Message-authoritative HITL read model
// ---------------------------------------------------------------------------

function makeHitlAssistantMessage(toolCallId: string, question: string, options: string[], chatId?: string) {
  return {
    role: 'assistant',
    chatId: chatId || null,
    tool_calls: [
      {
        id: toolCallId,
        function: {
          name: 'human_intervention_request',
          arguments: JSON.stringify({ question, options }),
        },
      },
    ],
  };
}

function makeLoadSkillApprovalAssistantMessage(toolCallId: string, skillId: string, chatId?: string) {
  return {
    role: 'assistant',
    sender: 'qwen',
    chatId: chatId || null,
    content: `Calling tool: human_intervention_request (skill_id: "${skillId}")`,
    tool_calls: [
      {
        id: toolCallId,
        function: {
          name: 'human_intervention_request',
          arguments: JSON.stringify({
            question: 'Approve applying this skill now?',
            options: ['Yes once', 'Yes in this session', 'No'],
            defaultOption: 'No',
            metadata: {
              tool: 'human_intervention_request',
              toolCallId,
              source: 'load_skill',
              skillId,
            },
          }),
        },
      },
    ],
  };
}

function makeToolResponseMessage(toolCallId: string) {
  return { role: 'tool', tool_call_id: toolCallId };
}

describe('listPendingHitlPromptEventsFromMessages (message-authoritative read model)', () => {
  it('returns pending request when assistant tool-call has no corresponding tool-response', () => {
    const messages = [
      makeHitlAssistantMessage('call-1', 'Run scripts?', ['Yes', 'No'], 'chat-a'),
    ];

    const pending = listPendingHitlPromptEventsFromMessages(messages as any, 'chat-a');

    expect(pending).toHaveLength(1);
    expect(pending[0].prompt.requestId).toBe('call-1');
    expect(pending[0].prompt.toolCallId).toBe('call-1');
    expect(pending[0].chatId).toBe('chat-a');
    expect(pending[0].prompt.options.map((o) => o.label)).toEqual(['Yes', 'No']);
  });

  it('returns empty when tool-response message resolves the request', () => {
    const messages = [
      makeHitlAssistantMessage('call-resolved', 'Proceed?', ['Yes', 'No'], 'chat-b'),
      makeToolResponseMessage('call-resolved'),
    ];

    const pending = listPendingHitlPromptEventsFromMessages(messages as any, 'chat-b');

    expect(pending).toHaveLength(0);
  });

  it('returns only unresolved requests when some are resolved and some are not', () => {
    const messages = [
      makeHitlAssistantMessage('call-r1', 'First?', ['Yes', 'No'], 'chat-c'),
      makeToolResponseMessage('call-r1'),
      makeHitlAssistantMessage('call-u1', 'Second?', ['Continue', 'Stop'], 'chat-c'),
    ];

    const pending = listPendingHitlPromptEventsFromMessages(messages as any, 'chat-c');

    expect(pending).toHaveLength(1);
    expect(pending[0].prompt.requestId).toBe('call-u1');
  });

  it('reconstructs a persisted load_skill approval prompt and resolves it when the matching tool response exists', () => {
    const unresolvedMessages = [
      makeLoadSkillApprovalAssistantMessage('load-skill-approval-1', 'yt-dlp', 'chat-load'),
    ];

    const pending = listPendingHitlPromptEventsFromMessages(unresolvedMessages as any, 'chat-load');

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      chatId: 'chat-load',
      prompt: {
        requestId: 'load-skill-approval-1',
        toolCallId: 'load-skill-approval-1',
        toolName: 'human_intervention_request',
        agentName: 'qwen',
      },
    });
    expect(pending[0].prompt.metadata).toMatchObject({
      source: 'load_skill',
      skillId: 'yt-dlp',
      toolCallId: 'load-skill-approval-1',
    });

    const resolvedMessages = [
      ...unresolvedMessages,
      makeToolResponseMessage('load-skill-approval-1'),
    ];

    expect(listPendingHitlPromptEventsFromMessages(resolvedMessages as any, 'chat-load')).toHaveLength(0);
  });

  it('reconstructs a persisted prompt with distinct requestId and owning toolCallId', () => {
    const messages = [
      {
        role: 'assistant',
        sender: 'planner',
        chatId: 'chat-shell',
        content: 'Calling tool: human_intervention_request',
        tool_calls: [
          {
            id: 'shell-approval-1',
            function: {
              name: 'human_intervention_request',
              arguments: JSON.stringify({
                title: 'Approve shell command?',
                question: 'Run rm test.txt?',
                options: [
                  { id: 'approve', label: 'Approve' },
                  { id: 'deny', label: 'Deny' },
                ],
                defaultOptionId: 'deny',
                defaultOption: 'Deny',
                metadata: {
                  tool: 'shell_cmd',
                  toolCallId: 'shell-call-1',
                },
              }),
            },
          },
        ],
      },
    ];

    const pending = listPendingHitlPromptEventsFromMessages(messages as any, 'chat-shell');

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      chatId: 'chat-shell',
      prompt: {
        requestId: 'shell-approval-1',
        toolCallId: 'shell-call-1',
        toolName: 'shell_cmd',
        title: 'Approve shell command?',
        defaultOptionId: 'deny',
        options: [
          { id: 'approve', label: 'Approve' },
          { id: 'deny', label: 'Deny' },
        ],
      },
    });
  });

  it('reconstructs unresolved ask_user_input prompts as HITL requests', () => {
    const messages = [
      {
        role: 'assistant',
        sender: 'planner',
        chatId: 'chat-alias',
        content: 'Calling tool: ask_user_input',
        tool_calls: [
          {
            id: 'ask-user-input-1',
            function: {
              name: 'ask_user_input',
              arguments: JSON.stringify({
                question: 'Proceed?',
                options: ['Yes', 'No'],
              }),
            },
          },
        ],
      },
    ];

    const pending = listPendingHitlPromptEventsFromMessages(messages as any, 'chat-alias');

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      chatId: 'chat-alias',
      prompt: {
        requestId: 'ask-user-input-1',
        toolCallId: 'ask-user-input-1',
        toolName: 'ask_user_input',
        message: 'Proceed?',
        options: [
          { id: 'opt_1', label: 'Yes' },
          { id: 'opt_2', label: 'No' },
        ],
      },
    });
  });

  it('returns multiple unresolved requests in stable creation order', () => {
    const messages = [
      makeHitlAssistantMessage('call-m1', 'First?', ['A', 'B'], 'chat-d'),
      makeHitlAssistantMessage('call-m2', 'Second?', ['C', 'D'], 'chat-d'),
      makeHitlAssistantMessage('call-m3', 'Third?', ['E', 'F'], 'chat-d'),
    ];

    const pending = listPendingHitlPromptEventsFromMessages(messages as any, 'chat-d');

    expect(pending.map((p) => p.prompt.requestId)).toEqual(['call-m1', 'call-m2', 'call-m3']);
  });

  it('isolates pending requests when called with separate chat message arrays', () => {
    // In real usage, getMemory(worldId, chatId) returns messages scoped to one chat.
    // The function processes whatever messages are passed — callers scope to chat first.
    const chatXMessages = [
      makeHitlAssistantMessage('call-x1', 'Chat X?', ['Yes', 'No'], 'chat-x'),
    ];
    const chatYMessages = [
      makeHitlAssistantMessage('call-y1', 'Chat Y?', ['Yes', 'No'], 'chat-y'),
    ];

    const pendingX = listPendingHitlPromptEventsFromMessages(chatXMessages as any, 'chat-x');
    const pendingY = listPendingHitlPromptEventsFromMessages(chatYMessages as any, 'chat-y');

    expect(pendingX.map((p) => p.prompt.requestId)).toEqual(['call-x1']);
    expect(pendingY.map((p) => p.prompt.requestId)).toEqual(['call-y1']);
  });

  it('is deterministic: same messages always produce the same pending set', () => {
    const messages = [
      makeHitlAssistantMessage('call-det1', 'Q1?', ['Yes', 'No'], 'chat-det'),
      makeHitlAssistantMessage('call-det2', 'Q2?', ['Continue', 'Abort'], 'chat-det'),
    ];

    const first = listPendingHitlPromptEventsFromMessages(messages as any, 'chat-det');
    const second = listPendingHitlPromptEventsFromMessages(messages as any, 'chat-det');

    expect(first.map((p) => p.prompt.requestId)).toEqual(second.map((p) => p.prompt.requestId));
  });
});

// ---------------------------------------------------------------------------
// Chained live-session HITL: simultaneous requests from multiple producers
// ---------------------------------------------------------------------------

describe('chained live-session HITL (skill approval + shell approval simultaneously)', () => {
  beforeEach(() => {
    clearHitlStateForTests();
    vi.useRealTimers();
  });

  it('handles two simultaneous HITL requests in FIFO order and resolves each independently', async () => {
    const world = {
      id: 'world-chain',
      currentChatId: 'chat-chain',
      eventEmitter: new EventEmitter(),
    } as any;

    const emittedIds: string[] = [];
    world.eventEmitter.on('world', (event: any) => {
      const requestId = event?.toolExecution?.metadata?.hitlPrompt?.requestId;
      if (requestId) emittedIds.push(String(requestId));
    });

    // Simulate skill approval and shell approval pending simultaneously
    const skillPending = requestWorldOption(world, {
      requestId: 'skill-approval-1',
      title: 'Skill approval',
      message: 'Allow skill execution?',
      options: [
        { id: 'yes_in_session', label: 'Yes for this session' },
        { id: 'no', label: 'No' },
      ],
      chatId: 'chat-chain',
    });

    const shellPending = requestWorldOption(world, {
      requestId: 'shell-approval-1',
      title: 'Script approval',
      message: 'Allow shell command?',
      options: [
        { id: 'yes', label: 'Yes once' },
        { id: 'no', label: 'No' },
      ],
      chatId: 'chat-chain',
    });

    // Both registered and emitted in FIFO order
    await Promise.resolve();
    expect(emittedIds).toEqual(['skill-approval-1', 'shell-approval-1']);

    // Replay preserves FIFO order
    const replayCount = replayPendingHitlRequests(world, 'chat-chain');
    expect(replayCount).toBe(2);
    expect(emittedIds.slice(2)).toEqual(['skill-approval-1', 'shell-approval-1']);

    // Resolve skill first
    const skillResult = submitWorldHitlResponse({
      worldId: 'world-chain',
      requestId: 'skill-approval-1',
      optionId: 'yes_in_session',
      chatId: 'chat-chain',
    });
    expect(skillResult.accepted).toBe(true);

    // Shell still pending
    const replayAfterSkill = replayPendingHitlRequests(world, 'chat-chain');
    expect(replayAfterSkill).toBe(1);

    // Resolve shell
    const shellResult = submitWorldHitlResponse({
      worldId: 'world-chain',
      requestId: 'shell-approval-1',
      optionId: 'yes',
      chatId: 'chat-chain',
    });
    expect(shellResult.accepted).toBe(true);

    // Both resolved
    const replayAfterBoth = replayPendingHitlRequests(world, 'chat-chain');
    expect(replayAfterBoth).toBe(0);

    const [skillResolution, shellResolution] = await Promise.all([skillPending, shellPending]);
    expect(skillResolution).toMatchObject({ requestId: 'skill-approval-1', optionId: 'yes_in_session', source: 'user' });
    expect(shellResolution).toMatchObject({ requestId: 'shell-approval-1', optionId: 'yes', source: 'user' });
  });

  it('does not leak pending requests across chat isolation boundaries in chained scenario', async () => {
    const world = {
      id: 'world-iso',
      currentChatId: 'chat-iso-1',
      eventEmitter: new EventEmitter(),
    } as any;

    // Request in chat-iso-1
    requestWorldOption(world, {
      requestId: 'req-iso-1',
      title: 'Approval',
      message: 'Chat 1 approval?',
      options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
      chatId: 'chat-iso-1',
    });

    // Request in chat-iso-2 (different chat)
    requestWorldOption(world, {
      requestId: 'req-iso-2',
      title: 'Approval',
      message: 'Chat 2 approval?',
      options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
      chatId: 'chat-iso-2',
    });

    await Promise.resolve();

    const replayChat1 = replayPendingHitlRequests(world, 'chat-iso-1');
    const replayChat2 = replayPendingHitlRequests(world, 'chat-iso-2');

    // Strict chat isolation: each chat sees only its own pending
    expect(replayChat1).toBe(1);
    expect(replayChat2).toBe(1);

    submitWorldHitlResponse({ worldId: 'world-iso', requestId: 'req-iso-1', optionId: 'yes', chatId: 'chat-iso-1' });
    submitWorldHitlResponse({ worldId: 'world-iso', requestId: 'req-iso-2', optionId: 'no', chatId: 'chat-iso-2' });
  });
});

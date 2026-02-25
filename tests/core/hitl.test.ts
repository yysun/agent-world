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
 *
 * Implementation notes:
 * - Uses in-memory EventEmitter world doubles.
 * - No filesystem or network access.
 *
 * Recent changes:
 * - 2026-02-24: Replaced timeout fallback expectations with replay/scoping coverage.
 * - 2026-02-14: Added initial coverage for core HITL option runtime.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHitlStateForTests,
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

  it('rejects mismatched requestId and toolCallId', async () => {
    const world = {
      id: 'world-mismatch',
      currentChatId: 'chat-mismatch',
      eventEmitter: new EventEmitter(),
    } as any;

    await expect(requestWorldOption(world, {
      requestId: 'req-explicit',
      title: 'Approval required',
      message: 'Proceed?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      metadata: {
        tool: 'human_intervention_request',
        toolCallId: 'call-different',
      },
      chatId: 'chat-mismatch',
    })).rejects.toThrow("must match toolCallId");
  });
});

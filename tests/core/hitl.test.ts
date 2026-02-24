/**
 * HITL Option Runtime Tests
 *
 * Purpose:
 * - Validate generic world HITL option request/response behavior.
 *
 * Features tested:
 * - Emits `hitl-option-request` system event with options payload
 * - Resolves pending request on submitted user response
 * - Falls back to deterministic default option on timeout
 *
 * Implementation notes:
 * - Uses in-memory EventEmitter world doubles.
 * - No filesystem or network access.
 *
 * Recent changes:
 * - 2026-02-14: Added initial coverage for core HITL option runtime.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearHitlStateForTests,
  requestWorldOption,
  submitWorldHitlResponse,
  submitWorldOptionResponse,
} from '../../core/hitl.js';

describe('core/hitl', () => {
  beforeEach(() => {
    clearHitlStateForTests();
    vi.useRealTimers();
  });

  it('emits a HITL system event and resolves with submitted user option', async () => {
    const worldEventEmitter = new EventEmitter();
    const world = {
      id: 'world-1',
      currentChatId: 'chat-1',
      eventEmitter: worldEventEmitter,
    } as any;

    let capturedRequestId = '';
    worldEventEmitter.on('system', (event: any) => {
      capturedRequestId = String(event?.content?.requestId || '');
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

  it('resolves with default option when request times out', async () => {
    vi.useFakeTimers();

    const world = {
      id: 'world-1',
      currentChatId: 'chat-1',
      eventEmitter: new EventEmitter(),
    } as any;

    const pending = requestWorldOption(world, {
      title: 'Approval required',
      message: 'Run scripts?',
      options: [
        { id: 'yes_once', label: 'Yes once' },
        { id: 'no', label: 'No' },
      ],
      defaultOptionId: 'no',
      timeoutMs: 50,
    });

    await vi.advanceTimersByTimeAsync(60);
    const resolution = await pending;

    expect(resolution.optionId).toBe('no');
    expect(resolution.source).toBe('timeout');
  });

  it('rejects mismatched chat scope in generic response submission', async () => {
    const worldEventEmitter = new EventEmitter();
    const world = {
      id: 'world-3',
      currentChatId: 'chat-3',
      eventEmitter: worldEventEmitter,
    } as any;
    let capturedRequestId = '';
    worldEventEmitter.on('system', (event: any) => {
      capturedRequestId = String(event?.content?.requestId || '');
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
});

/**
 * Core HITL Schema Tests
 *
 * Purpose:
 * - Validate the structured `ask_user_input` runtime contract end to end.
 *
 * Key Features:
 * - Confirms runtime prompt events expose structured `questions[]` metadata.
 * - Confirms structured answers resolve pending HITL requests.
 * - Confirms persisted `ask_user_input` tool calls replay into pending prompts.
 *
 * Notes on Implementation:
 * - Uses an in-memory EventEmitter world double only.
 * - Keeps coverage focused on the schema migration path.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearHitlStateForTests,
  listPendingHitlPromptEventsFromMessages,
  requestWorldInput,
  submitWorldHitlResponse,
} from '../../core/hitl.js';

describe('core/hitl schema', () => {
  beforeEach(() => {
    clearHitlStateForTests();
  });

  it('emits structured prompt metadata and resolves from structured answers', async () => {
    const worldEventEmitter = new EventEmitter();
    const world = {
      id: 'world-structured',
      mainAgent: 'agent-a',
      eventEmitter: worldEventEmitter,
    } as any;

    const seenPrompts: any[] = [];
    worldEventEmitter.on('world', (event: any) => {
      seenPrompts.push(event?.toolExecution?.metadata?.hitlPrompt);
    });

    const pending = requestWorldInput(world, {
      requestId: 'req-structured',
      type: 'single-select',
      questions: [{
        id: 'question-1',
        header: 'Approval required',
        question: 'Approve the request?',
        options: [
          { id: 'approve', label: 'Approve' },
          { id: 'decline', label: 'Decline' },
        ],
      }],
      chatId: 'chat-1',
      metadata: { source: 'test' },
    });

    await Promise.resolve();
    expect(seenPrompts).toHaveLength(1);
    expect(seenPrompts[0]).toMatchObject({
      requestId: 'req-structured',
      type: 'single-select',
      questions: [{
        id: 'question-1',
        header: 'Approval required',
        question: 'Approve the request?',
      }],
      chatId: 'chat-1',
    });

    expect(submitWorldHitlResponse({
      worldId: 'world-structured',
      requestId: 'req-structured',
      answers: [{ questionId: 'question-1', optionIds: ['approve'] }],
      chatId: 'chat-1',
    })).toEqual({ accepted: true, metadata: { source: 'test' } });

    await expect(pending).resolves.toMatchObject({
      requestId: 'req-structured',
      chatId: 'chat-1',
      answers: [{ questionId: 'question-1', optionIds: ['approve'] }],
      optionId: 'approve',
      skipped: false,
      source: 'user',
    });
  });

  it('reconstructs unresolved ask_user_input prompts from persisted messages', () => {
    const prompts = listPendingHitlPromptEventsFromMessages([
      {
        role: 'assistant',
        chatId: 'chat-2',
        sender: 'agent-a',
        tool_calls: [{
          id: 'req-replay',
          type: 'function',
          function: {
            name: 'ask_user_input',
            arguments: JSON.stringify({
              type: 'multiple-select',
              allowSkip: true,
              questions: [{
                id: 'question-1',
                header: 'Pick outputs',
                question: 'Choose every format to generate.',
                options: [
                  { id: 'pdf', label: 'PDF' },
                  { id: 'html', label: 'HTML' },
                ],
              }],
            }),
          },
        }],
      } as any,
    ], 'chat-2');

    expect(prompts).toEqual([{
      chatId: 'chat-2',
      prompt: {
        requestId: 'req-replay',
        type: 'multiple-select',
        allowSkip: true,
        questions: [{
          id: 'question-1',
          header: 'Pick outputs',
          question: 'Choose every format to generate.',
          options: [
            { id: 'pdf', label: 'PDF', description: undefined },
            { id: 'html', label: 'HTML', description: undefined },
          ],
        }],
        metadata: null,
        agentName: 'agent-a',
        toolName: 'ask_user_input',
        toolCallId: 'req-replay',
      },
    }]);
  });
});
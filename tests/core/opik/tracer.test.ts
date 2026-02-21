import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { OpikTracer } from '../../../packages/opik/src/tracer.js';

// Opik integration: tracer lifecycle/token usage behavior tests.
function createMockClient() {
  const spans: any[] = [];
  const trace = {
    span: (input: any) => {
      const state: any = {
        input,
        updates: [],
        ended: false,
        update(updatePayload: any) {
          state.updates.push(updatePayload);
        },
        end() {
          state.ended = true;
        },
      };
      spans.push(state);
      return state;
    },
    logFeedbackScore: () => undefined,
  };

  return {
    spans,
    client: {
      trace: () => trace,
      flush: async () => undefined,
    },
  };
}

describe('opik tracer', () => {
  it('emits message lifecycle span on response-start and ends it on idle', () => {
    const { client, spans } = createMockClient();
    const tracer = new OpikTracer({ client });

    const world = { eventEmitter: new EventEmitter() };
    tracer.attachToWorld(world as any);

    world.eventEmitter.emit('world', {
      type: 'response-start',
      activityId: 42,
      source: 'a1',
      pendingOperations: 1,
      timestamp: new Date().toISOString(),
    });

    world.eventEmitter.emit('world', {
      type: 'idle',
      activityId: 42,
      source: 'a1',
      pendingOperations: 0,
      timestamp: new Date().toISOString(),
    });

    const lifecycleSpan = spans.find((span) => span.input?.name === 'message_lifecycle');
    expect(lifecycleSpan).toBeDefined();
    expect(lifecycleSpan.ended).toBe(true);
    expect(lifecycleSpan.updates.length).toBeGreaterThan(0);
    expect(lifecycleSpan.updates[0]?.output?.type).toBe('idle');
  });

  it('captures token usage in llm end span update', () => {
    const { client, spans } = createMockClient();
    const tracer = new OpikTracer({ client });

    const world = { eventEmitter: new EventEmitter() };
    tracer.attachToWorld(world as any);

    world.eventEmitter.emit('sse', { type: 'start', messageId: 'm1', agentName: 'a1' });
    world.eventEmitter.emit('sse', { type: 'chunk', messageId: 'm1', content: 'hello' });
    world.eventEmitter.emit('sse', {
      type: 'end',
      messageId: 'm1',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    const llmSpan = spans.find((span) => span.input?.name === 'llm_generation');
    expect(llmSpan).toBeDefined();
    expect(llmSpan.ended).toBe(true);
    expect(llmSpan.updates[0]?.usage?.total_tokens).toBe(15);
  });
});

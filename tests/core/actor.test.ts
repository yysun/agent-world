/**
 * Unit Tests for Actor System
 * 
 * Tests the actor system implementation including:
 * - Sequential message processing per actor
 * - Message ordering guarantees
 * - Actor stop behavior and mailbox clearing
 * - Async message handling
 */

import { describe, it, expect } from 'vitest';
import { ActorSystem } from '../../src/core/actor.js';

describe('ActorSystem', () => {
  it('processes messages in order per actor', async () => {
    const sys = new ActorSystem();
    const results: number[] = [];

    const ref = sys.spawn(async (_ctx, msg: any) => {
      // simulate async work
      await new Promise((r) => setTimeout(r, 10));
      results.push(msg);
    });

    ref.tell(1);
    ref.tell(2);
    ref.tell(3);

    await new Promise((r) => setTimeout(r, 100));
    expect(results).toEqual([1, 2, 3]);

    sys.stop(ref);
  });

  it('stops and clears mailbox', async () => {
    const sys = new ActorSystem();
    const results: number[] = [];

    const ref = sys.spawn(async (_ctx, msg: any) => { results.push(msg); });
    ref.tell(1);
    ref.tell(2);
    
    // Wait for messages to be processed
    await new Promise((r) => setTimeout(r, 50));
    expect(results).toEqual([1, 2]);
    
    // Now stop and verify next message is ignored
    sys.stop(ref);
    ref.tell(3); // should be ignored

    await new Promise((r) => setTimeout(r, 50));
    expect(results).toEqual([1, 2]); // Still only 1 and 2
  });
});

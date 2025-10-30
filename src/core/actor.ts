/**
 * Actor System - Lightweight message-passing concurrency model
 * 
 * Provides a tiny actor system with sequential message processing per actor.
 * Actors process messages one at a time in the order they are received.
 * 
 * Features:
 * - Per-actor sequential message processing
 * - Asynchronous message handling
 * - Actor lifecycle management (spawn, stop)
 * - Message mailbox with scheduling
 * 
 * Implementation notes:
 * - Uses setImmediate to schedule message processing
 * - Prevents deep recursion by deferring to next tick
 * - Stops on unhandled errors (supervision can be added externally)
 */

import { setImmediate } from 'timers';

export type ActorMessage = any;
export type ActorBehavior = (ctx: ActorContext, msg: ActorMessage) => void | Promise<void>;

export interface ActorRef {
  id: string;
  tell(msg: ActorMessage): void;
  stop(): void;
}

export class ActorContext {
  constructor(public self: ActorRef) {}
}

class Actor implements ActorRef {
  public id: string;
  private mailbox: ActorMessage[] = [];
  private processing = false;
  private alive = true;

  constructor(id: string, private behavior: ActorBehavior) {
    this.id = id;
  }

  tell(msg: ActorMessage) {
    if (!this.alive) return;
    this.mailbox.push(msg);
    this.schedule();
  }

  stop() {
    this.alive = false;
    this.mailbox = [];
  }

  private schedule() {
    if (this.processing || !this.alive) return;
    // schedule to next tick to avoid deep recursion
    setImmediate(() => this.processLoop());
  }

  private async processLoop() {
    if (this.processing || !this.alive) return;
    this.processing = true;
    const ctx = new ActorContext(this);
    try {
      while (this.alive && this.mailbox.length) {
        const msg = this.mailbox.shift()!;
        await Promise.resolve(this.behavior(ctx, msg));
      }
    } catch (err) {
      // default: stop actor on unhandled error
      // consumers can implement supervision outside this tiny runtime
      this.alive = false;
      this.mailbox = [];
      // rethrow asynchronously
      setImmediate(() => { throw err; });
    } finally {
      this.processing = false;
    }
  }
}

export class ActorSystem {
  private nextId = 0;
  private actors = new Map<string, Actor>();

  spawn(behavior: ActorBehavior, prefix = 'actor') {
    const id = `${prefix}-${++this.nextId}`;
    const actor = new Actor(id, behavior);
    this.actors.set(id, actor);
    return actor as ActorRef;
  }

  get(id: string) {
    return this.actors.get(id) as ActorRef | undefined;
  }

  stop(ref: ActorRef) {
    const a = this.actors.get(ref.id);
    if (!a) return;
    a.stop();
    this.actors.delete(ref.id);
  }

  stopAll() {
    this.actors.forEach(a => a.stop());
    this.actors.clear();
  }
}

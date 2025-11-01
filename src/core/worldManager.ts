/**
 * World Manager - Manages lazy loading and reference counting of worlds
 * 
 * Provides subscription-based access to world event emitters with:
 * - Lazy loading: worlds are loaded only when first subscriber connects
 * - Reference counting: worlds stay loaded while subscribers exist
 * - Auto-cleanup: worlds are unloaded when last subscriber disconnects
 * - Direct emitter access: subscribers get the world's EventEmitter directly
 * 
 * Features:
 * - One actor per world ID for concurrent world management
 * - Pluggable loader function for world creation
 * - Automatic lifecycle management (load/unload)
 * - Simple subscribe/unsubscribe API
 * 
 * Implementation notes:
 * - Uses the actor system for sequential message processing per world
 * - Returns EventEmitter directly to clients for zero-copy event handling
 * - Calls close() on world emitters if available during cleanup
 */

import { EventEmitter } from 'events';
import { ActorSystem, ActorMessage, ActorRef } from './actor.js';

export type WorldLoader = (id: string) => Promise<EventEmitter> | EventEmitter;

type InternalMsg =
  | { type: 'subscribe'; subscriberId: string; resolve: (res: { emitter: EventEmitter; unsubscribe: () => void }) => void }
  | { type: 'unsubscribe'; subscriberId: string }
  | { type: 'getState'; resolve: (state: any) => void };

interface WorldState {
  id: string;
  emitter?: EventEmitter;
  refCount: number;
  loader: WorldLoader;
}

export class WorldManager {
  private actors = new Map<string, ActorRef>();
  private system = new ActorSystem();

  constructor(private loaderFactory: (id: string) => WorldLoader) {}

  async subscribe(worldId: string): Promise<{ emitter: EventEmitter; unsubscribe: () => void }> {
    let actor = this.actors.get(worldId);
    if (!actor) {
      // spawn actor for this world id
      const loader = this.loaderFactory(worldId);
      const state: WorldState = { id: worldId, loader, refCount: 0 };

      const behavior = async (ctx: any, msg: InternalMsg) => {
        if (msg.type === 'subscribe') {
          state.refCount += 1;
          if (!state.emitter) {
            // lazy load
            const loaded = await Promise.resolve(state.loader(worldId));
            state.emitter = loaded;
          }

          // create unsubscribe function that tells the actor to decrement refcount
          const unsubscribe = () => ctx.self.tell({ type: 'unsubscribe', subscriberId: msg.subscriberId });

          msg.resolve({ emitter: state.emitter!, unsubscribe });
          return;
        }

        if (msg.type === 'unsubscribe') {
          state.refCount = Math.max(0, state.refCount - 1);
          if (state.refCount === 0) {
            // unload world if it exposes a close/destroy method, else remove reference
            if (state.emitter && typeof (state.emitter as any).close === 'function') {
              try { (state.emitter as any).close(); } catch (_) {}
            }
            state.emitter = undefined;
            // remove actor from registry
            this.system.stop(ctx.self);
            this.actors.delete(worldId);
          }
          return;
        }

        if (msg.type === 'getState') {
          msg.resolve({ refCount: state.refCount, loaded: !!state.emitter });
          return;
        }
      };

      actor = this.system.spawn(behavior, `world-${worldId}`);
      this.actors.set(worldId, actor);
    }

    return new Promise((resolve) => {
      actor!.tell({ type: 'subscribe', subscriberId: cryptoRandomId(), resolve } as InternalMsg);
    });
  }

  async getInfo(worldId: string) {
    const actor = this.actors.get(worldId);
    if (!actor) return { loaded: false, refCount: 0 };
    return new Promise((resolve) => {
      actor.tell({ type: 'getState', resolve } as InternalMsg);
    });
  }
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 9);
}

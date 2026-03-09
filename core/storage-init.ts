/**
 * Storage Initialization Module
 *
 * Purpose: Centralizes the StorageAPI singleton and lazy initialization, plus
 * world/agent identifier resolution utilities.
 *
 * Key features:
 * - Singleton storageWrappers with lazy initialization via ensureInitialization()
 * - Dedup guard prevents multiple simultaneous initialization attempts
 * - World identifier resolution (accepts ID or name, handles rename drift)
 * - Agent identifier resolution (accepts ID or name within a world)
 * - overrideStorageForTests() for in-memory test injection
 *
 * Notes:
 * - Uses exported `let storageWrappers` so all ESM importers share the live
 *   binding — after initializeModules() runs once, every importer sees the
 *   non-null value without additional round-trips.
 * - All resolution helpers are exported so queue-manager and message-edit-manager
 *   can use them without importing from managers.ts (which would form a static cycle).
 *
 * Recent Changes:
 * - 2026-03-09: Extracted from managers.ts as part of god-module decomposition.
 */
import { createCategoryLogger, initializeLogger } from './logger.js';
import { type StorageAPI, createStorageWithWrappers } from './storage/storage-factory.js';
import * as utils from './utils.js';
import type { World, Agent } from './types.js';

const logger = createCategoryLogger('core.storage-init');

export let storageWrappers: StorageAPI | null = null;
let moduleInitialization: Promise<void> | null = null;

async function initializeModules(): Promise<void> {
  if (storageWrappers) {
    return; // Already initialized
  }
  try {
    initializeLogger();
    storageWrappers = await createStorageWithWrappers();
    // Startup recovery: reset any 'sending' queue rows interrupted by an app crash/restart
    const recovered = await storageWrappers.recoverSendingMessages?.();
    if (recovered) {
      logger.info('Queue startup recovery: reset interrupted messages to queued', { count: recovered });
    }
  } catch (error) {
    // Log error but don't throw - allows tests to proceed with mocked storage
    logger.error('Failed to initialize storage', { error: error instanceof Error ? error.message : error });
    throw error;
  }
}

export function ensureInitialization(): Promise<void> {
  if (!moduleInitialization) {
    moduleInitialization = initializeModules();
  }
  return moduleInitialization;
}

/**
 * Resolve a world identifier to the persisted world ID.
 * Accepts either world ID or world name and supports historical rename drift.
 */
async function resolveWorldIdentifier(worldIdOrName: string): Promise<string | null> {
  const normalizedInput = utils.toKebabCase(worldIdOrName);
  if (!normalizedInput) return null;

  // Fast path: direct normalized ID lookup
  const directWorld = await storageWrappers!.loadWorld(normalizedInput);
  if (directWorld?.id) {
    return directWorld.id;
  }

  // Fallback: scan worlds and match by normalized ID or normalized name
  const worlds = await storageWrappers!.listWorlds();
  const matched = worlds.find((world: World) => {
    const storedId = String(world.id || '');
    const storedName = String(world.name || '');

    return (
      storedId === worldIdOrName ||
      storedName === worldIdOrName ||
      utils.toKebabCase(storedId) === normalizedInput ||
      utils.toKebabCase(storedName) === normalizedInput
    );
  });

  return matched?.id || null;
}

export async function getResolvedWorldId(worldIdOrName: string): Promise<string> {
  const resolved = await resolveWorldIdentifier(worldIdOrName);
  return resolved || utils.toKebabCase(worldIdOrName);
}

/**
 * Resolve an agent identifier to the persisted agent ID within a world.
 * Accepts either agent ID or agent name and supports historical rename drift.
 */
async function resolveAgentIdentifier(worldIdOrName: string, agentIdOrName: string): Promise<string | null> {
  const resolvedWorldId = await getResolvedWorldId(worldIdOrName);
  const normalizedInput = utils.toKebabCase(agentIdOrName);
  if (!normalizedInput) return null;

  // Fast path: direct normalized ID lookup
  const directAgent = await storageWrappers!.loadAgent(resolvedWorldId, normalizedInput);
  if (directAgent?.id) {
    return directAgent.id;
  }

  // Fallback: scan agents and match by normalized ID or normalized name
  const agents = await storageWrappers!.listAgents(resolvedWorldId);
  const matched = agents.find((agent: Agent) => {
    const storedId = String(agent.id || '');
    const storedName = String(agent.name || '');

    return (
      storedId === agentIdOrName ||
      storedName === agentIdOrName ||
      utils.toKebabCase(storedId) === normalizedInput ||
      utils.toKebabCase(storedName) === normalizedInput
    );
  });

  return matched?.id || null;
}

export async function getResolvedAgentId(worldIdOrName: string, agentIdOrName: string): Promise<string> {
  const resolved = await resolveAgentIdentifier(worldIdOrName, agentIdOrName);
  return resolved || utils.toKebabCase(agentIdOrName);
}

/**
 * Override storage for test injection.
 * Replaces the singleton and resets the initialization guard so subsequent
 * ensureInitialization() calls resolve immediately with the injected storage.
 */
export function overrideStorageForTests(wrappers: StorageAPI | null): void {
  storageWrappers = wrappers;
  moduleInitialization = wrappers ? Promise.resolve() : null;
}

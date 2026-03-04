/**
 * Core World Runtime Registry
 *
 * Purpose:
 * - Provide storage-aware runtime tracking for active world runtimes.
 * - Support idempotent runtime start with reference-counted consumers.
 * - Offer deterministic stop/release behavior with optional refresh support.
 *
 * Key Features:
 * - Composite runtime key: storageType + storagePath + worldId.
 * - In-flight start deduplication per runtime key.
 * - Consumer ref counting with last-release shutdown.
 * - Runtime diagnostics snapshots for inspection.
 *
 * Implementation Notes:
 * - The registry is runtime-process local and does not coordinate across processes.
 * - Storage context defaults are sourced from environment when not provided.
 *
 * Recent Changes:
 * - 2026-03-03: Initial runtime registry implementation for canonical world runtime ownership.
 */

import * as path from 'path';
import { createCategoryLogger } from './logger.js';
import { getDefaultRootPath } from './storage/storage-factory.js';
import { toKebabCase } from './utils.js';

const logger = createCategoryLogger('world.registry');

type StorageType = 'file' | 'sqlite' | 'memory';

export interface WorldRuntimeStorageContext {
  storageType: StorageType;
  storagePath: string;
}

export interface ManagedWorldRuntime<TWorld> {
  world: TWorld;
  stop: () => Promise<void>;
  refresh?: () => Promise<void>;
}

export interface StartWorldRuntimeParams<TWorld> {
  worldId: string;
  consumerId: string;
  storageType?: StorageType;
  storagePath?: string;
  createRuntime: () => Promise<ManagedWorldRuntime<TWorld>>;
}

export interface StartedWorldRuntime<TWorld> {
  runtimeKey: string;
  worldId: string;
  storageType: StorageType;
  storagePath: string;
  world: TWorld;
  refCount: number;
  release: () => Promise<void>;
  refresh: () => Promise<void>;
}

export interface WorldRuntimeSnapshot {
  runtimeKey: string;
  worldId: string;
  storageType: StorageType;
  storagePath: string;
  startedAt: string;
  refCount: number;
  consumers: string[];
}

type RuntimeRecord<TWorld> = {
  runtimeKey: string;
  worldId: string;
  storageType: StorageType;
  storagePath: string;
  startedAt: Date;
  consumers: Set<string>;
  runtime: ManagedWorldRuntime<TWorld>;
};

const runtimes = new Map<string, RuntimeRecord<unknown>>();
const pendingStarts = new Map<string, Promise<RuntimeRecord<unknown>>>();

function resolveStorageType(storageType?: StorageType): StorageType {
  if (storageType) return storageType;
  const envType = String(process.env.AGENT_WORLD_STORAGE_TYPE || '').trim().toLowerCase();
  if (envType === 'file' || envType === 'memory' || envType === 'sqlite') {
    return envType as StorageType;
  }
  return 'sqlite';
}

function normalizeStoragePath(inputPath?: string): string {
  const raw = String(inputPath || getDefaultRootPath() || '').trim() || './agent-world';
  if (!raw) return './agent-world';
  if (!path.isAbsolute(raw)) {
    return path.resolve(process.cwd(), raw);
  }
  return raw;
}

export function createWorldRuntimeKey(worldId: string, context: WorldRuntimeStorageContext): string {
  const normalizedWorldId = toKebabCase(String(worldId || '').trim());
  const normalizedPath = normalizeStoragePath(context.storagePath);
  return `${context.storageType}:${normalizedPath}:${normalizedWorldId}`;
}

function getRecordByKey<TWorld>(runtimeKey: string): RuntimeRecord<TWorld> | null {
  const record = runtimes.get(runtimeKey);
  if (!record) return null;
  return record as RuntimeRecord<TWorld>;
}

function resolveRuntimeKeyFromParams(params: {
  runtimeKey?: string;
  worldId?: string;
  storageType?: StorageType;
  storagePath?: string;
}): string {
  const runtimeKey = String(params.runtimeKey || '').trim();
  if (runtimeKey) {
    return runtimeKey;
  }

  const worldId = toKebabCase(String(params.worldId || '').trim());
  if (!worldId) {
    return '';
  }

  const storageType = resolveStorageType(params.storageType);
  const storagePath = normalizeStoragePath(params.storagePath);
  return createWorldRuntimeKey(worldId, { storageType, storagePath });
}

function toStartedRuntime<TWorld>(record: RuntimeRecord<TWorld>, consumerId: string): StartedWorldRuntime<TWorld> {
  return {
    runtimeKey: record.runtimeKey,
    worldId: record.worldId,
    storageType: record.storageType,
    storagePath: record.storagePath,
    world: record.runtime.world,
    refCount: record.consumers.size,
    release: () => releaseWorldRuntime({ runtimeKey: record.runtimeKey, consumerId }),
    refresh: async () => {
      const current = getRecordByKey<TWorld>(record.runtimeKey);
      if (!current) {
        throw new Error(`Runtime not found: ${record.runtimeKey}`);
      }
      if (typeof current.runtime.refresh === 'function') {
        await current.runtime.refresh();
      }
    }
  };
}

export async function startWorldRuntime<TWorld>(params: StartWorldRuntimeParams<TWorld>): Promise<StartedWorldRuntime<TWorld>> {
  const worldId = toKebabCase(String(params.worldId || '').trim());
  if (!worldId) {
    throw new Error('World ID is required to start world runtime.');
  }
  const consumerId = String(params.consumerId || '').trim();
  if (!consumerId) {
    throw new Error('Consumer ID is required to start world runtime.');
  }

  const storageType = resolveStorageType(params.storageType);
  const storagePath = normalizeStoragePath(params.storagePath);
  const runtimeKey = createWorldRuntimeKey(worldId, { storageType, storagePath });

  const existing = getRecordByKey<TWorld>(runtimeKey);
  if (existing) {
    existing.consumers.add(consumerId);
    return toStartedRuntime(existing, consumerId);
  }

  const pending = pendingStarts.get(runtimeKey) as Promise<RuntimeRecord<TWorld>> | undefined;
  if (pending) {
    const pendingRecord = await pending;
    pendingRecord.consumers.add(consumerId);
    return toStartedRuntime(pendingRecord, consumerId);
  }

  const startPromise: Promise<RuntimeRecord<TWorld>> = (async () => {
    const runtime = await params.createRuntime();
    const record: RuntimeRecord<TWorld> = {
      runtimeKey,
      worldId,
      storageType,
      storagePath,
      startedAt: new Date(),
      consumers: new Set<string>(),
      runtime
    };
    runtimes.set(runtimeKey, record as RuntimeRecord<unknown>);
    logger.debug('World runtime started', {
      runtimeKey,
      worldId,
      storageType,
      storagePath
    });
    return record;
  })();

  pendingStarts.set(runtimeKey, startPromise as Promise<RuntimeRecord<unknown>>);

  try {
    const created = await startPromise;
    created.consumers.add(consumerId);
    return toStartedRuntime(created, consumerId);
  } finally {
    pendingStarts.delete(runtimeKey);
  }
}

export async function releaseWorldRuntime(params: {
  runtimeKey?: string;
  worldId?: string;
  storageType?: StorageType;
  storagePath?: string;
  consumerId: string;
}): Promise<void> {
  const runtimeKey = resolveRuntimeKeyFromParams(params);
  const consumerId = String(params.consumerId || '').trim();
  if (!runtimeKey || !consumerId) {
    return;
  }

  const record = getRecordByKey(runtimeKey);
  if (!record) return;

  record.consumers.delete(consumerId);
  if (record.consumers.size > 0) {
    return;
  }

  runtimes.delete(runtimeKey);
  try {
    await record.runtime.stop();
  } finally {
    logger.debug('World runtime stopped', {
      runtimeKey,
      worldId: record.worldId,
      storageType: record.storageType,
      storagePath: record.storagePath
    });
  }
}

export function getWorldRuntime<TWorld>(params: {
  worldId: string;
  storageType?: StorageType;
  storagePath?: string;
}): StartedWorldRuntime<TWorld> | null {
  const runtimeKey = resolveRuntimeKeyFromParams(params);
  if (!runtimeKey) return null;
  return getWorldRuntimeByKey<TWorld>(runtimeKey);
}

export function getWorldRuntimeByKey<TWorld>(runtimeKey: string): StartedWorldRuntime<TWorld> | null {
  const record = getRecordByKey<TWorld>(String(runtimeKey || '').trim());
  if (!record) return null;
  return {
    runtimeKey: record.runtimeKey,
    worldId: record.worldId,
    storageType: record.storageType,
    storagePath: record.storagePath,
    world: record.runtime.world,
    refCount: record.consumers.size,
    release: async () => {
      throw new Error('Use the release() handle returned from startWorldRuntime().');
    },
    refresh: async () => {
      if (typeof record.runtime.refresh === 'function') {
        await record.runtime.refresh();
      }
    }
  };
}

export function listWorldRuntimeSnapshots(): WorldRuntimeSnapshot[] {
  return Array.from(runtimes.values()).map((record) => ({
    runtimeKey: record.runtimeKey,
    worldId: record.worldId,
    storageType: record.storageType,
    storagePath: record.storagePath,
    startedAt: record.startedAt.toISOString(),
    refCount: record.consumers.size,
    consumers: Array.from(record.consumers.values()).sort()
  }));
}

export async function stopWorldRuntime(runtimeKey: string): Promise<void> {
  const record = getRecordByKey(String(runtimeKey || '').trim());
  if (!record) return;
  runtimes.delete(record.runtimeKey);
  record.consumers.clear();
  await record.runtime.stop();
}

export async function stopAllWorldRuntimes(): Promise<void> {
  const keys = Array.from(runtimes.keys());
  for (const key of keys) {
    await stopWorldRuntime(key);
  }
}

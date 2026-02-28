/**
 * Electron Main Module Interop Helpers
 * Purpose:
 * - Resolve runtime module exports safely when ESM/CJS or build-shape drift occurs.
 *
 * Key Features:
 * - Supports named export lookup for realtime runtime factory.
 * - Supports nested default-object export lookup.
 * - Supports default-function export fallback.
 *
 * Notes on Implementation:
 * - Pure helper functions with no side effects.
 * - Keeps startup compatibility logic out of main bootstrap flow.
 *
 * Summary of Recent Changes:
 * - 2026-02-28: Added realtime runtime factory export resolver to avoid startup hard-failure when compiled module export shape differs.
 */

export type RealtimeEventsRuntimeFactory = (dependencies: unknown) => unknown;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Resolve createRealtimeEventsRuntime from either:
 * - module.createRealtimeEventsRuntime (ESM named export)
 * - module.default.createRealtimeEventsRuntime (CJS interop object)
 * - module.default (default-exported function)
 */
export function resolveRealtimeEventsRuntimeFactory(moduleValue: unknown): RealtimeEventsRuntimeFactory | null {
  const moduleRecord = asRecord(moduleValue);
  if (!moduleRecord) {
    return null;
  }

  const namedFactory = moduleRecord.createRealtimeEventsRuntime;
  if (typeof namedFactory === 'function') {
    return namedFactory as RealtimeEventsRuntimeFactory;
  }

  const defaultExport = moduleRecord.default;
  const defaultRecord = asRecord(defaultExport);
  const nestedFactory = defaultRecord?.createRealtimeEventsRuntime;
  if (typeof nestedFactory === 'function') {
    return nestedFactory as RealtimeEventsRuntimeFactory;
  }

  if (typeof defaultExport === 'function') {
    return defaultExport as RealtimeEventsRuntimeFactory;
  }

  return null;
}


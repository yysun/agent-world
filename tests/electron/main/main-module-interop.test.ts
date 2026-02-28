/**
 * Electron Main Module Interop Tests
 *
 * Purpose:
 * - Validate startup export-shape resolution for realtime runtime module loading.
 *
 * Key Features:
 * - Covers ESM named export shape.
 * - Covers CJS-style default object shape.
 * - Covers default-function fallback and invalid module values.
 *
 * Notes on Implementation:
 * - Uses pure in-memory fixtures only.
 * - No filesystem, network, Electron runtime, or IPC dependencies.
 *
 * Recent Changes:
 * - 2026-02-28: Added regression tests for realtime runtime factory export interop resolution.
 */

import { describe, expect, it } from 'vitest';
import { resolveRealtimeEventsRuntimeFactory } from '../../../electron/main-process/module-interop';

describe('resolveRealtimeEventsRuntimeFactory', () => {
  it('resolves ESM named export shape', () => {
    const factory = () => ({ ok: true });
    const resolved = resolveRealtimeEventsRuntimeFactory({
      createRealtimeEventsRuntime: factory
    });

    expect(resolved).toBe(factory);
  });

  it('resolves nested default object export shape', () => {
    const factory = () => ({ ok: true });
    const resolved = resolveRealtimeEventsRuntimeFactory({
      default: {
        createRealtimeEventsRuntime: factory
      }
    });

    expect(resolved).toBe(factory);
  });

  it('resolves default function export and returns null for invalid module', () => {
    const factory = () => ({ ok: true });
    const resolved = resolveRealtimeEventsRuntimeFactory({
      default: factory
    });

    expect(resolved).toBe(factory);
    expect(resolveRealtimeEventsRuntimeFactory({})).toBeNull();
  });
});


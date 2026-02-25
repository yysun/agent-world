import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it } from 'vitest';
import { attachOptionalOpikTracer, resolveOpikRuntimeConfig } from '../../../core/optional-tracers/opik-runtime.js';

// Opik integration: runtime gate and optional-attach behavior tests.
function createWorld(variables = '') {
  return {
    id: 'w1',
    variables,
    eventEmitter: new EventEmitter(),
  } as any;
}

describe('opik runtime', () => {
  beforeEach(() => {
    delete process.env.OPIK_ENABLED;
    delete process.env.OPIK_SAFETY_ENABLED;
    delete process.env.OPIK_EVAL_ENABLED;
    delete process.env.OPIK_API_KEY;
    delete process.env.OPIK_WORKSPACE;
    delete process.env.OPIK_PROJECT;
  });

  it('defaults disabled', () => {
    const world = createWorld('');
    const config = resolveOpikRuntimeConfig(world);
    expect(config.enabled).toBe(false);
  });

  it('uses world variables before env', () => {
    process.env.OPIK_ENABLED = 'false';
    const world = createWorld('OPIK_ENABLED=true\nOPIK_SAFETY_ENABLED=true\nOPIK_API_KEY=abc\nOPIK_WORKSPACE=ws');
    const config = resolveOpikRuntimeConfig(world);

    expect(config.enabled).toBe(true);
    expect(config.safetyEnabled).toBe(true);
    expect(config.apiKey).toBe('abc');
    expect(config.workspace).toBe('ws');
  });

  it('returns missing_config when enabled without required vars', async () => {
    const world = createWorld('OPIK_ENABLED=true');
    const status = await attachOptionalOpikTracer(world, { source: 'cli' });
    expect(status).toBe('missing_config');
  });

  it('attaches when enabled and module is available', async () => {
    const world = createWorld('OPIK_ENABLED=true\nOPIK_API_KEY=abc\nOPIK_WORKSPACE=ws');
    let attached = false;

    const status = await attachOptionalOpikTracer(world, {
      source: 'server',
      moduleLoader: async () => ({
        createOpikTracer: async () => ({
          attachToWorld: () => {
            attached = true;
          },
        }),
      }),
    });

    expect(status).toBe('attached');
    expect(attached).toBe(true);
  });

  it('returns missing_dependency when module loader fails', async () => {
    const world = createWorld('OPIK_ENABLED=true\nOPIK_API_KEY=abc\nOPIK_WORKSPACE=ws');

    const status = await attachOptionalOpikTracer(world, {
      source: 'server',
      moduleLoader: async () => {
        throw new Error('missing');
      },
    });

    expect(status).toBe('missing_dependency');
  });

  // Opik integration: matrix test — disabled + installed (module available but gate off).
  it('returns disabled when gate is off even if module is available', async () => {
    const world = createWorld('OPIK_ENABLED=false\nOPIK_API_KEY=abc\nOPIK_WORKSPACE=ws');
    let attached = false;

    const status = await attachOptionalOpikTracer(world, {
      source: 'cli',
      moduleLoader: async () => ({
        createOpikTracer: async () => ({
          attachToWorld: () => {
            attached = true;
          },
        }),
      }),
    });

    expect(status).toBe('disabled');
    expect(attached).toBe(false);
  });

  // Opik integration: matrix test — disabled + missing (module unavailable and gate off).
  it('returns disabled when gate is off even if module is missing', async () => {
    const world = createWorld('');

    const status = await attachOptionalOpikTracer(world, {
      source: 'server',
      moduleLoader: async () => {
        throw new Error('missing');
      },
    });

    expect(status).toBe('disabled');
  });

  // Opik integration: sub-flag tests — safety and eval flags respect master gate.
  describe('sub-flag behavior when OPIK_ENABLED=true', () => {
    it('safetyEnabled defaults false when master gate is on', () => {
      const world = createWorld('OPIK_ENABLED=true');
      const config = resolveOpikRuntimeConfig(world);
      expect(config.enabled).toBe(true);
      expect(config.safetyEnabled).toBe(false);
    });

    it('evalEnabled defaults false when master gate is on', () => {
      const world = createWorld('OPIK_ENABLED=true');
      const config = resolveOpikRuntimeConfig(world);
      expect(config.enabled).toBe(true);
      expect(config.evalEnabled).toBe(false);
    });

    it('safetyEnabled is true only when both master and safety flags are on', () => {
      const world = createWorld('OPIK_ENABLED=true\nOPIK_SAFETY_ENABLED=true');
      const config = resolveOpikRuntimeConfig(world);
      expect(config.safetyEnabled).toBe(true);
    });

    it('evalEnabled is true only when both master and eval flags are on', () => {
      const world = createWorld('OPIK_ENABLED=true\nOPIK_EVAL_ENABLED=true');
      const config = resolveOpikRuntimeConfig(world);
      expect(config.evalEnabled).toBe(true);
    });

    it('sub-flags are forced false when master gate is off', () => {
      const world = createWorld('OPIK_ENABLED=false\nOPIK_SAFETY_ENABLED=true\nOPIK_EVAL_ENABLED=true');
      const config = resolveOpikRuntimeConfig(world);
      expect(config.enabled).toBe(false);
      expect(config.safetyEnabled).toBe(false);
      expect(config.evalEnabled).toBe(false);
    });

    it('enabledOverride bypasses world and env config', () => {
      process.env.OPIK_ENABLED = 'false';
      const world = createWorld('OPIK_ENABLED=false\nOPIK_SAFETY_ENABLED=true');
      const config = resolveOpikRuntimeConfig(world, { enabledOverride: true });
      expect(config.enabled).toBe(true);
      expect(config.safetyEnabled).toBe(true);
    });
  });
});

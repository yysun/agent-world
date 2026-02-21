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
});

import { dirname, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createCategoryLogger } from '../logger.js';
import type { World } from '../types.js';
import { getEnvValueFromText } from '../utils.js';

// Opik integration: centralized optional tracer runtime gate and attach behavior.
const logger = createCategoryLogger('opik.runtime');

const ATTACHED_WORLDS = new WeakSet<World>();

type OptionalTracer = {
  attachToWorld: (world: World) => void;
};

type OpikModule = {
  createOpikTracer?: (config: {
    apiKey: string;
    workspace: string;
    project?: string;
  }) => Promise<OptionalTracer | null>;
};

export type OpikRuntimeConfig = {
  enabled: boolean;
  safetyEnabled: boolean;
  evalEnabled: boolean;
  apiKey?: string;
  workspace?: string;
  project?: string;
  blockOnHighSeverity: boolean;
  redact: boolean;
};

export type AttachOpikResult =
  | 'disabled'
  | 'already_attached'
  | 'missing_dependency'
  | 'missing_config'
  | 'init_failed'
  | 'attached';

export type ResolveOpikConfigOptions = {
  enabledOverride?: boolean;
};

function parseBoolean(value: string | undefined): boolean | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return undefined;
}

function getWorldConfig(world: World, key: string): string | undefined {
  if (!world || typeof world.variables !== 'string') {
    return undefined;
  }
  return getEnvValueFromText(world.variables, key);
}

function resolveBoolean(world: World, key: string, defaultValue: boolean): boolean {
  const worldValue = parseBoolean(getWorldConfig(world, key));
  if (worldValue !== undefined) {
    return worldValue;
  }

  const envValue = parseBoolean(process.env[key]);
  if (envValue !== undefined) {
    return envValue;
  }

  return defaultValue;
}

function resolveString(world: World, key: string): string | undefined {
  const worldValue = getWorldConfig(world, key);
  if (worldValue && worldValue.trim()) {
    return worldValue.trim();
  }

  const envValue = process.env[key];
  if (envValue && envValue.trim()) {
    return envValue.trim();
  }

  return undefined;
}

function getImportCandidates(): string[] {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return [
    '@agent-world/opik',
    pathToFileURL(resolve(currentDir, '../packages/opik/dist/index.js')).href,
    pathToFileURL(resolve(currentDir, '../packages/opik/src/index.ts')).href,
    pathToFileURL(resolve(currentDir, '../../packages/opik/dist/index.js')).href,
    pathToFileURL(resolve(currentDir, '../../packages/opik/src/index.ts')).href,
  ];
}

async function importOpikModule(moduleLoader?: () => Promise<OpikModule>): Promise<OpikModule | null> {
  if (moduleLoader) {
    try {
      return await moduleLoader();
    } catch {
      return null;
    }
  }

  for (const candidate of getImportCandidates()) {
    try {
      const loaded = await import(candidate);
      if (loaded?.createOpikTracer) {
        return loaded as OpikModule;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function resolveOpikRuntimeConfig(world: World, options: ResolveOpikConfigOptions = {}): OpikRuntimeConfig {
  const enabled = options.enabledOverride ?? resolveBoolean(world, 'OPIK_ENABLED', false);

  return {
    enabled,
    safetyEnabled: enabled && resolveBoolean(world, 'OPIK_SAFETY_ENABLED', false),
    evalEnabled: enabled && resolveBoolean(world, 'OPIK_EVAL_ENABLED', false),
    apiKey: resolveString(world, 'OPIK_API_KEY'),
    workspace: resolveString(world, 'OPIK_WORKSPACE'),
    project: resolveString(world, 'OPIK_PROJECT'),
    blockOnHighSeverity: resolveBoolean(world, 'OPIK_SAFETY_BLOCK_ON_HIGH', true),
    redact: resolveBoolean(world, 'OPIK_SAFETY_REDACT', true),
  };
}

export function isOpikSafetyEnabled(world: World, options: ResolveOpikConfigOptions = {}): boolean {
  return resolveOpikRuntimeConfig(world, options).safetyEnabled;
}

export async function attachOptionalOpikTracer(
  world: World,
  options: ResolveOpikConfigOptions & {
    source: 'cli' | 'server';
    moduleLoader?: () => Promise<OpikModule>;
  }
): Promise<AttachOpikResult> {
  const runtimeConfig = resolveOpikRuntimeConfig(world, options);

  if (!runtimeConfig.enabled) {
    return 'disabled';
  }

  if (ATTACHED_WORLDS.has(world)) {
    return 'already_attached';
  }

  if (!runtimeConfig.apiKey || !runtimeConfig.workspace) {
    logger.warn('Opik enabled but required env is missing; skipping tracer attachment', {
      source: options.source,
      hasApiKey: Boolean(runtimeConfig.apiKey),
      hasWorkspace: Boolean(runtimeConfig.workspace),
      requiredVars: ['OPIK_API_KEY', 'OPIK_WORKSPACE'],
    });
    return 'missing_config';
  }

  const opikModule = await importOpikModule(options.moduleLoader);
  if (!opikModule?.createOpikTracer) {
    logger.warn('Opik enabled but optional dependency is unavailable; startup continues without tracing', {
      source: options.source,
    });
    return 'missing_dependency';
  }

  const tracer = await opikModule.createOpikTracer({
    apiKey: runtimeConfig.apiKey,
    workspace: runtimeConfig.workspace,
    project: runtimeConfig.project,
  });

  if (!tracer) {
    logger.warn('Opik module loaded but tracer initialization failed; startup continues without tracing', {
      source: options.source,
    });
    return 'init_failed';
  }

  tracer.attachToWorld(world);
  ATTACHED_WORLDS.add(world);

  logger.info('Opik tracer attached', {
    source: options.source,
    worldId: world.id,
    safetyEnabled: runtimeConfig.safetyEnabled,
    evalEnabled: runtimeConfig.evalEnabled,
  });

  return 'attached';
}

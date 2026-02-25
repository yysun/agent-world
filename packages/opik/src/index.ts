import { OpikClient, type OpikClientConfig } from './client.js';
import { OpikTracer } from './tracer.js';

// Opik integration: package entrypoint for optional runtime tracer creation.
export async function createOpikTracer(config: OpikClientConfig): Promise<OpikTracer | null> {
  const client = await OpikClient.initialize(config);
  if (!client) {
    return null;
  }

  return new OpikTracer({ client });
}

export { OpikTracer };
export type { OpikClientConfig };

// Opik integration: optional Opik SDK client loader/initializer.
export type OpikClientConfig = {
  apiKey: string;
  workspace: string;
  project?: string;
};

export class OpikClient {
  private static instance: any | null = null;

  static async initialize(config: OpikClientConfig): Promise<any | null> {
    if (this.instance) {
      return this.instance;
    }

    try {
      const moduleName = 'opik';
      const mod = await import(moduleName);
      const OpikCtor = (mod as any).Opik;
      if (!OpikCtor) {
        return null;
      }

      this.instance = new OpikCtor({
        apiKey: config.apiKey,
        workspaceName: config.workspace,
        projectName: config.project || 'agent-world-default',
      });

      return this.instance;
    } catch {
      return null;
    }
  }

  static getInstance(): any | null {
    return this.instance;
  }
}

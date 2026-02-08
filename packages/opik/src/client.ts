import { Opik } from 'opik';

/**
 * Singleton client wrapper for Opik
 */
export class OpikClient {
  private static instance: Opik | null = null;
  private static isInitialized = false;

  public static initialize(config?: { apiKey?: string, workspace?: string, project?: string }): Opik {
    if (this.instance) {
      return this.instance;
    }

    try {
      this.instance = new Opik({
        apiKey: config?.apiKey || process.env.OPIK_API_KEY || 'no-api-key',
        workspaceName: config?.workspace || process.env.OPIK_WORKSPACE || 'default',
        projectName: config?.project || process.env.OPIK_PROJECT || 'agent-world-default'
      });
      this.isInitialized = true;
      console.log('Opik client initialized successfully');
    } catch (error) {
      console.warn('Failed to initialize Opik client:', error);
      // We might want to handle this gracefully so the app doesn't crash if Opik is optional
    }

    return this.instance!;
  }

  public static getInstance(): Opik | null {
    if (!this.instance && !this.isInitialized) {
      // Try auto-init from env
      return this.initialize();
    }
    return this.instance;
  }
}

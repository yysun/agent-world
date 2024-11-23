export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  provider: 'openai' | 'anthropic';
  model: string;
  status: 'idle' | 'busy' | 'error';
  lastActive: Date;
}

export interface Tool {
  name: string;
  description: string;
  execute: (...args: any[]) => Promise<any>;
}

export interface WorldConfig {
  maxAgents: number;
  persistPath: string;
  logLevel: string;
}

export type LLMResponse = {
  content: string;
  toolCalls?: {
    name: string;
    arguments: Record<string, any>;
  }[];
}

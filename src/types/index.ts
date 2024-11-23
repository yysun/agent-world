export interface Memory {
  shortTerm: Map<string, any>;
  longTerm: Map<string, any>;
}

export interface AgentConfig {
  id: string;
  name: string;
  model: string;
  provider: 'openai' | 'anthropic';
  apiKey: string;
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

export interface AgentState {
  id: string;
  status: 'idle' | 'busy' | 'error';
  lastActive: Date;
  memory: Memory;
}

export type LLMResponse = {
  content: string;
  toolCalls?: {
    name: string;
    arguments: Record<string, any>;
  }[];
}

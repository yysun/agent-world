export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  provider: 'openai' | 'anthropic';
  model: string;
  status: 'idle' | 'busy' | 'error';
  lastActive: Date;
  memory?: {
    longTerm?: Record<string, ChatMessage>;
  };
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

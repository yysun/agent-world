export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface LLMResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: any;
  }>;
}

export interface Tool {
  name: string;
  description: string;
  execute: (args: any) => Promise<any>;
}

export interface LLMProvider {
  chat(messages: ChatMessage[], onStream?: (chunk: string) => void): Promise<LLMResponse>;
  model: string;
}

export enum AgentType {
  BASE = 'base',
  ARCHITECT = 'architect',
  CODER = 'coder',
  RESEARCHER = 'researcher'
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  type?: AgentType;
  knowledge?: string;
  status?: 'idle' | 'busy' | 'error';
  lastActive?: Date;
  chatHistory?: ChatMessage[];
}

export interface WorldConfig {
  maxAgents: number;
  persistPath: string;
  logLevel: string;
}

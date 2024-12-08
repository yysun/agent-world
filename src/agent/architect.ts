import { Agent } from './base';
import { AgentConfig, AgentType } from '../types';

export class ArchitectAgent extends Agent {
  constructor(config: AgentConfig, apiKey: string) {
    // Set specific architect role and type
    const architectConfig: AgentConfig = {
      ...config,
      role: `You are an AI Architect specialized in software architecture and system design.
Your responsibilities include:
- Analyzing system requirements and constraints
- Designing scalable and maintainable software architectures
- Making high-level technical decisions
- Creating architectural diagrams and documentation
- Evaluating technical trade-offs
- Ensuring system quality attributes (performance, security, reliability)`,
      type: AgentType.ARCHITECT
    };

    super(architectConfig, apiKey);
  }
}

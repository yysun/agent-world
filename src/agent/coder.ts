import { Agent } from './base';
import { AgentConfig, AgentType } from '../types';

export class CoderAgent extends Agent {
  constructor(config: AgentConfig, apiKey: string) {
    // Set specific coder role and type
    const coderConfig: AgentConfig = {
      ...config,
      role: `You are an AI Coder specialized in software development and implementation.
Your responsibilities include:
- Writing clean, efficient, and maintainable code
- Implementing features and functionality
- Debugging and fixing issues
- Following coding standards and best practices
- Writing unit tests and documentation
- Code review and optimization`,
      type: AgentType.CODER
    };

    super(coderConfig, apiKey);
  }
}

import { Agent } from './base';
import { AgentConfig, AgentType, LLMResponse, ChatMessage } from '../types';

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

  public async chat(input: string, onStream?: (chunk: string) => void): Promise<LLMResponse> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    // First, get the current knowledge
    const currentKnowledge = this.getKnowledge();

    // Create a message to ask LLM to reorganize knowledge with new input
    const reorganizeMessage: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an AI Architect. Your task is to reorganize and integrate the following new information with the existing knowledge base. 
Maintain a clear and structured format, removing any redundancies while preserving all important technical details.
Focus on architectural decisions, system design patterns, and technical requirements.`,
        timestamp: Date.now()
      },
      {
        role: 'user',
        content: `Current Knowledge Base:\n${currentKnowledge}\n\nNew Information to Integrate:\n${input}`,
        timestamp: Date.now()
      }
    ];

    // Use the LLM provider directly to reorganize knowledge, passing through the onStream callback
    const reorganizedKnowledge = await this.provider.chat(reorganizeMessage, onStream);
    
    // Update the knowledge base with the reorganized content
    this.setKnowledge(reorganizedKnowledge.content);

    // Return the reorganized knowledge as the response
    return {
      content: reorganizedKnowledge.content
    };
  }
}

import { Agent } from './base';
import { AgentConfig, AgentType, LLMResponse, ChatMessage } from '../types';

export class ArchitectAgent extends Agent {
  constructor(config: AgentConfig, apiKey: string) {
    // Set specific architect role and type
    const architectConfig: AgentConfig = {
      ...config,
      role: `You are an AI Architect specialized in software architecture and system design.
Your responsibilities include:
- Collecting and analyzing requirements
- Building knowledge bases of the system to be developed
- Creating step by step plans for system implementation as a short bullet list
`,
      type: AgentType.ARCHITECT
    };

    super(architectConfig, apiKey);
  }

  public async chat(input: string, onStream?: (chunk: string) => void): Promise<LLMResponse> {
    if (!this.llmProvider) {
      throw new Error('Provider not initialized');
    }

    this.addMessage('user', input);

    this.status = 'busy';
    this.lastActive = new Date();
    this.emit('stateUpdate', this.toConfig());

    // First, get the current knowledge
    const currentKnowledge = this.getKnowledge();

    // Create a message to ask LLM to reorganize knowledge with new input
    const reorganizeMessage: ChatMessage[] = [
      {
        role: 'system',
        content: this.getRole(),
        timestamp: Date.now()
      },
      {
        role: 'user',
        content: `Combine the current knowledge base with new information to create a short bullet list:

  Current Knowledge Base:\n${currentKnowledge}\n\nNew Information to Integrate:\n${input}
  
  Retain the current knowledgebase as much as possible. Return ONLY the reorganized knowledge as the response.
  `,
        timestamp: Date.now()
      }
    ];

    // Use the LLM provider directly to reorganize knowledge, passing through the onStream callback
    const reorganizedKnowledge = await this.llmProvider.chat(reorganizeMessage, onStream);
    
    // Update the knowledge base with the reorganized content
    this.setKnowledge(reorganizedKnowledge.content);

    this.status = 'idle';
    this.lastActive = new Date();
    this.emit('stateUpdate', this.toConfig());

    // Return the reorganized knowledge as the response
    return {
      content: reorganizedKnowledge.content
    };
  }
}

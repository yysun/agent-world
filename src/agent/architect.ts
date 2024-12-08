import { Agent } from './base';
import { AgentConfig, AgentType, LLMResponse, ChatMessage } from '../types';

export class ArchitectAgent extends Agent {
  constructor(config: AgentConfig, apiKey: string) {
    // Set specific architect role and type
    const architectConfig: AgentConfig = {
      ...config,
      role: `You are an AI Architect specialized in software design. Your responsibilities include:
- Organize features of the system as a short bullet list
- Focus on only functional features, and UI/UX featues, not technical details
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
        content: `Combine and reorganize the current features with new requirements:  
- Retain the current features as much as possible unless it is asked to remove.
- Create a implementation plan under each feature as a bullet list.
- Return ONLY the features list as the response. No explanations needed.
   
Current features:\n${currentKnowledge}\n\nNew requirements:\n${input}
  `,
        timestamp: Date.now()
      }
    ];

    // Use the LLM provider directly to reorganize knowledge, passing through the onStream callback
    const reorganizedKnowledge = await this.llmProvider.chat(reorganizeMessage, onStream);
    
    // Update the knowledge base with the reorganized content
    this.setKnowledge(reorganizedKnowledge.content);

    this.addMessage('assistant', reorganizedKnowledge.content);
    this.status = 'idle';
    this.lastActive = new Date();
    this.emit('stateUpdate', this.toConfig());

    // Return the reorganized knowledge as the response
    return {
      content: reorganizedKnowledge.content
    };
  }
}

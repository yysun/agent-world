import { Agent } from './base';
import { AgentConfig, AgentType, ChatMessage, LLMResponse } from '../types';


export class ResearcherAgent extends Agent {

  constructor(config: AgentConfig, apiKey: string) {
    // Set specific researcher role and type
    const researcherConfig: AgentConfig = {
      ...config,
      type: AgentType.RESEARCHER
    };

    super(researcherConfig, apiKey);
  }

  override async chat(
    input: string,
    onStream?: (chunk: string) => void
  ): Promise<LLMResponse> {
    if (!this.llmProvider) {
      throw new Error('Provider not initialized');
    }

    this.addMessage('user', input);
    this.status = 'busy';
    this.lastActive = new Date();

    await this.addInformation(input, onStream);

    this.status = 'idle';
    this.lastActive = new Date();
    this.emit('stateUpdate', this.toConfig());

    return { content: this.getKnowledge() };
  }

  /**
 * Add new information from user input.
 * The LLM is prompted to extract bullet points of factual info.
 */
  async addInformation(userInfo: string, onStream?: (chunk: string) => void): Promise<void> {

    if (!this.llmProvider) {
      throw new Error('Provider not initialized');
    }

    // Build chat messages for knowledge extraction
    const extractionPrompt: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a knowledge-distillation assistant. You have some existing knowledge:
  ${this.getKnowledge}

  Answer user's question:

  - Identify new or supplementary key points, details, and considerations related to the user's query.
  - Present the answer in a series of **new** concise Markdown bullet points.
  - Focus on direct, actionable, or insightful information not already covered.
  - Do NOT simply repeat the existing knowledge.

  Return ONLY Markdown bullet points in the format "- fact".`,
        timestamp: Date.now()
      },
      {
        role: 'user',
        content: `${userInfo}\n\n`,
        timestamp: Date.now()
      }
    ];

    const response = await this.llmProvider.chat(extractionPrompt, onStream);
    this.addMessage('assistant', response.content);

    const newKnowledge = response.content;
    await this.summarizeKnowledge(this.getKnowledge() + '\n' + newKnowledge, onStream);
  }

  /**
   * Answer a user query by retrieving known facts and using them as context.
   */
  async answerQuery(query: string, onStream?: (chunk: string) => void): Promise<string> {

    if (!this.llmProvider) {
      throw new Error('Provider not initialized');
    }

    const context = this.getKnowledge();
    const answerPrompt: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert knowledge-distillation assistant. You have a knowledge base represented as Markdown bullet points:

  ${context}

  Please answer the user's question using ONLY the above knowledge. If the knowledge does not contain information needed to answer directly, say that you do not have enough information. 

  - Do not invent new facts.
  - Do not add external information not present in the given knowledge.
  - Provide a concise, direct answer.

  Return your answer as Markdown text.`,
        timestamp: Date.now()
      },
      {
        role: 'user',
        content: query,
        timestamp: Date.now()
      }
    ];


    const answer = await this.llmProvider.chat(answerPrompt, onStream);
    return answer.content.trim();
  }


  private async summarizeKnowledge(knowledge: string, onStream?: (chunk: string) => void): Promise<void> {

    if (!this.llmProvider) {
      throw new Error('Provider not initialized');
    }

    const summarizePrompt: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an expert knowledge-distillation assistant.

Please reorganize the bullet points Specifically:

- Retain the current features as much as possible unless it is asked to remove.        
- Remove duplicates or near-duplicates.
- Combine similar points to ensure clarity and brevity.
- Return ONLY the final Markdown bullet list.
        `,
        timestamp: Date.now()
      },
      {
        role: 'user',
        content: knowledge,
        timestamp: Date.now()
      }
    ];

    const summaryResponse = await this.llmProvider.chat(summarizePrompt, onStream);
    this.setKnowledge(summaryResponse.content);

    console.log('\n\nKnowledge summary:');
    console.log('-'.repeat(20));
    console.log(summaryResponse.content);
    console.log('-'.repeat(20));

  }

}

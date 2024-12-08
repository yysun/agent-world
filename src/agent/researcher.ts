import { Agent } from './base';
import { AgentConfig, AgentType } from '../types';

export class ResearcherAgent extends Agent {
  constructor(config: AgentConfig, apiKey: string) {
    // Set specific researcher role and type
    const researcherConfig: AgentConfig = {
      ...config,
      role: `You are an AI Researcher specialized in technical research and analysis.
Your responsibilities include:
- Conducting in-depth technical research
- Analyzing new technologies and trends
- Evaluating technical solutions and approaches
- Gathering and synthesizing information
- Producing detailed research reports
- Making data-driven recommendations`,
      type: AgentType.RESEARCHER
    };

    super(researcherConfig, apiKey);
  }
}

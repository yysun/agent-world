/*
 * Add Command - Agent Creation
 * 
 * Features:
 * - Interactive agent creation with customizable parameters
 * - Accepts optional [name] argument: `/add [name]` (e.g., `/add a2`)
 * - Support for different agent types and configurations
 * - Static imports for better performance and tree-shaking
 * - Validation and error handling for agent creation
 * - Automatic message subscription during agent creation
 *
 * Logic:
 * - Parses command arguments for agent parameters
 * - If [name] is provided as the first argument, uses it as the agent name
 * - If not provided, prompts interactively for agent name
 * - Creates new agent through World.createAgent()
 * - Agent automatically gets subscribed to messages during creation
 * - Provides default values for missing parameters
 * - Reports creation status and agent details
 */

import * as readline from 'readline';
import * as World from '../../src/world';
import { colors } from '../utils/colors';
import { AgentConfig, LLMProvider } from '../../src/types';
export async function addCommand(args: string[], worldName: string): Promise<void> {
  try {
    // Accepts: /add [name]
    // If [name] is provided, use as agent name; otherwise prompt
    let agentName = args[0];
    const type = 'assistant';
    const description = `A ${type} agent`;

    if (!agentName) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      agentName = await new Promise<string>((resolve) => {
        rl.question(colors.cyan('Enter agent name: '), (answer) => {
          rl.close();
          resolve(answer.trim() || `${type.charAt(0).toUpperCase() + type.slice(1)}-${Date.now()}`);
        });
      });
    }

    console.log(colors.blue(`Creating ${type} agent: ${agentName}...`));

    const agentConfig: AgentConfig = {
      name: agentName,
      type: type,
      provider: LLMProvider.OLLAMA,
      model: 'llama3.2:3b',
      systemPrompt: `You are a helpful ${type} agent. ${description}`,
      temperature: 0.7,
      maxTokens: 1000
    };

    const agent = await World.createAgent(worldName, agentConfig);

    if (!agent) {
      throw new Error('Failed to create agent');
    }

    console.log(colors.green(`✓ Successfully created agent:`));
    console.log(colors.gray(`  Name: ${agent.name}`));
    console.log(colors.gray(`  Status: ${agent.status}`));

  } catch (error) {
    console.log(colors.red(`Failed to create agent: ${error}`));
  }
}

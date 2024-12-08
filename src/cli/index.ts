import { World } from '../world';
import { logger, config } from '../config';
import { AgentConfig, AgentType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { readInput as cliReadInput } from './input';

export class CLI {
  private world: World;
  private isRunning: boolean;

  constructor() {
    this.world = new World();
    this.isRunning = false;
  }

  public async start(): Promise<void> {
    // Initialize world before starting CLI
    await this.world.initialize();
    
    console.log('Welcome to Agent World CLI!');
    await this.handleCommand("/help")
    await this.listAgents(); // Show loaded agents on startup

    this.isRunning = true;

    while (this.isRunning) {
      try {
        const input = await cliReadInput('agent-world> ');
        await this.handleCommand(input.trim());
      } catch (error) {
        logger.error('Error executing command:', error);
        console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  private async askForAgentType(): Promise<AgentType> {
    console.log('\nAvailable agent types:');
    console.log('1. Architect - Specialized in software architecture and system design');
    console.log('2. Coder - Specialized in software development and implementation');
    console.log('3. Researcher - Specialized in technical research and analysis');

    while (true) {
      const input = await cliReadInput('Select agent type (1-3): ');
      switch (input.trim()) {
        case '1': return AgentType.ARCHITECT;
        case '2': return AgentType.CODER;
        case '3': return AgentType.RESEARCHER;
        default: console.log('Invalid selection. Please choose 1-3.');
      }
    }
  }

  public async handleCommand(input: string): Promise<void> {
    // If input doesn't start with /, treat as message to all agents
    if (!input.startsWith('/')) {
      if (input.trim()) {
        await this.askAllAgents(input);
      }
      return;
    }

    // Parse command respecting quotes (remove leading slash)
    const args = input.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(arg => arg.replace(/^"|"$/g, '')) || [];
    const command = args.shift()?.toLowerCase().replace(/^\//, '') || '';

    switch (command) {
      case 'help':
        this.showHelp();
        break;

      case 'new':
        await this.spawnAgent(args);
        break;

      case 'list':
        await this.listAgents();
        break;

      case 'kill':
        if (args.length < 1) {
          console.log('Usage: kill <name>');
          return;
        }
        await this.killAgent(args[0]);
        break;

      case 'ask':
        if (args.length < 1) {
          console.log('Usage: ask [name] <message>');
          return;
        }

        // Check if first argument could be an agent name
        const agent = this.findAgentByName(args[0]);
        if (agent) {
          // If agent exists, first arg is name, rest is message
          const message = args.slice(1).join(' ');
          if (!message) {
            console.log('Usage: ask [name] <message>');
            return;
          }
          await this.askAgent(args[0], message);
        } else {
          // No agent name provided or invalid agent, treat entire args as message
          const message = args.join(' ');
          await this.askAllAgents(message);
        }
        break;

      case 'status':
        if (args.length === 0) {
          await this.showAllAgentsStatus();
        } else {
          await this.showAgentStatus(args[0]);
        }
        break;

      case 'clear':
        if (args.length === 0) {
          await this.clearAllAgents();
        } else {
          await this.clearAgent(args[0]);
        }
        break;

      case 'exit':
      case 'quit':
        await this.shutdown();
        break;

      default:
        if (input) {
          console.log('Unknown command. Type "/help" for available commands, or type without "/" to talk to all agents.');
        }
    }
  }

  private async spawnAgent(args: string[]): Promise<void> {
    if (args.length < 1) {
      console.log('Usage: new <name> [provider]');
      return;
    }

    const [name, provider = 'ollama'] = args;
    if (!['openai', 'anthropic', 'ollama'].includes(provider)) {
      console.log('Provider must be either "openai", "anthropic", or "ollama"');
      return;
    }

    // Check if an agent with this name already exists
    if (this.findAgentByName(name)) {
      console.log(`An agent named "${name}" already exists. Please choose a different name.`);
      return;
    }

    const agentType = await this.askForAgentType();

    const agentConfig: AgentConfig = {
      id: uuidv4(),
      name,
      provider: provider as 'openai' | 'anthropic' | 'ollama',
      model: provider === 'openai' ? config.openai.defaultModel :
        provider === 'anthropic' ? config.anthropic.defaultModel :
          config.ollama.defaultModel,
      role: '', // Role will be set by the specific agent class
      status: 'idle',
      lastActive: new Date(),
      type: agentType
    };

    // Get the appropriate API key - note that Ollama doesn't need one
    const apiKey = provider === 'openai' ? config.openai.apiKey :
      provider === 'anthropic' ? config.anthropic.apiKey :
        '';

    try {
      const agent = await this.world.spawnAgent(agentConfig, apiKey);
      console.log(`Agent spawned successfully! ID: ${agent.getId()}`);
    } catch (error) {
      console.error('Failed to spawn agent:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async listAgents(): Promise<void> {
    const agents = this.world.getAgents();
    if (agents.size === 0) {
      console.log('No active agents');
      return;
    }

    console.log('\nActive Agents:');
    for (const [id, agent] of agents) {
      const status = await this.world.getAgentState(id);
      console.log(`- ${agent.getName()} (${id})`);
      console.log(`  Status: ${status.status}`);
      console.log(`  Provider: ${agent.getProvider()}`);
      console.log(`  Type: ${agent.getStatus().type}`);
      console.log(`  Last Active: ${status.lastActive.toISOString()}`);
      console.log();
    }
  }

  private findAgentByName(name: string) {
    const agents = this.world.getAgents();
    return Array.from(agents.values()).find(agent => agent.getName() === name);
  }

  private async killAgent(name: string): Promise<void> {
    const agent = this.findAgentByName(name);
    if (!agent) {
      console.log(`Agent "${name}" not found`);
      return;
    }

    try {
      await this.world.killAgent(agent.getId());
      console.log(`Agent "${name}" terminated successfully`);
    } catch (error) {
      console.error('Failed to kill agent:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async askAgent(name: string, message: string): Promise<void> {
    const agent = this.findAgentByName(name);
    if (!agent) {
      console.log(`Agent "${name}" not found`);
      return;
    }

    try {
      console.log(`Asking agent "${name}"...`);
      const response = await agent.chat(message, (chunk: string) => {
        process.stdout.write(chunk);
      });
      console.log('\nResponse:', response.content);

      if (response.toolCalls?.length) {
        response.toolCalls.forEach(call => {
          console.log(`- ${call.name}:`, call.arguments);
        });
      }
    } catch (error) {
      console.error('Failed to ask agent:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async askAllAgents(message: string): Promise<void> {
    const agents = this.world.getAgents();
    if (agents.size === 0) {
      console.log('No active agents to ask');
      return;
    }

    for (const agent of agents.values()) {
      console.log(`\n=== Response from ${agent.getName()} ===`);
      try {
        const response = await agent.chat(message, (chunk: string) => {
          process.stdout.write(chunk);
        });
        if (response.toolCalls?.length) {
          response.toolCalls.forEach(call => {
            console.log(`- ${call.name}:`, call.arguments);
          });
        }
      } catch (error) {
        console.error(`Failed to ask agent ${agent.getName()}:`,
          error instanceof Error ? error.message : 'Unknown error');
      }
      console.log('\n' + '='.repeat(40));
    }
  }

  private async showAgentStatus(name: string): Promise<void> {
    const agent = this.findAgentByName(name);
    if (!agent) {
      console.log(`Agent "${name}" not found`);
      return;
    }

    try {
      const worldState = await this.world.getAgentState(agent.getId());
      const agentStatus = agent.getStatus();

      console.log('\nAgent Status:');
      console.log(JSON.stringify({
        ...agentStatus,
        status: worldState.status,
        lastActive: worldState.lastActive
      }, null, 2));
    } catch (error) {
      console.error('Failed to get agent status:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async showAllAgentsStatus(): Promise<void> {
    const agents = this.world.getAgents();
    if (agents.size === 0) {
      console.log('No active agents');
      return;
    }

    console.log('\nAll Agents Status:');
    for (const agent of agents.values()) {
      console.log(`\n=== ${agent.getName()} ===`);
      try {
        const worldState = await this.world.getAgentState(agent.getId());
        const agentStatus = agent.getStatus();
        console.log(JSON.stringify({
          ...agentStatus,
          status: worldState.status,
          lastActive: worldState.lastActive
        }, null, 2));
      } catch (error) {
        console.error(`Failed to get status for agent ${agent.getName()}:`,
          error instanceof Error ? error.message : 'Unknown error');
      }
      console.log('='.repeat(40));
    }
  }

  private async clearAgent(name: string): Promise<void> {
    const agent = this.findAgentByName(name);
    if (!agent) {
      console.log(`Agent "${name}" not found`);
      return;
    }

    try {
      // Update the agent's config with an empty chat history
      const config = agent.getStatus();
      config.chatHistory = [];
      // Emit state update to persist the change
      agent.emit('stateUpdate', config);
      console.log(`Chat history cleared for agent "${name}"`);
    } catch (error) {
      console.error('Failed to clear agent:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async clearAllAgents(): Promise<void> {
    const agents = this.world.getAgents();
    if (agents.size === 0) {
      console.log('No active agents to clear');
      return;
    }

    for (const agent of agents.values()) {
      try {
        // Update each agent's config with an empty chat history
        const config = agent.getStatus();
        config.chatHistory = [];
        // Emit state update to persist the change
        agent.emit('stateUpdate', config);
        console.log(`Chat history cleared for agent "${agent.getName()}"`);
      } catch (error) {
        console.error(`Failed to clear agent ${agent.getName()}:`,
          error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  private async shutdown(): Promise<void> {
    this.isRunning = false;
    console.log('\nShutting down Agent World...');
    await this.world.shutdown();
    process.exit(0);
  }

  private showHelp(): void {
    console.log(`
Available commands:
  /new <name> [provider]    - Create a new agent (provider: openai|anthropic|ollama, defaults to ollama)
  /list                     - List all active agents
  /kill <name>             - Terminate an agent by name
  /ask [name] <msg>        - Ask a question to an agent (or all agents if no name specified)
  /status [name]           - Show agent status and memory (or all agents if no name specified)
  /clear [name]            - Clear agent's chat history (or all agents if no name specified)
  /help                    - Show this help message
  /exit                    - Exit the program
    `);
  }
}

// Start CLI if this file is run directly
if (require.main === module) {
  const cli = new CLI();
  cli.start().catch(error => {
    logger.error('Failed to start CLI:', error);
    process.exit(1);
  });
}

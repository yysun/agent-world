import readline from 'readline';
import { World } from '../world';
import { logger, config } from '../config';
import { AgentConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class CLI {
  private world: World;
  private rl: readline.Interface;

  constructor() {
    this.world = new World();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'agent-world> '
    });
  }

  public async start(): Promise<void> {
    console.log('Welcome to Agent World CLI!');
    console.log('Type "help" for available commands');

    this.rl.prompt();

    this.rl.on('line', async (line) => {
      try {
        await this.handleCommand(line.trim());
      } catch (error) {
        logger.error('Error executing command:', error);
        console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      }
      this.rl.prompt();
    });

    this.rl.on('close', async () => {
      console.log('\nShutting down Agent World...');
      await this.world.shutdown();
      process.exit(0);
    });
  }

  private async handleCommand(input: string): Promise<void> {
    const [command, ...args] = input.split(' ');

    switch (command.toLowerCase()) {
      case 'help':
        this.showHelp();
        break;

      case 'spawn':
        await this.spawnAgent(args);
        break;

      case 'list':
        await this.listAgents();
        break;

      case 'kill':
        if (args.length < 1) {
          console.log('Usage: kill <agentId>');
          return;
        }
        await this.killAgent(args[0]);
        break;

      case 'ask':
        if (args.length < 2) {
          console.log('Usage: ask <agentId> <message>');
          return;
        }
        const [agentId, ...messageWords] = args;
        await this.askAgent(agentId, messageWords.join(' '));
        break;

      case 'status':
        if (args.length < 1) {
          console.log('Usage: status <agentId>');
          return;
        }
        await this.showAgentStatus(args[0]);
        break;

      case 'exit':
      case 'quit':
        this.rl.close();
        break;

      default:
        console.log('Unknown command. Type "help" for available commands.');
    }
  }

  private showHelp(): void {
    console.log(`
Available commands:
  spawn <name> <provider>  - Create a new agent (provider: openai|anthropic)
  list                     - List all active agents
  kill <agentId>          - Terminate an agent
  ask <agentId> <msg>     - Ask a question to an agent
  status <agentId>        - Show agent status
  help                    - Show this help message
  exit                    - Exit the program
    `);
  }

  private async spawnAgent(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log('Usage: spawn <name> <provider>');
      return;
    }

    const [name, provider] = args;
    if (!['openai', 'anthropic'].includes(provider)) {
      console.log('Provider must be either "openai" or "anthropic"');
      return;
    }

    const agentConfig: AgentConfig = {
      id: uuidv4(),
      name,
      provider: provider as 'openai' | 'anthropic',
      model: provider === 'openai' ? config.openai.defaultModel : config.anthropic.defaultModel,
      apiKey: provider === 'openai' ? config.openai.apiKey : config.anthropic.apiKey
    };

    try {
      const agent = await this.world.spawnAgent(agentConfig);
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
      console.log(`  Last Active: ${status.lastActive.toISOString()}`);
      console.log();
    }
  }

  private async killAgent(agentId: string): Promise<void> {
    try {
      await this.world.killAgent(agentId);
      console.log(`Agent ${agentId} terminated successfully`);
    } catch (error) {
      console.error('Failed to kill agent:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async askAgent(agentId: string, message: string): Promise<void> {
    const agents = this.world.getAgents();
    const agent = agents.get(agentId);

    if (!agent) {
      console.log(`Agent ${agentId} not found`);
      return;
    }

    try {
      console.log(`Asking agent ${agentId}...`);
      const response = await agent.interact(message, (chunk) => {
        process.stdout.write(chunk);
      });
      console.log('\nResponse:', response.content);
      
      if (response.toolCalls?.length) {
        console.log('\nTool Calls:');
        response.toolCalls.forEach(call => {
          console.log(`- ${call.name}:`, call.arguments);
        });
      }
    } catch (error) {
      console.error('Failed to ask agent:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async showAgentStatus(agentId: string): Promise<void> {
    try {
      const status = await this.world.getAgentState(agentId);
      console.log('\nAgent Status:');
      console.log(JSON.stringify(status, null, 2));
    } catch (error) {
      console.error('Failed to get agent status:', error instanceof Error ? error.message : 'Unknown error');
    }
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

import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Agent } from '../agent/base';
import { AgentConfig, WorldConfig } from '../types';
import { logger, worldConfig, config } from '../config';
import { sanitizeFilename } from '../utils';

export class World extends EventEmitter {
  private agents: Map<string, Agent>;
  private config: WorldConfig;
  private persistPath: string;
  private workers: Map<string, Worker>;

  constructor(config: WorldConfig = worldConfig) {
    super();
    this.agents = new Map();
    this.workers = new Map();
    this.config = config;
    this.persistPath = path.resolve(config.persistPath);
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.persistPath, { recursive: true });
      await this.loadPersistedAgents();
      logger.info('World initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize world:', error);
      throw error;
    }
  }

  private async loadPersistedAgents(): Promise<void> {
    try {
      const files = await fs.readdir(this.persistPath);
      const agentFiles = files.filter(file => file.endsWith('.agent.json'));

      for (const file of agentFiles) {
        const content = await fs.readFile(path.join(this.persistPath, file), 'utf-8');
        const agentConfig: AgentConfig = JSON.parse(content);
        // Get the appropriate API key from the global config
        const apiKey = agentConfig.provider === 'openai' 
          ? config.openai.apiKey 
          : config.anthropic.apiKey;
        await this.spawnAgent(agentConfig, apiKey);
      }
    } catch (error) {
      logger.error('Failed to load persisted agents:', error);
    }
  }

  public async spawnAgent(agentConfig: AgentConfig, apiKey: string): Promise<Agent> {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error(`Maximum number of agents (${this.config.maxAgents}) reached`);
    }

    if (this.agents.has(agentConfig.id)) {
      throw new Error(`Agent with ID ${agentConfig.id} already exists`);
    }

    try {
      // Create and initialize the agent with the API key
      const agent = new Agent(agentConfig, apiKey);
      this.agents.set(agentConfig.id, agent);

      // Create a clean config object for persistence (ensures no apiKey is included)
      const persistConfig: AgentConfig = {
        id: agentConfig.id,
        name: agentConfig.name,
        role: agentConfig.role,
        provider: agentConfig.provider,
        model: agentConfig.model,
        status: agentConfig.status,
        lastActive: agentConfig.lastActive
      };

      // Persist agent configuration
      await this.persistAgentConfig(persistConfig);

      // Set up event listeners
      this.setupAgentEventListeners(agent);

      // Spawn worker thread for the agent
      await this.spawnWorkerThread(agentConfig.id);

      logger.info(`Agent ${agentConfig.id} spawned successfully`);
      this.emit('agentSpawned', { agentId: agentConfig.id });

      return agent;
    } catch (error) {
      logger.error(`Failed to spawn agent ${agentConfig.id}:`, error);
      throw error;
    }
  }

  private async persistAgentConfig(config: AgentConfig): Promise<void> {
    try {
      const safeFilename = sanitizeFilename(config.name);
      const filePath = path.join(this.persistPath, `${safeFilename}.agent.json`);
      
      // Get the current memory state if the agent exists
      const agent = this.agents.get(config.id);
      if (agent) {
        const memory = agent.getMemory();
        const persistData = {
          ...config,
          memory: {
            longTerm: Object.fromEntries(memory.longTerm)
          }
        };
        await fs.writeFile(filePath, JSON.stringify(persistData, null, 2));
      } else {
        // If agent doesn't exist yet (during initial spawn), just save the config
        await fs.writeFile(filePath, JSON.stringify(config, null, 2));
      }
      
      logger.info(`Persisted agent ${config.name} configuration and memory`);
    } catch (error) {
      logger.error(`Failed to persist agent ${config.name} configuration:`, error);
      throw error;
    }
  }

  private setupAgentEventListeners(agent: Agent): void {
    // Listen for memory updates
    agent.on('memoryUpdate', async (data) => {
      this.emit('agentMemoryUpdate', { agentId: agent.getId(), ...data });
      
      // Persist the updated state when long-term memory changes
      if (data.type === 'longTerm') {
        await this.persistAgentConfig(agent.getStatus());
      }
    });

    // Listen for state updates (status changes, interactions, etc.)
    agent.on('stateUpdate', async (status: AgentConfig) => {
      this.emit('agentStateUpdate', { agentId: agent.getId(), status });
      await this.persistAgentConfig(status);
    });
  }

  private async spawnWorkerThread(agentId: string): Promise<void> {
    // Use require.resolve to handle both .ts and .js extensions
    const workerPath = require.resolve('./worker');
    const worker = new Worker(workerPath, {
      workerData: { agentId }
    });

    worker.on('message', (message) => {
      this.handleWorkerMessage(agentId, message);
    });

    worker.on('error', (error) => {
      logger.error(`Worker error for agent ${agentId}:`, error);
      this.emit('agentError', { agentId, error });
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        logger.error(`Worker for agent ${agentId} exited with code ${code}`);
      }
      this.workers.delete(agentId);
    });

    this.workers.set(agentId, worker);
  }

  private handleWorkerMessage(agentId: string, message: any): void {
    // Handle different types of messages from worker threads
    switch (message.type) {
      case 'status':
        this.emit('agentStatus', { agentId, status: message.data });
        break;
      case 'result':
        this.emit('agentResult', { agentId, result: message.data });
        break;
      default:
        logger.warn(`Unknown message type from worker: ${message.type}`);
    }
  }

  public async killAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    try {
      // Terminate worker thread
      const worker = this.workers.get(agentId);
      if (worker) {
        await worker.terminate();
        this.workers.delete(agentId);
      }

      // Remove agent
      const safeFilename = sanitizeFilename(agent.getName());
      const configPath = path.join(this.persistPath, `${safeFilename}.agent.json`);
      await fs.unlink(configPath);
      this.agents.delete(agentId);

      logger.info(`Agent ${agent.getName()} killed successfully`);
      this.emit('agentKilled', { agentId });
    } catch (error) {
      logger.error(`Failed to kill agent ${agentId}:`, error);
      throw error;
    }
  }

  public getAgentState(agentId: string): {
    id: string;
    status: 'idle' | 'busy' | 'error';
    lastActive: Date;
    memory: {
      shortTerm: Map<string, any>;
      longTerm: Map<string, any>;
    };
  } {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    return {
      id: agent.getId(),
      status: this.workers.has(agentId) ? 'busy' : 'idle',
      lastActive: new Date(),
      memory: agent.getMemory()
    };
  }

  public getAgents(): Map<string, Agent> {
    return this.agents;
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down world...');
    
    // Terminate all worker threads
    const workerTerminations = Array.from(this.workers.values()).map(worker => 
      worker.terminate()
    );
    await Promise.all(workerTerminations);
    
    // Clear maps
    this.workers.clear();
    this.agents.clear();
    
    logger.info('World shutdown complete');
  }
}

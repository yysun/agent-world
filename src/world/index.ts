import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Agent } from '../agent/base';
import { ArchitectAgent } from '../agent/architect';
import { CoderAgent } from '../agent/coder';
import { ResearcherAgent } from '../agent/researcher';
import { AgentConfig, WorldConfig, AgentType } from '../types';
import { logger, worldConfig, config } from '../config';
import { sanitizeFilename } from '../utils';

interface AgentState {
  id: string;
  status: 'idle' | 'busy' | 'error';
  lastActive: Date;
  memory: ReturnType<Agent['getChatHistory']>;
}

export class World extends EventEmitter {
  private agents: Map<string, Agent>;
  private config: WorldConfig;
  private persistPath: string;
  private workers: Map<string, Worker>;
  private initialized: boolean = false;

  constructor(config: WorldConfig = worldConfig) {
    super();
    this.agents = new Map();
    this.workers = new Map();
    this.config = config;
    this.persistPath = path.resolve(config.persistPath);
  }

  private createAgentInstance(agentConfig: AgentConfig, apiKey: string): Agent {
    switch (agentConfig.type) {
      case AgentType.ARCHITECT:
        return new ArchitectAgent(agentConfig, apiKey);
      case AgentType.CODER:
        return new CoderAgent(agentConfig, apiKey);
      case AgentType.RESEARCHER:
        return new ResearcherAgent(agentConfig, apiKey);
      default:
        return new Agent(agentConfig, apiKey);
    }
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await fs.mkdir(this.persistPath, { recursive: true });
      await this.loadAgents();
      this.initialized = true;
      logger.info('World initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize world:', error);
      throw error;
    }
  }

  private async loadAgents(): Promise<void> {
    try {
      const dataPath = path.resolve('data');
      const files = await fs.readdir(dataPath);
      const agentFiles = files.filter(file => file.endsWith('.agent.json'));

      logger.info(`Found ${agentFiles.length} agent files in data folder`);

      for (const file of agentFiles) {
        try {
          const content = await fs.readFile(path.join(dataPath, file), 'utf-8');
          const persistedData = JSON.parse(content);

          // Convert string type to AgentType enum
          let agentType: AgentType;
          switch (persistedData.type?.toLowerCase()) {
            case 'architect':
              agentType = AgentType.ARCHITECT;
              break;
            case 'coder':
              agentType = AgentType.CODER;
              break;
            case 'researcher':
              agentType = AgentType.RESEARCHER;
              break;
            default:
              agentType = AgentType.BASE;
          }

          const agentConfig: AgentConfig = {
            ...persistedData,
            // Ensure knowledge and chatHistory are loaded if they exist
            knowledge: persistedData.knowledge || '',
            chatHistory: persistedData.chatHistory || [],
            // Set the proper enum type
            type: agentType
          };

          // Get the appropriate API key from the global config
          const apiKey = agentConfig.provider === 'openai'
            ? config.openai.apiKey
            : config.anthropic.apiKey;

          // Only spawn if agent doesn't already exist
          if (!this.agents.has(agentConfig.id)) {
            await this.spawnAgent(agentConfig, apiKey);
            logger.info(`Loaded and spawned agent ${agentConfig.name} from ${file}`);
          }
        } catch (error) {
          logger.error(`Failed to load agent from file ${file}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to load agents from data folder:', error);
      throw error;
    }
  }

  private async saveAgentData(config: AgentConfig): Promise<void> {
    try {
      const safeFilename = sanitizeFilename(config.name);
      const dataPath = path.join('data', `${safeFilename}.agent.json`);

      // Get the current memory state if the agent exists
      const agent = this.agents.get(config.id);
      const persistData = agent ? {
        ...config,
        chatHistory: agent.getChatHistory(),
        knowledge: agent.getKnowledge()
      } : config;

      const content = JSON.stringify(persistData, null, 2);

      // Save to data folder
      await fs.mkdir(path.dirname(dataPath), { recursive: true });
      await fs.writeFile(dataPath, content);

      logger.info(`Saved agent ${config.name} data`);
    } catch (error) {
      logger.error(`Failed to save agent ${config.name} data:`, error);
      throw error;
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
      // Create the appropriate agent instance based on type
      const agent = this.createAgentInstance(agentConfig, apiKey);
      this.agents.set(agentConfig.id, agent);

      // Create a clean config object for persistence (ensures no apiKey is included)
      const persistConfig: AgentConfig = {
        id: agentConfig.id,
        name: agentConfig.name,
        role: agentConfig.role,
        provider: agentConfig.provider,
        model: agentConfig.model,
        status: agentConfig.status,
        lastActive: agentConfig.lastActive,
        type: agentConfig.type,
        knowledge: agentConfig.knowledge,
        chatHistory: agentConfig.chatHistory
      };

      // Save agent data
      await this.saveAgentData(persistConfig);

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

  private setupAgentEventListeners(agent: Agent): void {
    // Listen for state updates (status changes, interactions, etc.)
    agent.on('stateUpdate', async (status: AgentConfig) => {
      // Save the data first
      await this.saveAgentData(status);
      // Then emit our event
      this.emit('agentStateUpdate', { agentId: agent.getId(), status });
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
        logger.warn('Unknown message type from worker: ' + message.type);
    }
  }

  public async killAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error('Agent ' + agentId + ' not found');
    }

    try {
      // Remove all listeners from the agent
      agent.removeAllListeners();

      // Terminate worker thread
      const worker = this.workers.get(agentId);
      if (worker) {
        await worker.terminate();
        this.workers.delete(agentId);
      }

      // Remove agent from data folder
      const safeFilename = sanitizeFilename(agent.getName());
      const dataPath = path.join('data', safeFilename + '.agent.json');
      await fs.unlink(dataPath).catch(() => { });
      this.agents.delete(agentId);

      logger.info('Agent ' + agent.getName() + ' killed successfully');
      this.emit('agentKilled', { agentId });
    } catch (error) {
      logger.error('Failed to kill agent ' + agentId + ':', error);
      throw error;
    }
  }

  public getAgentState(agentId: string): AgentState {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error('Agent ' + agentId + ' not found');
    }

    return {
      id: agent.getId(),
      status: this.workers.has(agentId) ? 'busy' : 'idle',
      lastActive: new Date(),
      memory: agent.getChatHistory()
    };
  }

  public getAgents(): Map<string, Agent> {
    return this.agents;
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down world...');

    // Remove all listeners from agents
    for (const agent of this.agents.values()) {
      agent.removeAllListeners();
    }

    // Terminate all worker threads
    const workerTerminations = Array.from(this.workers.values()).map(worker =>
      worker.terminate()
    );
    await Promise.all(workerTerminations);

    // Clear maps
    this.workers.clear();
    this.agents.clear();

    // Remove all World instance listeners
    this.removeAllListeners();

    logger.info('World shutdown complete');
  }
}

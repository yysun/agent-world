import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Agent } from '../agent/base';
import { AgentConfig, WorldConfig, AgentState } from '../types';
import { logger, worldConfig } from '../config';

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
        const config: AgentConfig = JSON.parse(content);
        await this.spawnAgent(config);
      }
    } catch (error) {
      logger.error('Failed to load persisted agents:', error);
    }
  }

  public async spawnAgent(config: AgentConfig): Promise<Agent> {
    if (this.agents.size >= this.config.maxAgents) {
      throw new Error(`Maximum number of agents (${this.config.maxAgents}) reached`);
    }

    if (this.agents.has(config.id)) {
      throw new Error(`Agent with ID ${config.id} already exists`);
    }

    try {
      // Create and initialize the agent
      const agent = new Agent(config);
      this.agents.set(config.id, agent);

      // Persist agent configuration
      await this.persistAgentConfig(config);

      // Set up event listeners
      this.setupAgentEventListeners(agent);

      // Spawn worker thread for the agent
      await this.spawnWorkerThread(config.id);

      logger.info(`Agent ${config.id} spawned successfully`);
      this.emit('agentSpawned', { agentId: config.id });

      return agent;
    } catch (error) {
      logger.error(`Failed to spawn agent ${config.id}:`, error);
      throw error;
    }
  }

  private async persistAgentConfig(config: AgentConfig): Promise<void> {
    const filePath = path.join(this.persistPath, `${config.id}.agent.json`);
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));
  }

  private setupAgentEventListeners(agent: Agent): void {
    agent.on('memoryUpdate', (data) => {
      this.emit('agentMemoryUpdate', { agentId: agent.getId(), ...data });
    });

    // Add more event listeners as needed
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
      this.agents.delete(agentId);

      // Remove persisted configuration
      const configPath = path.join(this.persistPath, `${agentId}.agent.json`);
      await fs.unlink(configPath);

      logger.info(`Agent ${agentId} killed successfully`);
      this.emit('agentKilled', { agentId });
    } catch (error) {
      logger.error(`Failed to kill agent ${agentId}:`, error);
      throw error;
    }
  }

  public async getAgentState(agentId: string): Promise<AgentState> {
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

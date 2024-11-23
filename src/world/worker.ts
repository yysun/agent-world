import { parentPort, workerData } from 'worker_threads';
import { logger } from '../config';

if (!parentPort) {
  throw new Error('This file must be run as a worker thread');
}

interface WorkerMessage {
  type: string;
  data: any;
}

class AgentWorker {
  private agentId: string;
  private isRunning: boolean = true;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.initialize();
  }

  private initialize(): void {
    if (!parentPort) return;

    parentPort.on('message', async (message: WorkerMessage) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        logger.error(`Error handling message in worker ${this.agentId}:`, error);
        this.sendError(error);
      }
    });

    // Signal that the worker is ready
    this.sendStatus('initialized');
  }

  private async handleMessage(message: WorkerMessage): Promise<void> {
    switch (message.type) {
      case 'execute':
        await this.executeTask(message.data);
        break;
      case 'stop':
        await this.stop();
        break;
      default:
        logger.warn(`Unknown message type received in worker: ${message.type}`);
    }
  }

  private async executeTask(task: any): Promise<void> {
    if (!this.isRunning) {
      throw new Error('Worker is stopped');
    }

    try {
      this.sendStatus('executing');

      // Simulate task execution with progress updates
      const steps = task.steps || 1;
      for (let i = 0; i < steps; i++) {
        if (!this.isRunning) break;

        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Send progress update
        this.sendProgress({
          step: i + 1,
          total: steps,
          status: 'in_progress'
        });
      }

      if (this.isRunning) {
        this.sendResult({
          status: 'completed',
          data: { taskId: task.id, result: 'Task completed successfully' }
        });
      }
    } catch (error) {
      this.sendError(error);
    } finally {
      this.sendStatus('idle');
    }
  }

  private async stop(): Promise<void> {
    this.isRunning = false;
    this.sendStatus('stopping');
    
    // Cleanup resources here if needed
    
    this.sendStatus('stopped');
    if (parentPort) {
      parentPort.close();
    }
  }

  private sendStatus(status: string): void {
    this.send('status', { status, agentId: this.agentId });
  }

  private sendProgress(progress: any): void {
    this.send('progress', progress);
  }

  private sendResult(result: any): void {
    this.send('result', result);
  }

  private sendError(error: any): void {
    this.send('error', {
      message: error.message,
      stack: error.stack,
      agentId: this.agentId
    });
  }

  private send(type: string, data: any): void {
    if (parentPort) {
      parentPort.postMessage({ type, data });
    }
  }
}

// Start the worker
try {
  const { agentId } = workerData;
  if (!agentId) {
    throw new Error('Agent ID is required for worker initialization');
  }

  new AgentWorker(agentId);
  
  logger.info(`Worker started for agent ${agentId}`);
} catch (error) {
  logger.error('Failed to start worker:', error);
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Web Server - Express.js HTTP Server with REST API and SSE
 * 
 * Features:
 * - Express server with CORS, static files, and modular API routing
 * - Environment-based LLM provider configuration
 * - Category-based logging with configurable levels
 * - Health check endpoint and proper error handling
 * - Environment Variables: Automatically loads .env file for API keys and configuration
 * 
 * Configuration: AGENT_WORLD_DATA_PATH, LOG_LEVEL, LLM provider keys
 * Endpoints: /health + API routes from ./api.ts
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import open from 'open';
import { createCategoryLogger, LLMProvider, LogLevel } from '../core/index.js';
import { configureLLMProvider } from '../core/llm-config.js';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Server } from 'http';
import apiRouter from './api.js';
import { initializeMCPRegistry, shutdownAllMCPServers } from '../core/mcp-server-registry.js';
import { createSQLiteSchemaContext } from '../core/storage/sqlite-schema.js';
import { createQueueStorage, type QueueStorage } from '../core/storage/queue-storage.js';
import { createSQLiteEventStorage, createMemoryEventStorage, type EventStorage } from '../core/storage/eventStorage/index.js';
import { getDefaultRootPath } from '../core/storage/storage-factory.js';

// ES modules setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = Number(process.env.PORT) || 0;
const HOST = process.env.HOST || '127.0.0.1';
const API_USE_QUEUE = process.env.API_USE_QUEUE !== 'false'; // default true
const API_SSE_POLL_INTERVAL = parseInt(process.env.API_SSE_POLL_INTERVAL || '150', 10);
const STORAGE_TYPE = (process.env.AGENT_WORLD_STORAGE_TYPE || 'sqlite') as 'sqlite' | 'memory';

// Create server logger after logger auto-initialization
const serverLogger = createCategoryLogger('server');

// Server context to hold shared resources
export interface ServerContext {
  queueStorage?: QueueStorage;
  eventStorage?: EventStorage;
  apiUseQueue: boolean;
  apiSSEPollInterval: number;
}

export const serverContext: ServerContext = {
  apiUseQueue: API_USE_QUEUE,
  apiSSEPollInterval: API_SSE_POLL_INTERVAL
};

// LLM provider configuration
function configureLLMProvidersFromEnv(): void {
  const providers = [
    { env: 'OPENAI_API_KEY', provider: LLMProvider.OPENAI, config: (key: string) => ({ apiKey: key }) },
    { env: 'ANTHROPIC_API_KEY', provider: LLMProvider.ANTHROPIC, config: (key: string) => ({ apiKey: key }) },
    { env: 'GOOGLE_API_KEY', provider: LLMProvider.GOOGLE, config: (key: string) => ({ apiKey: key }) },
    { env: 'XAI_API_KEY', provider: LLMProvider.XAI, config: (key: string) => ({ apiKey: key }) }
  ];

  providers.forEach(({ env, provider, config }) => {
    const key = process.env[env];
    if (key) {
      configureLLMProvider(provider, config(key));
      serverLogger.debug(`Configured ${provider} provider from environment`);
    }
  });

  // Azure (requires multiple env vars)
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_RESOURCE_NAME && process.env.AZURE_DEPLOYMENT) {
    configureLLMProvider(LLMProvider.AZURE, {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      resourceName: process.env.AZURE_RESOURCE_NAME,
      deployment: process.env.AZURE_DEPLOYMENT,
      apiVersion: process.env.AZURE_API_VERSION || '2024-10-21-preview'
    });
    serverLogger.debug('Configured Azure provider from environment');
  }

  // OpenAI Compatible
  if (process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_BASE_URL) {
    configureLLMProvider(LLMProvider.OPENAI_COMPATIBLE, {
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL
    });
    serverLogger.debug('Configured OpenAI-Compatible provider from environment');
  }

  // Ollama (OpenAI-compatible endpoint)
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
  configureLLMProvider(LLMProvider.OLLAMA, { baseUrl: ollamaUrl });
  serverLogger.debug('Configured Ollama provider (OpenAI-compatible)', { baseUrl: ollamaUrl });
}

/**
 * Initialize storage (queue and event storage)
 */
async function initializeStorage(): Promise<void> {
  if (!API_USE_QUEUE) {
    serverLogger.info('API queue disabled (API_USE_QUEUE=false), using direct processing');
    return;
  }

  const rootPath = getDefaultRootPath();
  const dbPath = process.env.AGENT_WORLD_SQLITE_DATABASE || path.join(rootPath, 'database.db');

  serverLogger.info(`Initializing storage for API queue (type: ${STORAGE_TYPE})`);

  if (STORAGE_TYPE === 'memory') {
    serverLogger.info('Using in-memory storage (data will not persist)');
    serverContext.queueStorage = await createQueueStorage('memory');
    serverContext.eventStorage = createMemoryEventStorage();
  } else {
    serverLogger.info(`Using SQLite storage (path: ${dbPath})`);
    const { db } = await createSQLiteSchemaContext({ database: dbPath });
    serverContext.queueStorage = await createQueueStorage('sqlite', db);
    serverContext.eventStorage = await createSQLiteEventStorage(db);
  }

  serverLogger.info('Storage initialized for API queue');
}

// Express app setup
const app = express();
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Static files and API routes
app.use(express.static(path.join(__dirname, '../public')));
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: { express: 'running' }
    });
  } catch (error) {
    console.error('Error getting server health:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Failed to get server health'
    });
  }
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', code: 'NOT_FOUND' });
});

// Server startup function
export async function startWebServer(port = PORT, host = HOST): Promise<Server> {
  return new Promise(async (resolve, reject) => {
    try {
      configureLLMProvidersFromEnv();

      // Initialize MCP registry
      initializeMCPRegistry();
      serverLogger.info('MCP registry initialized');

      // Initialize storage if queue is enabled
      await initializeStorage();

      const server = app.listen(port, host, () => {
        const serverAddress = server.address();
        if (serverAddress && typeof serverAddress === 'object') {
          const actualPort = serverAddress.port;
          const url = `http://${host}:${actualPort}`;
          console.log(`🌐 Web server running at ${url}`);
          if (API_USE_QUEUE) {
            console.log(`📬 API queue enabled (storage: ${STORAGE_TYPE})`);
          }
          // console.log(`📁 Serving static files from: ${path.join(__dirname, '../public')}`);
          // console.log(`🚀 HTTP server running with REST API and SSE chat`);
          resolve(server);
          open(url);
        }
      });

      server.on('error', reject);

      // Setup graceful shutdown handlers
      const gracefulShutdown = async (signal: string) => {
        serverLogger.info(`Received ${signal}, initiating graceful shutdown`);

        try {
          // Shutdown MCP servers first
          await shutdownAllMCPServers();
          serverLogger.info('MCP servers shut down');

          // Close storage resources
          if (serverContext.eventStorage?.close) {
            await serverContext.eventStorage.close();
            serverLogger.info('Event storage closed');
          }
          if (serverContext.queueStorage?.close) {
            await serverContext.queueStorage.close();
            serverLogger.info('Queue storage closed');
          }

          // Close Express server
          server.close((err) => {
            if (err) {
              serverLogger.error('Error closing server', { error: err.message });
              process.exit(1);
            } else {
              serverLogger.info('Express server closed');
              process.exit(0);
            }
          });
        } catch (error) {
          serverLogger.error('Error during graceful shutdown', {
            error: error instanceof Error ? error.message : error
          });
          process.exit(1);
        }
      };

      // Register shutdown handlers
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));

      // Handle uncaught exceptions and unhandled rejections
      process.on('uncaughtException', (error) => {
        serverLogger.error('Uncaught exception', { error: error.message });
        gracefulShutdown('uncaughtException');
      });

      process.on('unhandledRejection', (reason, promise) => {
        serverLogger.error('Unhandled rejection', {
          reason: reason instanceof Error ? reason.message : reason,
          promise: promise.toString()
        });
      });
    } catch (error) {
      serverLogger.error('Failed to start server', {
        error: error instanceof Error ? error.message : error
      });
      reject(error);
    }
  });
}

// Direct execution handling - check both direct execution and npm bin execution
const currentFileUrl = import.meta.url;
const entryPointUrl = pathToFileURL(path.resolve(process.argv[1])).href;
const isDirectExecution = currentFileUrl === entryPointUrl;
const isServerBinCommand = process.argv[1].includes('agent-world-server') || currentFileUrl.includes('server/index.js');

if (isDirectExecution || isServerBinCommand) {
  startWebServer()
    .then(() => console.log('Server started successfully'))
    .catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}

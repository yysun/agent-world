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
 * - Controlled startup behavior for direct execution vs imported usage
 * - Optional browser auto-open and process signal handler registration
 * 
 * Configuration: AGENT_WORLD_DATA_PATH, LOG_LEVEL, LLM provider keys
 * Endpoints: /health + API routes from ./api.ts
 * 
 * Recent Changes:
 * - 2026-02-08: Fixed auto-run detection to only trigger on direct execution
 * - 2026-02-08: Made browser auto-open configurable via AGENT_WORLD_AUTO_OPEN env var
 * - 2026-02-08: Prevented duplicate process signal handler registration using WeakSet
 * - 2026-02-08: Added shutdown guard to prevent race conditions during graceful shutdown
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

// ES modules setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = Number(process.env.PORT) || 0;
const HOST = process.env.HOST || '127.0.0.1';

type StartWebServerOptions = {
  openBrowser?: boolean;
  registerProcessHandlers?: boolean;
};

// Create server logger after logger auto-initialization
const serverLogger = createCategoryLogger('server');

// Track servers that have registered process handlers (prevents duplicate registration)
const serversWithHandlers = new WeakSet<Server>();

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
export function startWebServer(
  port = PORT,
  host = HOST,
  options: StartWebServerOptions = {}
): Promise<Server> {
  const openBrowser = options.openBrowser ?? false;
  const registerProcessHandlers = options.registerProcessHandlers ?? false;

  return new Promise((resolve, reject) => {
    configureLLMProvidersFromEnv();

    // Initialize MCP registry
    initializeMCPRegistry();
    serverLogger.info('MCP registry initialized');

    const server = app.listen(port, host, () => {
      const serverAddress = server.address();
      if (serverAddress && typeof serverAddress === 'object') {
        const actualPort = serverAddress.port;
        const url = `http://${host}:${actualPort}`;
        console.log(`🌐 Web server running at ${url}`);
        // console.log(`📁 Serving static files from: ${path.join(__dirname, '../public')}`);
        // console.log(`🚀 HTTP server running with REST API and SSE chat`);
        resolve(server);
        if (openBrowser) {
          open(url).catch((error) => {
            serverLogger.warn('Failed to open browser automatically', {
              error: error instanceof Error ? error.message : String(error),
              url
            });
          });
        }
      }
    });

    server.on('error', reject);

    // Setup graceful shutdown handlers
    let shuttingDown = false;
    const gracefulShutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      serverLogger.info(`Received ${signal}, initiating graceful shutdown`);

      try {
        // Shutdown MCP servers first
        await shutdownAllMCPServers();
        serverLogger.info('MCP servers shut down');

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

    if (registerProcessHandlers && !serversWithHandlers.has(server)) {
      serversWithHandlers.add(server);
      // Register shutdown handlers once
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
    }
  });
}

// Direct execution handling
const currentFileUrl = import.meta.url;
const entryPointUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
const isDirectExecution = currentFileUrl === entryPointUrl;
const isBinExecution = process.argv[1]?.includes('agent-world-server') || false;

// Auto-open browser by default when launched via npx/bin, unless explicitly disabled
const shouldOpenBrowser = isBinExecution
  ? process.env.AGENT_WORLD_AUTO_OPEN !== 'false'
  : process.env.AGENT_WORLD_AUTO_OPEN === 'true';

if (isDirectExecution || isBinExecution) {
  startWebServer(PORT, HOST, {
    openBrowser: shouldOpenBrowser,
    registerProcessHandlers: true
  })
    .then(() => console.log('Server started successfully'))
    .catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}

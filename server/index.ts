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

// ES modules setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = Number(process.env.PORT) || 0;
const HOST = process.env.HOST || '127.0.0.1';

// Create server logger after logger auto-initialization
const serverLogger = createCategoryLogger('server');

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
export function startWebServer(port = PORT, host = HOST): Promise<Server> {
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

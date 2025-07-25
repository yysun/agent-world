#!/usr/bin/env -S node --import tsx
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
dotenv.config();

import open from 'open';
import { initializeLogger, createCategoryLogger, LLMProvider, LogLevel } from '../core/index.js';
import { configureLLMProvider } from '../core/llm-config.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'http';
import apiRouter from './api';

// ES modules setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PORT = Number(process.env.PORT) || 0;
const HOST = process.env.HOST || '127.0.0.1';
const logLevel = (process.env.LOG_LEVEL || 'error') as LogLevel;

// Initialize logger (now synchronous)
initializeLogger({ globalLevel: logLevel });
const serverLogger = createCategoryLogger('server');
serverLogger.debug('Server logger initialized', { logLevel });

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
  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_ENDPOINT && process.env.AZURE_DEPLOYMENT) {
    configureLLMProvider(LLMProvider.AZURE, {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_ENDPOINT,
      deployment: process.env.AZURE_DEPLOYMENT,
      apiVersion: process.env.AZURE_API_VERSION || '2023-12-01-preview'
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

  // Ollama
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/api';
  configureLLMProvider(LLMProvider.OLLAMA, { baseUrl: ollamaUrl });
  serverLogger.debug('Configured Ollama provider', { baseUrl: ollamaUrl });
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

    const server = app.listen(port, host, () => {
      const serverAddress = server.address();
      if (serverAddress && typeof serverAddress === 'object') {
        const actualPort = serverAddress.port;
        const url = `http://${host}:${actualPort}`;
        console.log(`🌐 Web server running at ${url}`);
        console.log(`📁 Serving static files from: ${path.join(__dirname, '../public')}`);
        console.log(`🚀 HTTP server running with REST API and SSE chat`);
        resolve(server);
        open(url);
      }
    });

    server.on('error', reject);
  });
}

// Direct execution handling
if (import.meta.url === `file://${process.argv[1]}`) {
  startWebServer()
    .then(() => console.log('Server started successfully'))
    .catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
}

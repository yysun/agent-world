import dotenv from 'dotenv';
import winston from 'winston';
import { WorldConfig } from '../types';

// Load environment variables
dotenv.config();

// Configure logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// World configuration
export const worldConfig: WorldConfig = {
  maxAgents: parseInt(process.env.MAX_AGENTS || '10'),
  persistPath: process.env.PERSIST_PATH || './data',
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Validate required environment variables
const requiredEnvVars = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    defaultModel: process.env.OPENAI_MODEL || 'gpt-4-1106-preview'
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    defaultModel: process.env.ANTHROPIC_MODEL || 'claude-2.1'
  }
};

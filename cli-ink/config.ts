/**
 * CLI Configuration Management
 *
 * Features:
 * - Configuration file support for CLI preferences
 * - Root path and default world management
 * - User preferences for interactive mode
 * - Session state management for CLI context
 *
 * Configuration Options:
 * - defaultRootPath: Default root path for worlds data
 * - defaultWorld: Default world to connect to
 * - interactiveMode: Default mode preference
 * - displayOptions: Terminal display preferences
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface CLIConfig {
  defaultRootPath?: string;
  defaultWorld?: string;
  interactiveMode?: boolean;
  displayOptions?: {
    colors?: boolean;
    timestamps?: boolean;
    verboseOutput?: boolean;
  };
}

const CONFIG_DIR = join(homedir(), '.agent-world');
const CONFIG_FILE = join(CONFIG_DIR, 'cli-config.json');

export function loadConfig(): CLIConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const configData = readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(configData);
    }
  } catch (error) {
    console.warn('Failed to load config file, using defaults');
  }

  return {
    defaultRootPath: process.env.AGENT_WORLD_DATA_PATH || './data/worlds',
    interactiveMode: true,
    displayOptions: {
      colors: true,
      timestamps: false,
      verboseOutput: false
    }
  };
}

export function saveConfig(config: CLIConfig): void {
  try {
    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      require('fs').mkdirSync(CONFIG_DIR, { recursive: true });
    }

    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.warn('Failed to save config file:', error instanceof Error ? error.message : error);
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

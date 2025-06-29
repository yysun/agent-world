/**
 * Core System Validation Utilities
 * 
 * Features:
 * - World-agent relationship validation
 * - Directory structure validation and repair
 * - Agent ID and configuration validation
 * - Data integrity checks and recovery
 * - Health monitoring for core system
 * 
 * Implementation:
 * - Validates proper world-agent relationships
 * - Checks file system consistency
 * - Provides repair utilities for corrupted data
 * - Validates agent and world configurations
 * - Monitoring tools for system health
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { Agent, World, WorldConfig } from './types';
import { loadAllAgentsFromDisk, agentExistsOnDisk, getAgentDir } from './agent-storage';
import { getWorld } from './world-manager';
import { toKebabCase } from './utils';

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  repaired?: string[];
}

/**
 * Agent validation result
 */
export interface AgentValidationResult extends ValidationResult {
  agentId: string;
  worldName: string;
}

/**
 * World validation result
 */
export interface WorldValidationResult extends ValidationResult {
  worldName: string;
  agentCount: number;
  validAgents: number;
}

/**
 * System health result
 */
export interface SystemHealthResult {
  overall: ValidationResult;
  worlds: WorldValidationResult[];
  totalAgents: number;
  validAgents: number;
}

/**
 * Get root directory from environment or default
 */
function getRootDirectory(): string {
  return process.env.AGENT_WORLD_DATA_PATH || './data/worlds';
}

/**
 * Validate agent ID format and uniqueness
 */
export function validateAgentId(agentId: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if ID is kebab-case
  const kebabCase = toKebabCase(agentId);
  if (agentId !== kebabCase) {
    warnings.push(`Agent ID "${agentId}" should be kebab-case: "${kebabCase}"`);
  }

  // Check for valid characters
  if (!/^[a-z0-9-]+$/.test(agentId)) {
    errors.push(`Agent ID "${agentId}" contains invalid characters. Use only lowercase letters, numbers, and hyphens.`);
  }

  // Check length
  if (agentId.length < 2) {
    errors.push(`Agent ID "${agentId}" is too short. Minimum 2 characters.`);
  }

  if (agentId.length > 50) {
    errors.push(`Agent ID "${agentId}" is too long. Maximum 50 characters.`);
  }

  // Check for consecutive hyphens or starting/ending with hyphen
  if (agentId.includes('--') || agentId.startsWith('-') || agentId.endsWith('-')) {
    errors.push(`Agent ID "${agentId}" has invalid hyphen placement.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate agent configuration
 */
export function validateAgentConfig(agent: Agent): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!agent.name || agent.name.trim().length === 0) {
    errors.push('Agent missing required field: name');
  }

  if (!agent.type || agent.type.trim().length === 0) {
    errors.push('Agent missing required field: type');
  }

  if (!agent.provider) {
    errors.push('Agent missing required field: provider');
  }

  if (!agent.model || agent.model.trim().length === 0) {
    errors.push('Agent missing required field: model');
  }

  // Check optional fields for reasonable values
  if (agent.temperature !== undefined) {
    if (agent.temperature < 0 || agent.temperature > 2) {
      warnings.push(`Temperature ${agent.temperature} is outside typical range (0-2)`);
    }
  }

  if (agent.maxTokens !== undefined) {
    if (agent.maxTokens < 1 || agent.maxTokens > 100000) {
      warnings.push(`MaxTokens ${agent.maxTokens} is outside reasonable range (1-100000)`);
    }
  }

  // Check system prompt
  if (agent.systemPrompt && agent.systemPrompt.length > 10000) {
    warnings.push('System prompt is very long (>10000 chars). Consider shortening for better performance.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate world configuration
 */
export function validateWorldConfig(config: WorldConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!config.name || config.name.trim().length === 0) {
    errors.push('World config missing required field: name');
  }

  // Check turn limit
  if (config.turnLimit !== undefined) {
    if (config.turnLimit < 1 || config.turnLimit > 1000) {
      warnings.push(`Turn limit ${config.turnLimit} is outside reasonable range (1-1000)`);
    }
  }

  // Check name format
  if (config.name && config.name.length > 100) {
    warnings.push('World name is very long (>100 chars). Consider shortening.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate agent directory structure
 */
export async function validateAgentDirectoryStructure(worldName: string, agentId: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repaired: string[] = [];

  try {
    const root = getRootDirectory();
    const agentDir = getAgentDir(root, worldName, agentId);

    // Check if agent directory exists
    try {
      await fs.access(agentDir);
    } catch {
      errors.push(`Agent directory does not exist: ${agentDir}`);
      return { isValid: false, errors, warnings };
    }

    // Check for required files
    const requiredFiles = ['config.json', 'system-prompt.md', 'memory.json'];

    for (const fileName of requiredFiles) {
      const filePath = path.join(agentDir, fileName);
      try {
        await fs.access(filePath);
      } catch {
        if (fileName === 'memory.json') {
          // Create default memory file
          await fs.writeFile(filePath, JSON.stringify([], null, 2), 'utf8');
          repaired.push(`Created missing ${fileName}`);
        } else if (fileName === 'system-prompt.md') {
          // Create default system prompt
          await fs.writeFile(filePath, `You are ${agentId}, an AI agent.`, 'utf8');
          repaired.push(`Created missing ${fileName}`);
        } else {
          errors.push(`Missing required file: ${fileName}`);
        }
      }
    }

    // Validate config.json format
    try {
      const configPath = path.join(agentDir, 'config.json');
      const configData = await fs.readFile(configPath, 'utf8');
      JSON.parse(configData);
    } catch {
      errors.push('Invalid JSON format in config.json');
    }

    // Validate memory.json format
    try {
      const memoryPath = path.join(agentDir, 'memory.json');
      const memoryData = await fs.readFile(memoryPath, 'utf8');
      const memory = JSON.parse(memoryData);
      if (!Array.isArray(memory)) {
        errors.push('Memory file should contain an array');
      }
    } catch {
      warnings.push('Could not validate memory.json format');
    }

  } catch (error) {
    errors.push(`Validation error: ${error}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    repaired
  };
}

/**
 * Validate world directory structure
 */
export async function validateWorldDirectoryStructure(worldName: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repaired: string[] = [];

  try {
    const root = getRootDirectory();
    const worldDir = path.join(root, toKebabCase(worldName));

    // Check if world directory exists
    try {
      await fs.access(worldDir);
    } catch {
      errors.push(`World directory does not exist: ${worldDir}`);
      return { isValid: false, errors, warnings };
    }

    // Check for required files and directories
    const configPath = path.join(worldDir, 'config.json');
    const agentsDir = path.join(worldDir, 'agents');

    try {
      await fs.access(configPath);
    } catch {
      errors.push('Missing world config.json file');
    }

    try {
      await fs.access(agentsDir);
    } catch {
      // Create agents directory if missing
      await fs.mkdir(agentsDir, { recursive: true });
      repaired.push('Created missing agents directory');
    }

    // Validate config.json format
    try {
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);

      if (!config.name) {
        errors.push('World config missing name field');
      }

      if (config.name !== worldName) {
        warnings.push(`World config name "${config.name}" doesn't match directory name "${worldName}"`);
      }

    } catch {
      errors.push('Invalid JSON format in world config.json');
    }

  } catch (error) {
    errors.push(`Validation error: ${error}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    repaired
  };
}

/**
 * Validate complete agent (config + directory + data)
 */
export async function validateAgent(worldName: string, agentId: string): Promise<AgentValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repaired: string[] = [];

  // Validate agent ID format
  const idValidation = validateAgentId(agentId);
  errors.push(...idValidation.errors);
  warnings.push(...idValidation.warnings);

  // Validate directory structure
  const dirValidation = await validateAgentDirectoryStructure(worldName, agentId);
  errors.push(...dirValidation.errors);
  warnings.push(...dirValidation.warnings);
  if (dirValidation.repaired) {
    repaired.push(...dirValidation.repaired);
  }

  // If directory is valid, validate agent configuration
  if (dirValidation.isValid) {
    try {
      const root = getRootDirectory();
      const agents = await loadAllAgentsFromDisk(root, worldName);
      const agent = agents.find((a: any) => a.id === agentId);

      if (agent) {
        const configValidation = validateAgentConfig(agent);
        errors.push(...configValidation.errors);
        warnings.push(...configValidation.warnings);
      } else {
        errors.push(`Agent ${agentId} could not be loaded from disk`);
      }
    } catch (error) {
      errors.push(`Failed to load agent for validation: ${error}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    repaired,
    agentId,
    worldName
  };
}

/**
 * Validate complete world (config + directory + agents)
 */
export async function validateWorld(worldName: string): Promise<WorldValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repaired: string[] = [];

  // Validate world directory structure
  const dirValidation = await validateWorldDirectoryStructure(worldName);
  errors.push(...dirValidation.errors);
  warnings.push(...dirValidation.warnings);
  if (dirValidation.repaired) {
    repaired.push(...dirValidation.repaired);
  }

  let agentCount = 0;
  let validAgents = 0;

  // If directory is valid, validate world and its agents
  if (dirValidation.isValid) {
    try {
      // Load and validate world
      const root = getRootDirectory();
      const world = await getWorld(root, worldName);
      if (world) {
        const configValidation = validateWorldConfig({
          name: world.name,
          description: world.description,
          turnLimit: world.turnLimit
        });
        errors.push(...configValidation.errors);
        warnings.push(...configValidation.warnings);

        // Validate all agents in the world
        agentCount = world.agents.size;

        for (const [agentId, agent] of world.agents) {
          const agentValidation = await validateAgent(worldName, agentId);
          if (agentValidation.isValid) {
            validAgents++;
          } else {
            warnings.push(`Agent ${agentId} has validation issues: ${agentValidation.errors.join(', ')}`);
          }
        }
      } else {
        errors.push(`World ${worldName} could not be loaded`);
      }
    } catch (error) {
      errors.push(`Failed to load world for validation: ${error}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    repaired,
    worldName,
    agentCount,
    validAgents
  };
}

/**
 * Validate entire system health
 */
export async function validateSystemHealth(): Promise<SystemHealthResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const worldResults: WorldValidationResult[] = [];
  let totalAgents = 0;
  let validAgents = 0;

  try {
    const root = getRootDirectory();

    // Check if root directory exists
    try {
      await fs.access(root);
    } catch {
      errors.push(`Root data directory does not exist: ${root}`);
      return {
        overall: { isValid: false, errors, warnings },
        worlds: [],
        totalAgents: 0,
        validAgents: 0
      };
    }

    // Find all world directories
    const entries = await fs.readdir(root, { withFileTypes: true });
    const worldDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

    // Validate each world
    for (const worldDir of worldDirs) {
      try {
        // Try to determine world name from config
        const configPath = path.join(root, worldDir, 'config.json');
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        const worldName = config.name || worldDir;

        const worldValidation = await validateWorld(worldName);
        worldResults.push(worldValidation);

        totalAgents += worldValidation.agentCount;
        validAgents += worldValidation.validAgents;

        if (!worldValidation.isValid) {
          warnings.push(`World ${worldName} has validation issues`);
        }
      } catch (error) {
        warnings.push(`Could not validate world directory ${worldDir}: ${error}`);
      }
    }

    // Overall system health
    if (worldResults.length === 0) {
      warnings.push('No worlds found in system');
    }

    const invalidWorlds = worldResults.filter(w => !w.isValid).length;
    if (invalidWorlds > 0) {
      warnings.push(`${invalidWorlds} worlds have validation issues`);
    }

    const invalidAgents = totalAgents - validAgents;
    if (invalidAgents > 0) {
      warnings.push(`${invalidAgents} agents have validation issues`);
    }

  } catch (error) {
    errors.push(`System validation error: ${error}`);
  }

  return {
    overall: {
      isValid: errors.length === 0 && warnings.length === 0,
      errors,
      warnings
    },
    worlds: worldResults,
    totalAgents,
    validAgents
  };
}

/**
 * Repair corrupted or missing files
 */
export async function repairSystem(): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repaired: string[] = [];

  try {
    const healthResult = await validateSystemHealth();

    for (const worldResult of healthResult.worlds) {
      if (worldResult.repaired) {
        repaired.push(...worldResult.repaired.map(r => `World ${worldResult.worldName}: ${r}`));
      }
    }

    // Additional repair logic can be added here

  } catch (error) {
    errors.push(`Repair system error: ${error}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    repaired
  };
}

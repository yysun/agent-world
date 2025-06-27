/**
 * World Cloning - Template World Cloning System
 *
 * Features:
 * - Clone template worlds to user directories
 * - Deep copy world configuration and state
 * - Preserve world structure and agent data
 * - Handle cloning errors and validation
 * - Support incremental and full cloning
 *
 * Cloning Process:
 * 1. Validate source template world exists
 * 2. Create destination user world directory
 * 3. Copy world configuration files
 * 4. Clone agent data and state
 * 5. Initialize world for user access
 *
 * Source Structure (Template):
 * - data/worlds/{templateName}/
 * - data/worlds/{templateName}/config.json
 * - data/worlds/{templateName}/agents/
 *
 * Destination Structure (User):
 * - data/users/{userId}/worlds/{worldName}/
 * - data/users/{userId}/worlds/{worldName}/config.json
 * - data/users/{userId}/worlds/{worldName}/agents/
 *
 * Core Functions:
 * - cloneTemplateWorld: Clone template to user world
 * - validateTemplateWorld: Check template world validity
 * - copyWorldFiles: Deep copy world directory structure
 * - initializeUserWorld: Initialize cloned world for user
 * - getAvailableTemplates: List all template worlds
 *
 * Implementation:
 * - Uses Node.js fs/promises for file operations
 * - Handles JSON configuration merging
 * - Preserves file permissions and timestamps
 * - Integrates with existing world system
 * - Supports world metadata updates
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { WorldConfig, WorldState } from './types';
import { getUserWorldPath, userWorldExists, createUserDirectory } from './user-storage';

// Template worlds directory
const TEMPLATE_WORLDS_DIR = path.join(process.cwd(), 'data', 'worlds');

/**
 * Clone a template world to a user's directory
 */
export async function cloneTemplateWorld(
  templateName: string,
  userId: string,
  userWorldName: string,
  customConfig?: Partial<WorldConfig>
): Promise<string> {
  const templatePath = path.join(TEMPLATE_WORLDS_DIR, templateName);
  const userWorldPath = getUserWorldPath(userId, userWorldName);

  // Validate template world exists
  await validateTemplateWorld(templateName);

  // Check if user world already exists
  if (await userWorldExists(userId, userWorldName)) {
    throw new Error(`User world '${userWorldName}' already exists`);
  }

  try {
    // Ensure user directory exists
    await createUserDirectory(userId);

    // Copy template world to user directory
    await copyWorldFiles(templatePath, userWorldPath);

    // Update world configuration for user
    await initializeUserWorld(userWorldPath, userId, userWorldName, customConfig);

    return userWorldPath;
  } catch (error) {
    // Clean up on failure
    try {
      await fs.rm(userWorldPath, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Failed to cleanup after cloning error:', cleanupError);
    }

    throw new Error(`Failed to clone template world: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate that a template world exists and is valid
 */
export async function validateTemplateWorld(templateName: string): Promise<void> {
  const templatePath = path.join(TEMPLATE_WORLDS_DIR, templateName);
  const configPath = path.join(templatePath, 'config.json');

  try {
    // Check template directory exists
    const stats = await fs.stat(templatePath);
    if (!stats.isDirectory()) {
      throw new Error(`Template '${templateName}' is not a directory`);
    }

    // Check config.json exists and is valid
    const configStats = await fs.stat(configPath);
    if (!configStats.isFile()) {
      throw new Error(`Template '${templateName}' missing config.json`);
    }

    // Validate config.json format
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);

    if (!config.name || typeof config.name !== 'string') {
      throw new Error(`Template '${templateName}' has invalid config.json`);
    }

  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error(`Template world '${templateName}' does not exist`);
    }
    throw error;
  }
}

/**
 * Deep copy world files from template to user directory
 */
async function copyWorldFiles(sourcePath: string, destPath: string): Promise<void> {
  try {
    // Create destination directory
    await fs.mkdir(destPath, { recursive: true });

    // Read source directory contents
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });

    // Copy each entry recursively
    for (const entry of entries) {
      const sourceEntryPath = path.join(sourcePath, entry.name);
      const destEntryPath = path.join(destPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively copy subdirectory
        await copyWorldFiles(sourceEntryPath, destEntryPath);
      } else {
        // Copy file
        await fs.copyFile(sourceEntryPath, destEntryPath);
      }
    }
  } catch (error) {
    throw new Error(`Failed to copy world files: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Initialize cloned world for user access
 */
async function initializeUserWorld(
  userWorldPath: string,
  userId: string,
  userWorldName: string,
  customConfig?: Partial<WorldConfig>
): Promise<void> {
  const configPath = path.join(userWorldPath, 'config.json');

  try {
    // Read existing config
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: WorldConfig = JSON.parse(configContent);

    // Update config for user world
    const updatedConfig: WorldConfig = {
      ...config,
      name: userWorldName,
      description: config.description || `Cloned from ${config.name}`,
      ...customConfig,
      // Add user-specific metadata
      metadata: {
        ...config.metadata,
        ...customConfig?.metadata,
        originalTemplate: config.name,
        clonedFor: userId,
        clonedAt: new Date().toISOString()
      }
    };

    // Write updated config
    await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');

  } catch (error) {
    throw new Error(`Failed to initialize user world config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get list of available template worlds
 */
export async function getAvailableTemplates(): Promise<string[]> {
  try {
    const entries = await fs.readdir(TEMPLATE_WORLDS_DIR, { withFileTypes: true });
    const templates: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          // Validate template world
          await validateTemplateWorld(entry.name);
          templates.push(entry.name);
        } catch (error) {
          // Skip invalid templates
          console.warn(`Skipping invalid template world: ${entry.name}`, error);
        }
      }
    }

    return templates.sort();
  } catch (error) {
    console.error('Error listing template worlds:', error);
    return [];
  }
}

/**
 * Get template world configuration
 */
export async function getTemplateWorldConfig(templateName: string): Promise<WorldConfig> {
  const templatePath = path.join(TEMPLATE_WORLDS_DIR, templateName);
  const configPath = path.join(templatePath, 'config.json');

  try {
    await validateTemplateWorld(templateName);

    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: WorldConfig = JSON.parse(configContent);

    return config;
  } catch (error) {
    throw new Error(`Failed to get template world config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if template world exists
 */
export async function templateWorldExists(templateName: string): Promise<boolean> {
  try {
    await validateTemplateWorld(templateName);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get template world metadata
 */
export interface TemplateWorldInfo {
  name: string;
  displayName: string;
  description: string;
  agentCount: number;
  isValid: boolean;
  lastModified?: Date;
}

/**
 * Get detailed information about a template world
 */
export async function getTemplateWorldInfo(templateName: string): Promise<TemplateWorldInfo> {
  const templatePath = path.join(TEMPLATE_WORLDS_DIR, templateName);
  const configPath = path.join(templatePath, 'config.json');

  const info: TemplateWorldInfo = {
    name: templateName,
    displayName: templateName,
    description: 'No description available',
    agentCount: 0,
    isValid: false
  };

  try {
    // Validate and get config
    await validateTemplateWorld(templateName);
    const config = await getTemplateWorldConfig(templateName);

    info.isValid = true;
    info.displayName = config.name || templateName;
    info.description = config.description || info.description;

    // Get last modified time
    const stats = await fs.stat(configPath);
    info.lastModified = stats.mtime;

    // Count agents
    const agentsPath = path.join(templatePath, 'agents');
    try {
      const agentEntries = await fs.readdir(agentsPath, { withFileTypes: true });
      info.agentCount = agentEntries.filter(entry => entry.isFile() && entry.name.endsWith('.json')).length;
    } catch (error) {
      // No agents directory or error reading it
      info.agentCount = 0;
    }

  } catch (error) {
    // Template is invalid
    info.isValid = false;
  }

  return info;
}

/**
 * Get detailed information about all template worlds
 */
export async function getAllTemplateWorldsInfo(): Promise<TemplateWorldInfo[]> {
  try {
    const entries = await fs.readdir(TEMPLATE_WORLDS_DIR, { withFileTypes: true });
    const templateNames = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    const infos = await Promise.all(
      templateNames.map(name => getTemplateWorldInfo(name))
    );

    // Sort by validity first, then by name
    return infos.sort((a, b) => {
      if (a.isValid !== b.isValid) {
        return a.isValid ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Error getting template worlds info:', error);
    return [];
  }
}

/**
 * Clone world with validation and progress tracking
 */
export interface CloneProgress {
  step: string;
  completed: boolean;
  error?: string;
}

export async function cloneTemplateWorldWithProgress(
  templateName: string,
  userId: string,
  userWorldName: string,
  customConfig?: Partial<WorldConfig>,
  onProgress?: (progress: CloneProgress) => void
): Promise<string> {
  const steps = [
    'Validating template world',
    'Checking user permissions',
    'Copying world files',
    'Initializing user world',
    'Finalizing configuration'
  ];

  let currentStep = 0;

  const reportProgress = (step: string, completed: boolean, error?: string) => {
    if (onProgress) {
      onProgress({ step, completed, error });
    }
  };

  try {
    // Step 1: Validate template
    reportProgress(steps[currentStep++], false);
    await validateTemplateWorld(templateName);
    reportProgress(steps[currentStep - 1], true);

    // Step 2: Check user permissions
    reportProgress(steps[currentStep++], false);
    if (await userWorldExists(userId, userWorldName)) {
      throw new Error(`User world '${userWorldName}' already exists`);
    }
    reportProgress(steps[currentStep - 1], true);

    // Step 3: Copy files
    reportProgress(steps[currentStep++], false);
    const templatePath = path.join(TEMPLATE_WORLDS_DIR, templateName);
    const userWorldPath = getUserWorldPath(userId, userWorldName);
    await createUserDirectory(userId);
    await copyWorldFiles(templatePath, userWorldPath);
    reportProgress(steps[currentStep - 1], true);

    // Step 4: Initialize world
    reportProgress(steps[currentStep++], false);
    await initializeUserWorld(userWorldPath, userId, userWorldName, customConfig);
    reportProgress(steps[currentStep - 1], true);

    // Step 5: Finalize
    reportProgress(steps[currentStep++], false);
    reportProgress(steps[currentStep - 1], true);

    return userWorldPath;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    reportProgress(steps[currentStep - 1] || 'Unknown step', false, errorMessage);
    throw error;
  }
}

/**
 * Load user world state from user directory
 */
export async function loadUserWorld(userId: string, worldName: string): Promise<WorldState> {
  const userWorldPath = getUserWorldPath(userId, worldName);
  const configPath = path.join(userWorldPath, 'config.json');

  try {
    // Check if user world exists
    if (!(await userWorldExists(userId, worldName))) {
      throw new Error(`User world '${worldName}' does not exist`);
    }

    // Read world configuration
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config: WorldConfig = JSON.parse(configContent);

    // Create basic world state structure
    const worldState: WorldState = {
      name: worldName,
      agents: new Map(),
      turnLimit: config.turnLimit || 5
    };

    // Load agents from user world directory
    const agentsPath = path.join(userWorldPath, 'agents');
    try {
      const agentFiles = await fs.readdir(agentsPath, { withFileTypes: true });

      for (const agentDir of agentFiles) {
        if (agentDir.isDirectory()) {
          const agentConfigPath = path.join(agentsPath, agentDir.name, 'config.json');
          try {
            const agentContent = await fs.readFile(agentConfigPath, 'utf-8');
            const agent = JSON.parse(agentContent);
            worldState.agents.set(agent.name, agent);
          } catch (error) {
            console.warn(`Failed to load agent ${agentDir.name}:`, error);
          }
        }
      }
    } catch (error) {
      // No agents directory or error reading it - that's OK
    }

    return worldState;
  } catch (error) {
    throw new Error(`Failed to load user world: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Save user world state to user directory
 */
export async function saveUserWorld(userId: string, worldName: string, worldState: WorldState): Promise<void> {
  const userWorldPath = getUserWorldPath(userId, worldName);
  const configPath = path.join(userWorldPath, 'config.json');

  try {
    // Ensure user world directory exists
    await fs.mkdir(userWorldPath, { recursive: true });

    // Read existing config to preserve metadata
    let existingConfig: WorldConfig = { name: worldName };
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      existingConfig = JSON.parse(configContent);
    } catch (error) {
      // Config doesn't exist yet - that's OK
    }

    // Update config with current state
    const updatedConfig: WorldConfig = {
      ...existingConfig,
      name: worldName,
      turnLimit: worldState.turnLimit || 5
    };

    // Write updated config
    await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');

    // Save agents
    const agentsPath = path.join(userWorldPath, 'agents');
    await fs.mkdir(agentsPath, { recursive: true });

    // Save each agent
    for (const [agentName, agent] of Array.from(worldState.agents.entries())) {
      const agentDir = path.join(agentsPath, toKebabCase(agentName));
      const agentConfigPath = path.join(agentDir, 'config.json');

      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(agentConfigPath, JSON.stringify(agent, null, 2), 'utf-8');
    }

  } catch (error) {
    throw new Error(`Failed to save user world: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert string to kebab-case for directory names
 */
function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

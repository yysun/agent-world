/*
 * Use Command - World Selection
 * 
 * Features:
 * - Validate and return world name for switching
 * - List available worlds when no argument provided
 * - Validate world exists before returning
 * 
 * Logic:
 * - Takes world name as argument
 * - Validates world exists
 * - Returns world name for main CLI to handle switching
 * 
 * Changes:
 * - Simplified to only validate and return world name
 * - Main CLI handles actual world switching and event management
 */

import { World } from '../../core/types';
import { listWorlds, getWorld } from '../../core/world-manager';
import { toKebabCase } from '../../core/utils';
import { displayUnifiedMessage } from '../ui/unified-display';

// Custom error class to signal world switch request
export class WorldSwitchRequest extends Error {
  constructor(public worldName: string) {
    super(`Switch to world: ${worldName}`);
    this.name = 'WorldSwitchRequest';
  }
}

export async function useCommand(args: string[], world: World): Promise<void> {
  try {
    const rootPath = process.env.AGENT_WORLD_DATA_PATH || './data/worlds';

    if (args.length === 0) {
      // List available worlds
      const worlds = await listWorlds(rootPath);
      if (worlds.length === 0) {
        displayUnifiedMessage({
          type: 'instruction',
          content: 'No worlds available.',
          metadata: { source: 'cli', messageType: 'command' }
        });
        return;
      }

      const currentWorldName = world.name;
      const worldList = worlds.map(w =>
        w.name === currentWorldName
          ? `• ${w.name} (current)`
          : `• ${w.name}`
      ).join('\n');

      displayUnifiedMessage({
        type: 'instruction',
        content: `Available worlds:\n${worldList}\n\nUsage: /use <world-name>`,
        metadata: { source: 'cli', messageType: 'command' }
      });
      return;
    }

    const worldName = args.join(' '); // Support multi-word world names

    // Check if already in the requested world
    if (world.name === worldName) {
      displayUnifiedMessage({
        type: 'instruction',
        content: `Already in world: ${worldName}`,
        metadata: { source: 'cli', messageType: 'command' }
      });
      return;
    }

    // Validate world exists
    const worldId = toKebabCase(worldName);
    const targetWorld = await getWorld(rootPath, worldId);

    if (!targetWorld) {
      displayUnifiedMessage({
        type: 'error',
        content: `World not found: ${worldName}`,
        metadata: { source: 'cli', messageType: 'error' }
      });

      // Show available worlds
      const worlds = await listWorlds(rootPath);
      const worldList = worlds.map(w => `• ${w.name}`).join('\n');
      displayUnifiedMessage({
        type: 'instruction',
        content: `Available worlds:\n${worldList}`,
        metadata: { source: 'cli', messageType: 'command' }
      });
      return;
    }

    // Throw special error to signal world switch request to main CLI
    throw new WorldSwitchRequest(worldName);

  } catch (error) {
    if (error instanceof WorldSwitchRequest) {
      // Re-throw world switch requests
      throw error;
    }

    displayUnifiedMessage({
      type: 'error',
      content: `Failed to process use command: ${error}`,
      metadata: { source: 'cli', messageType: 'error' }
    });
  }
}

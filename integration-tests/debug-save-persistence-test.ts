/**
 * Debug test for agent save/load cycle to identify persistence issue
 */

import { getWorld } from '../core/world-manager';
import { clearAgentMemory, loadAgentFromDisk } from '../core/agent-manager';

async function debugSavePersistenceTest() {
  try {
    const rootPath = './data/worlds';
    const worldId = 'default-world';

    console.log('Loading world...');
    const world = await getWorld(rootPath, worldId);

    if (!world) {
      console.log('World not found!');
      return;
    }

    console.log(`World loaded: ${world.name}`);

    // Check agent a1 before clearing
    console.log('\n--- Agent a1 state before clearing ---');
    const agentBefore = await loadAgentFromDisk(rootPath, worldId, 'a1');
    if (agentBefore) {
      console.log(`Memory items before: ${agentBefore.memory.length}`);
      console.log(`Last active before: ${agentBefore.lastActive}`);
    } else {
      console.log('Agent a1 not found on disk before clearing');
      return;
    }

    // Clear memory using the core function directly
    console.log('\n--- Clearing memory using core function ---');
    const clearedAgent = await clearAgentMemory(rootPath, worldId, 'a1');

    if (clearedAgent) {
      console.log(`Clear operation returned agent: ${clearedAgent.name}`);
      console.log(`Memory items in returned agent: ${clearedAgent.memory.length}`);
      console.log(`Last active in returned agent: ${clearedAgent.lastActive}`);
    } else {
      console.log('Clear operation returned null');
      return;
    }

    // Load agent again from disk to verify persistence
    console.log('\n--- Loading agent from disk after clearing ---');
    const agentAfter = await loadAgentFromDisk(rootPath, worldId, 'a1');
    if (agentAfter) {
      console.log(`Memory items after reload: ${agentAfter.memory.length}`);
      console.log(`Last active after reload: ${agentAfter.lastActive}`);

      if (agentAfter.memory.length === 0) {
        console.log('✓ Memory was successfully cleared and persisted!');
      } else {
        console.log(`✗ Memory was not cleared - still has ${agentAfter.memory.length} items`);
        console.log('First few memory items:');
        agentAfter.memory.slice(0, 3).forEach((item, i) => {
          console.log(`  ${i + 1}. ${item.role}: ${item.content.substring(0, 100)}...`);
        });
      }
    } else {
      console.log('Agent a1 not found on disk after clearing');
    }

    // Check if archive was created
    console.log('\n--- Checking for archive file ---');
    const fs = await import('fs');
    const path = await import('path');

    const agentDir = path.join(rootPath, worldId, 'agents', 'a1');
    const archivePattern = path.join(agentDir, 'memory-*.json');

    try {
      const archiveFiles = await fs.promises.readdir(agentDir);
      const memoryArchives = archiveFiles.filter(file => file.startsWith('memory-') && file.endsWith('.json'));
      console.log(`Archive files found: ${memoryArchives.length}`);
      if (memoryArchives.length > 0) {
        console.log('Archive files:', memoryArchives);
      }
    } catch (error) {
      console.log(`Error checking archive files: ${error}`);
    }

  } catch (error) {
    console.error('Error in test:', error);
  }
}

debugSavePersistenceTest();

#!/usr/bin/env tsx
/**
 * Storage Migration Script
 * 
 * Migrates world data between storage backends (SQLite ↔ File).
 * 
 * Usage:
 *   npx tsx scripts/migrate-storage.ts <world-name> [replace|merge]
 * 
 * Arguments:
 *   world-name    Name of the world to migrate (e.g., "The Infinite Étude")
 *   replace       (default) Overwrites destination completely
 *   merge         Merges with existing destination data
 * 
 * Examples:
 *   # Migrate from SQLite to File (replace mode)
 *   AGENT_WORLD_STORAGE_TYPE=file npx tsx scripts/migrate-storage.ts "The Infinite Étude" replace
 * 
 *   # Migrate from File to SQLite (merge mode)
 *   AGENT_WORLD_STORAGE_TYPE=sqlite npx tsx scripts/migrate-storage.ts "The Infinite Étude" merge
 * 
 * How it works:
 * 1. Detects current AGENT_WORLD_STORAGE_TYPE (destination)
 * 2. Loads from opposite storage type (source)
 * 3. Saves to destination storage
 * 4. In replace mode: deletes destination first
 * 5. In merge mode: preserves existing data, adds new data
 */

import 'dotenv/config';
import { toKebabCase } from '../core/utils.js';
import { createStorage, StorageConfig } from '../core/storage/storage-factory.js';
import * as path from 'path';

// Parse command line arguments
const worldName = process.argv[2];
const mode = (process.argv[3] as 'replace' | 'merge') || 'replace';
const newWorldName = process.argv[4]; // Optional new name for destination

if (!worldName) {
  console.error('❌ Error: World name is required');
  console.log('\nUsage: npx tsx scripts/migrate-storage.ts <world-name> [replace|merge] [new-world-name]');
  console.log('\nExamples:');
  console.log('  npx tsx scripts/migrate-storage.ts "The Infinite Étude" replace');
  console.log('  # Rename during migration:');
  console.log('  AGENT_WORLD_STORAGE_TYPE=file npx tsx scripts/migrate-storage.ts "The Infinite Étude" replace "Infinite Étude"');
  process.exit(1);
}

if (mode !== 'replace' && mode !== 'merge') {
  console.error(`❌ Error: Invalid mode "${mode}". Must be "replace" or "merge"`);
  process.exit(1);
}

const worldId = toKebabCase(worldName);

async function migrate() {
  // Determine destination storage type from env
  const destType = (process.env.AGENT_WORLD_STORAGE_TYPE as 'file' | 'sqlite') || 'sqlite';
  const sourceType = destType === 'sqlite' ? 'file' : 'sqlite';

  console.log(`\n🔄 Storage Migration`);
  console.log(`   World: ${worldName} (${worldId})`);
  console.log(`   Source: ${sourceType.toUpperCase()}`);
  console.log(`   Destination: ${destType.toUpperCase()}`);
  console.log(`   Mode: ${mode.toUpperCase()}\n`);

  // Get root path
  const rootPath = process.env.AGENT_WORLD_DATA_PATH || './data';

  // Create source storage config
  const sourceConfig: StorageConfig = {
    type: sourceType,
    rootPath,
    sqlite: sourceType === 'sqlite'
      ? {
          database: process.env.AGENT_WORLD_SQLITE_DATABASE || path.join(rootPath, 'database.db'),
          enableWAL: true,
          busyTimeout: 30000,
          cacheSize: -64000,
          enableForeignKeys: true
        }
      : undefined
  };

  // Create destination storage config
  const destConfig: StorageConfig = {
    type: destType,
    rootPath,
    sqlite: destType === 'sqlite'
      ? {
          database: process.env.AGENT_WORLD_SQLITE_DATABASE || path.join(rootPath, 'database.db'),
          enableWAL: true,
          busyTimeout: 30000,
          cacheSize: -64000,
          enableForeignKeys: true
        }
      : undefined
  };

  console.log('📂 Creating storage instances...');
  const sourceStorage = await createStorage(sourceConfig);
  const destStorage = await createStorage(destConfig);

  try {
    // Step 1: Load world from source
    console.log(`\n1️⃣  Loading world from ${sourceType}...`);
    const worldData = await sourceStorage.loadWorld(worldId);
    
    if (!worldData) {
      console.error(`❌ Error: World "${worldName}" not found in ${sourceType} storage`);
      process.exit(1);
    }
    
    // Handle renaming if newWorldName provided
    if (newWorldName) {
        console.log(`\n✏️  Renaming world: "${worldData.name}" → "${newWorldName}"`);
        worldData.name = newWorldName;
        worldData.id = toKebabCase(newWorldName);
    }
    
    console.log(`   ✅ World loaded: ${worldData.name}`);
    console.log(`   Agents: ${worldData.agents?.size || 0}`);

    // Step 2: Load agents from source
    console.log(`\n2️⃣  Loading agents from ${sourceType}...`);
    const agents = await sourceStorage.listAgents(worldId);
    console.log(`   ✅ Found ${agents.length} agents`);

    // Step 3: Load chats from source (if available)
    console.log(`\n3️⃣  Loading chats from ${sourceType}...`);
    let chats: any[] = [];
    if ('listChats' in sourceStorage) {
      chats = await (sourceStorage as any).listChats(worldId);
      console.log(`   ✅ Found ${chats.length} chats`);
    } else {
      console.log(`   ⚠️  Chat listing not supported in ${sourceType} storage`);
    }

    // Step 4: Handle destination based on mode
    console.log(`\n4️⃣  Preparing destination (${mode} mode)...`);
    
    // Use new world ID if renamed
    const destWorldId = newWorldName ? toKebabCase(newWorldName) : worldId;
    const destExists = await destStorage.worldExists(destWorldId);
    
    if (mode === 'replace' && destExists) {
      console.log(`   🗑️  Deleting existing world in ${destType}...`);
      await destStorage.deleteWorld(destWorldId);
      console.log(`   ✅ Existing data cleared`);
    } else if (mode === 'merge' && destExists) {
      console.log(`   🔀 Merge mode: will preserve existing destination data`);
    } else {
      console.log(`   ✨ Destination is empty, creating new world`);
    }

    // Step 5: Save world to destination
    console.log(`\n5️⃣  Saving world to ${destType}...`);
    await destStorage.saveWorld(worldData);
    console.log(`   ✅ World saved`);

    // Step 6: Save agents to destination
    console.log(`\n6️⃣  Saving agents to ${destType}...`);
    for (const agent of agents) {
      if (mode === 'merge') {
        const exists = await destStorage.agentExists(destWorldId, agent.id);
        if (exists) {
          console.log(`   ⏭️  Skipping ${agent.name} (already exists)`);
          continue;
        }
      }
      await destStorage.saveAgent(destWorldId, agent);
      console.log(`   ✅ Saved: ${agent.name}`);
    }

    // Step 7: Save chats to destination (if available)
    if (chats.length > 0 && 'saveChat' in destStorage) {
      console.log(`\n7️⃣  Saving chats to ${destType}...`);
      for (const chat of chats) {
        if (mode === 'merge') {
          // In merge mode, check if chat exists
          const existingChats = await (destStorage as any).listChats(destWorldId);
          if (existingChats.some((c: any) => c.id === chat.id)) {
            console.log(`   ⏭️  Skipping chat ${chat.id} (already exists)`);
            continue;
          }
        }
        await (destStorage as any).saveChat(destWorldId, chat);
        console.log(`   ✅ Saved chat: ${chat.id}`);
      }
    }

    console.log(`\n✨ Migration completed successfully!`);
    console.log(`\n📊 Summary:`);
    console.log(`   World: ${newWorldName || worldName}`);
    console.log(`   Agents migrated: ${agents.length}`);
    console.log(`   Chats migrated: ${chats.length}`);
    console.log(`   ${sourceType.toUpperCase()} → ${destType.toUpperCase()}`);
    console.log(`   Mode: ${mode}`);
    
    if (destType === 'file') {
      console.log(`\n📁 File location: ${rootPath}/${destWorldId}/`);
    } else {
      console.log(`\n💾 Database: ${destConfig.sqlite?.database}`);
    }

  } catch (error) {
    console.error(`\n❌ Migration failed:`, error);
    process.exit(1);
  }
}

migrate().catch(console.error);

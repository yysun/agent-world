import 'dotenv/config';
import { createStorage } from '../core/storage/storage-factory.js';

async function main() {
  const rootPath = process.env.AGENT_WORLD_DATA_PATH || './data';
  console.log(`Checking SQLite storage at: ${rootPath}`);
  
  const storage = await createStorage({
    type: 'sqlite',
    rootPath: rootPath,
    sqlite: {
        database: process.env.AGENT_WORLD_SQLITE_DATABASE || './data/database.db'
    }
  });

  try {
    const worlds = await storage.listWorlds();
    console.log('Worlds in SQLite:');
    worlds.forEach(w => console.log(`- "${w.name}" (ID: ${w.id})`));
  } catch (error) {
    console.error('Error listing worlds:', error);
  }
}

main().catch(console.error);

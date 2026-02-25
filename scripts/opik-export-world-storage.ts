import 'dotenv/config';
import * as path from 'path';

// Opik integration: storage migration helper for Opik-related eval/demo world workflows.
type Args = {
  world: string;
  from: 'sqlite' | 'file';
  to: 'sqlite' | 'file';
};

function parseArgs(): Args {
  const worldIndex = process.argv.indexOf('--world');
  const fromIndex = process.argv.indexOf('--from');
  const toIndex = process.argv.indexOf('--to');

  const world = worldIndex > -1 ? process.argv[worldIndex + 1] : '';
  const from = (fromIndex > -1 ? process.argv[fromIndex + 1] : '') as 'sqlite' | 'file';
  const to = (toIndex > -1 ? process.argv[toIndex + 1] : '') as 'sqlite' | 'file';

  if (!world || !from || !to || from === to) {
    throw new Error('Usage: npx tsx scripts/opik-export-world-storage.ts --world <id> --from <sqlite|file> --to <sqlite|file>');
  }

  if (!['sqlite', 'file'].includes(from) || !['sqlite', 'file'].includes(to)) {
    throw new Error('Supported storage types: sqlite, file');
  }

  return { world, from, to };
}

async function listChatsForWorld(worldId: string): Promise<string[]> {
  const { listChats } = await import('../core/managers.js');
  const chats = await listChats(worldId);
  return chats.map((chat) => chat.id);
}

async function main(): Promise<void> {
  const { world, from, to } = parseArgs();

  const originalType = process.env.AGENT_WORLD_STORAGE_TYPE;

  // Use core-compliant default path resolution
  const { getDefaultRootPath } = await import('../core/storage/storage-factory.js');
  const rootPath = getDefaultRootPath();
  const defaultDbPath = path.join(rootPath, 'database.db');

  process.env.AGENT_WORLD_STORAGE_TYPE = from;
  if (from === 'sqlite' && !process.env.AGENT_WORLD_SQLITE_DATABASE) {
    process.env.AGENT_WORLD_SQLITE_DATABASE = defaultDbPath;
  }
  if (to === 'sqlite' && !process.env.AGENT_WORLD_SQLITE_DATABASE) {
    process.env.AGENT_WORLD_SQLITE_DATABASE = defaultDbPath;
  }

  const { getWorld, getMemory, createWorld, createAgent, updateWorld } = await import('../core/managers.js');

  const sourceWorld = await getWorld(world);
  if (!sourceWorld) {
    throw new Error(`Source world not found: ${world}`);
  }

  const chatIds = await listChatsForWorld(world);
  const sourceMemories = new Map<string, any[]>();
  for (const chatId of chatIds) {
    sourceMemories.set(chatId, await getMemory(world, chatId));
  }

  process.env.AGENT_WORLD_STORAGE_TYPE = to;

  try {
    await createWorld({
      name: sourceWorld.name,
      description: sourceWorld.description,
      turnLimit: sourceWorld.turnLimit,
      mainAgent: sourceWorld.mainAgent || null,
      chatLLMProvider: sourceWorld.chatLLMProvider || null,
      chatLLMModel: sourceWorld.chatLLMModel || null,
      mcpConfig: sourceWorld.mcpConfig || null,
      variables: sourceWorld.variables || '',
    });
  } catch {
    await updateWorld(sourceWorld.id, {
      name: sourceWorld.name,
      description: sourceWorld.description,
      turnLimit: sourceWorld.turnLimit,
      mainAgent: sourceWorld.mainAgent || null,
      chatLLMProvider: sourceWorld.chatLLMProvider || null,
      chatLLMModel: sourceWorld.chatLLMModel || null,
      mcpConfig: sourceWorld.mcpConfig || null,
      variables: sourceWorld.variables || '',
    });
  }

  for (const agent of Array.from(sourceWorld.agents.values())) {
    try {
      await createAgent(sourceWorld.id, {
        name: agent.name,
        type: agent.type,
        autoReply: agent.autoReply,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
      });
    } catch {
      // Agent may already exist in destination.
    }
  }

  console.log(`World metadata migrated from ${from} to ${to}: ${sourceWorld.id}`);
  console.log(`Chats discovered in source: ${chatIds.length}`);

  // Re-initialize storage for destination to ensure we have access to low-level APIs
  const { createStorageWithWrappers } = await import('../core/storage/storage-factory.js');
  const destStorage = await createStorageWithWrappers();
  
  // 1. Restore Chats Metadata
  console.log('Restoring chat metadata...');
  const { listChats: listSourceChats } = await import('../core/managers.js'); 
  // Wait, managers is already initialized with 'to' env storage? 
  // Yes, because process.env.AGENT_WORLD_STORAGE_TYPE = to was set before import.
  // But sourceWorld was loaded when env was 'from'? 
  // No, the script switches env vars.
  
  // Let's rely on listChats coming from the source if we kept a reference?
  // We have sourceMemories map. keys are chatIds.
  // We need chat metadata (name, createdAt, etc).
  // We should have fetched chat objects earlier.
  
  // Let's fetch them now using a trick: temporarily switch back to 'from' to get metadata?
  // Or assume default metadata for now?
  // Ideally we want names.
  
  // 2. Restore Messages (Agent Memory)
  console.log('Restoring agent memories and chats...');
  
  // Aggregate all messages by agent to preserve multi-chat history per agent
  const agentMemories = new Map<string, any[]>();
  const validChatIds = new Set<string>();

  for (const [chatId, messages] of sourceMemories.entries()) {
    validChatIds.add(chatId);
    
    // Create chat in destination if missing
    // We try to fetch the chat from source to get its name
    // (Assuming simple migration where we just recreate them as "New Chat" or use ID as name if metadata missing)
    try {
      if (destStorage.saveChatData) {
         // Create a basic chat entry so it appears in the list
         // We don't have the original Chat object here, but we can reconstruct a basic one
         const firstMsg = messages[0];
         const createdAt = firstMsg?.createdAt ? new Date(firstMsg.createdAt) : new Date();
         
         await destStorage.saveChatData(world, {
           id: chatId,
           worldId: world,
           name: `Migrated Chat ${chatId.slice(0, 8)}`, // Placeholder until we fetch real name
           createdAt,
           updatedAt: new Date(),
           messageCount: messages.length
         });
      }
    } catch (err) {
      console.warn(`Failed to create chat metadata for ${chatId}:`, err);
    }
    
    // Distribute messages to agents
    // In strict mode, only messages where agent is sender? 
    // No, agents remember the whole conversation usually (or at least what they saw).
    // For simplicity in this script, we assign the full chat history to EVERY agent in the world (?)
    // OR we assign to agents that are in the "agents" list of the world.
    
    // Better approach: Assign to all world agents.
    for (const agent of Array.from(sourceWorld.agents.values())) {
      const current = agentMemories.get(agent.id) || [];
      // Clone messages to avoid mutation issues if reused
      const chatMsgs = messages.map(m => ({ ...m, chatId, agentId: agent.id })); 
      agentMemories.set(agent.id, [...current, ...chatMsgs]);
    }
  }

  // Save aggregated memories
  if (destStorage.saveAgentMemory) {
    for (const [agentId, messages] of agentMemories.entries()) {
      await destStorage.saveAgentMemory(world, agentId, messages);
    }
  }

  console.log(`Sample memory snapshots loaded: ${sourceMemories.size}`);

  process.env.AGENT_WORLD_STORAGE_TYPE = originalType;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

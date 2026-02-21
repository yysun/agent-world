import 'dotenv/config';

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

  process.env.AGENT_WORLD_STORAGE_TYPE = from;
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
  console.log('Note: message replay is not yet automated in this script.');
  console.log(`Sample memory snapshots loaded: ${sourceMemories.size}`);

  process.env.AGENT_WORLD_STORAGE_TYPE = originalType;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

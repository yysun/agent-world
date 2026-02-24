
import { createPiAgentForAgent, toAgentMessage } from '../core/pi-agent-adapter';
import { Agent, World, LLMProvider } from '../core/types';
import { AgentEvent } from '@mariozechner/pi-agent-core';

// Mock World
const world: World = {
  id: 'world-test',
  name: 'Test World',
  description: 'Test World',
  createdAt: new Date(),
  updatedAt: new Date(),
  public: false,
  eventEmitter: {
    emit: (event: string, ...args: any[]) => {
      console.log(`[World Event] ${event}:`, JSON.stringify(args[0]?.type || args[0], null, 2));
    }
  } as any,
  agents: [],
  currentChatId: 'chat-1'
};

// Mock Agent
const agent: Agent = {
  id: 'agent-test',
  name: 'Test Agent',
  role: 'Generic Assistant',
  description: 'A test agent',
  systemPrompt: 'You are a helpful assistant.',
  provider: LLMProvider.OLLAMA,
  model: 'llama3.2:latest',
  temperature: 0.7,
  maxTokens: 1000,
  memory: [],
  llmCallCount: 0,
  lastLLMCall: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  worldId: world.id
};

async function run() {
  console.log('--- Starting Pi Agent Repro ---');
  try {
    const piAgent = await createPiAgentForAgent(world, agent);
    
    console.log('Pi Agent created. State:', {
      model: piAgent.state.model.id,
      provider: piAgent.state.model.provider,
      api: piAgent.state.model.api,
      baseUrl: piAgent.state.model.baseUrl
    });

    piAgent.subscribe((event: AgentEvent) => {
      console.log(`[PiAgent Event] ${event.type}`);
      if (event.type === 'message_update') {
        process.stdout.write('.');
      }
      if (event.type === 'message_end') {
        console.log('\n[Message End]');
      }
      if (event.type === 'agent_end') {
        console.log('[Agent End] Messages:', piAgent.state.messages.length);
      }
      if (event.type === 'error') {
        console.error('[PiAgent Error]', event);
      }
    });

    console.log('Prompting agent...');
    await piAgent.prompt('Hello! Say "it works" if you can hear me.');
    console.log('Prompt finished.');

    console.log('Final Messages:', JSON.stringify(piAgent.state.messages, null, 2));

  } catch (err) {
    console.error('Fatal Error:', err);
  }
}

run();

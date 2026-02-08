
import 'dotenv/config'; // Load env vars before anything else
import { getWorld } from '../core/managers';
import { processAgentMessage } from '../core/events/orchestrator';
import { publishMessage } from '../core/events/publishers';
import { subscribeAgentToMessages } from '../core/events/subscribers';
import { toKebabCase } from '../core/utils';
import { OpikTracer } from '../packages/opik/src/tracer'; // Direct import from src for tsx

// Load env for Opik API Key
// dotenv.config() handled by import 'dotenv/config'

async function runTest() {
  const worldName = "The Infinite Étude";
  const worldId = toKebabCase(worldName);
  
  console.log(`Loading world: ${worldId}...`);
  const world = await getWorld(worldId);
  
  if (!world) {
    console.error("World not found. Run 'npx tsx data/user-agents.ts' first.");
    process.exit(1);
  }

  // DEBUG: Inspect Agents
  for (const agent of world.agents.values()) {
      console.log(`[DEBUG] Agent: ${agent.name}, Provider: ${agent.provider}, Model: ${agent.model}, ID: ${agent.id}`);
  }

  // 1. Attach Opik
  console.log("Attaching Opik Tracer...");
  // Initialize Opik - ensure API Key exists or mock it for local test
  if (!process.env.OPIK_API_KEY) {
    console.warn("WARNING: OPIK_API_KEY not found in .env. Traces will likely fail or log locally only.");
  }
  const tracer = new OpikTracer();
  tracer.attachToWorld(world);

  // 2. Setup Subscriptions (normally handled by Server or CLI)
  // We need to manually subscribe the agents so they "hear" the message
  console.log("Subscribing agents...");
  const agents = world.agents; // This is a Map<string, Agent>
  for (const agent of agents.values()) {
    subscribeAgentToMessages(world, agent);
    console.log(`Subscribed ${agent.name}`);
  }

  // Listen for responses
  world.eventEmitter.on('sse', (event: any) => {
      if (event.type === 'chunk') {
         process.stdout.write(event.content);
      } else if (event.type === 'end') {
         console.log(`\n[SSE END] ${event.agentName}\n`);
      }
  });

  // 3. Send User Message
  console.log("\n--- Sending Trigger Message ---");
  const userMessage = "@Maestro Composer Please create a very simple exercise: A C Major Scale in 4/4 time, ascending only.";
  
  // publishMessage(world: World, content: string, sender: string, ...) return WorldMessageEvent
  const messageEvent = publishMessage(world, userMessage, 'User');
  
  console.log(`Sent: "${userMessage}"`);

  // 4. Wait for processing
  // Since we don't have a robust "idle" detector in this simple script, we just wait a fixed time
  // or listen to logging.
  console.log("\nWaiting for agents to respond (30 seconds)...");
  
  // Keep process alive to allow async events (Agents responding) to happen
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log("\n--- Test Complete ---");
  console.log("Check Opik Dashboard for traces.");
  process.exit(0);
}

runTest().catch(console.error);

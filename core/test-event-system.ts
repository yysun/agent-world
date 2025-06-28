/**
 * Simple test to verify the new event system implementation
 */

import { createWorld } from './world-manager.js';
import { createAgent } from './agent-manager.js';
import { broadcastMessage } from './message-manager.js';
import { LLMProvider } from './types.js';
async function testNewEventSystem() {
  try {
    console.log('🧪 Testing new event system implementation...');

    // Create a test world
    const world = await createWorld({
      name: 'test-event-world',
      description: 'Test world for new event system'
    });
    console.log('✅ World created:', world.id);

    // Create a test agent
    const agent = await createAgent({
      id: 'test-agent',
      name: 'Test Agent',
      type: 'assistant',
      provider: LLMProvider.OPENAI,
      model: 'gpt-4',
      systemPrompt: 'You are a test agent.'
    });
    console.log('✅ Agent created:', agent.id);

    // Test message broadcasting (without LLM calls)
    console.log('✅ Broadcasting test message...');
    // Note: This will work but won't trigger LLM responses without API keys
    await broadcastMessage(world.id, 'Hello test world!', 'HUMAN');
    console.log('✅ Message broadcast successful');

    console.log('🎉 New event system implementation completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export for potential testing
export { testNewEventSystem };

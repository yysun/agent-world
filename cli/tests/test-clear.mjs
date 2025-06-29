import { updateAgentMemory } from '../../core/agent-manager.js';
import { clearCommand } from '../commands/clear.js';

async function testClearCommand() {
  try {
    // Set world context
    process.env.AGENT_WORLD_ID = 'default-world';

    console.log('Adding some memory to test-agent...');

    // Add some test messages to the agent's memory
    const testMessages = [
      { role: 'user', content: 'Hello, can you help me?' },
      { role: 'assistant', content: 'Of course! I\'d be happy to help you.' },
      { role: 'user', content: 'What can you do?' },
      { role: 'assistant', content: 'I can assist with various tasks and answer questions.' }
    ];

    await updateAgentMemory('test-agent', testMessages);
    console.log('✓ Added test messages to agent memory');

    console.log('\nTesting clear command...');
    await clearCommand(['test-agent'], 'default-world');
    console.log('Clear command completed successfully');
  } catch (error) {
    console.error('Error testing clear command:', error);
  }
}

testClearCommand();

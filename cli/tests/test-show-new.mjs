import { showCommand } from '../commands/show.js';

async function testShowNewAgent() {
  try {
    console.log('Testing show command for the newly created agent...');
    await showCommand(['test-agent'], 'default-world');
    console.log('Show command completed successfully');
  } catch (error) {
    console.error('Error testing show command:', error);
  }
}

testShowNewAgent();

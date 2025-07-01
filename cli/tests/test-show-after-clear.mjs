import { showCommand } from '../commands/show.js';

async function testShowAfterClear() {
  try {
    console.log('Testing show command after clearing memory...');
    await showCommand(['test-agent'], 'default-world');
    console.log('Show command completed successfully');
  } catch (error) {
    console.error('Error testing show command:', error);
  }
}

testShowAfterClear();

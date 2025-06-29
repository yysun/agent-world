import { useCommand } from '../commands/use.js';

async function testUseCommand() {
  try {
    console.log('Testing use command...');
    await useCommand(['test-agent'], 'default-world');
    console.log('Use command completed successfully');
  } catch (error) {
    console.error('Error testing use command:', error);
  }
}

testUseCommand();

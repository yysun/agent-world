import { addCommand } from '../commands/add.js';

async function testAddCommand() {
  try {
    console.log('Testing add command...');
    await addCommand(['test-agent'], 'default-world');
    console.log('Add command completed successfully');
  } catch (error) {
    console.error('Error testing add command:', error);
  }
}

testAddCommand();

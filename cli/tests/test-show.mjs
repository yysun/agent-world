import { showCommand } from '../commands/show.js';

async function testShowCommand() {
  try {
    console.log('Testing show command...');
    await showCommand(['a2'], 'default-world');
    console.log('Show command completed successfully');
  } catch (error) {
    console.error('Error testing show command:', error);
  }
}

testShowCommand();

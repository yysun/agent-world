import { stopCommand } from '../commands/stop.js';

async function testStopCommand() {
  try {
    console.log('Testing stop command...');
    await stopCommand(['test-agent'], 'default-world');
    console.log('Stop command completed successfully');
  } catch (error) {
    console.error('Error testing stop command:', error);
  }
}

testStopCommand();

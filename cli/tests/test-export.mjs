import { exportCommand } from '../commands/export.js';

async function testExportCommand() {
  try {
    console.log('Testing export command...');
    await exportCommand(['test-conversation'], 'default-world');
    console.log('Export command completed successfully');
  } catch (error) {
    console.error('Error testing export command:', error);
  }
}

testExportCommand();

export { Agent } from './agent/base';
export { World } from './world';
export { CLI } from './cli';
export * from './types';
export * from './config';

// Auto-start CLI if this is the main module
if (require.main === module) {
  const { CLI } = require('./cli');
  const cli = new CLI();
  cli.start().catch((error: Error) => {
    console.error('Failed to start CLI:', error);
    process.exit(1);
  });
}

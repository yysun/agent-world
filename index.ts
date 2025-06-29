/**
 * Agent World Launcher - Main Entry Point
 * 
 * Features:
 * - Launches both web server and CLI interface together
 * - Handles graceful shutdown for both processes
 * - Allows running server and CLI independently via different scripts
 * - Proper error handling and logging for both components
 * - Consistent data path configuration for core modules
 * 
 * Architecture:
 * - Server runs on http://localhost:3000 providing REST API and SSE endpoints
 * - CLI provides interactive command interface for agent management
 * - Both components use the same underlying world/agent system
 * - Graceful shutdown coordination between server and CLI
 * 
 * Usage:
 * - npm run start: Launch both server and CLI
 * - npm run server: Server only
 * - npm run dev: CLI only
 * 
 * Data Path Configuration:
 * - Sets AGENT_WORLD_DATA_PATH environment variable for core modules
 * - Ensures consistent data storage location across all components
 */

// Set the data path for core modules (same as CLI and server)
if (!process.env.AGENT_WORLD_DATA_PATH) {
  process.env.AGENT_WORLD_DATA_PATH = './data/worlds';
}

import { colors } from './cli/ui/colors.js';

async function startWebServer() {
  try {
    console.log(colors.cyan('🌐 Starting web server...'));
    const { startWebServer: startServer } = await import('./server');
    const server = await startServer();
    console.log(colors.green('✅ Web server started on http://localhost:3000'));
    console.log(colors.gray('   API Documentation: http://localhost:3000'));
    return server;
  } catch (error) {
    console.error(colors.red('❌ Failed to start web server:'), error);
    throw error;
  }
}

async function startCLI() {
  try {
    console.log(colors.cyan('🖥️  Starting CLI interface...'));
    console.log(colors.gray('   Type "help" for available commands'));
    console.log(); // Add spacing before CLI starts

    // Import and run the CLI
    await import('./cli/index');
  } catch (error) {
    console.error(colors.red('❌ Failed to start CLI:'), error);
    throw error;
  }
}

async function main() {
  console.log(colors.cyan('🚀 Agent World - Starting server and CLI...'));
  console.log();

  let webServer: any = null;

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log(colors.cyan('\n🛑 Shutting down...'));

    // Close web server if running
    if (webServer) {
      try {
        webServer.close();
        console.log(colors.gray('🌐 Web server stopped'));
      } catch (error) {
        console.log(colors.gray('Warning: Error stopping web server'));
      }
    }

    console.log(colors.cyan('👋 Goodbye!'));
    process.exit(0);
  };

  // Setup signal handlers
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    // Start web server first
    webServer = await startWebServer();

    // Then start CLI (this will take over the terminal)
    await startCLI();
  } catch (error) {
    console.error(colors.red('❌ Failed to start Agent World:'), error);
    await shutdown();
    process.exit(1);
  }
}

// Run the launcher
main().catch(async (error) => {
  console.error(colors.red('❌ Fatal error:'), error);
  process.exit(1);
});

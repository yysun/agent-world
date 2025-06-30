#!/bin/bash

# Debug Mode Runner - Enable file-based debug logging
# Usage: ./debug-cli.sh [arguments...]

# Enable debug logging
export DEBUG=true
export NODE_ENV=development

echo "Debug mode enabled. Logs will be written to ./logs/"
echo "Running CLI with debug logging..."

# Run the CLI with debug mode
npx tsx cli/index.ts "$@"

echo ""
echo "Debug session complete. Check ./logs/ for debug output."

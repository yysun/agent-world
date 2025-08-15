# @agent-world/core

Core module for Agent World - world-mediated agent management system.

## Development

### Building

```bash
# Build the core module
npm run build

# Type checking only (no build)
npm run check

# Clean build artifacts
npm run clean
```

### From Root Project

```bash
# Build everything (including core)
npm run build

# Type check everything
npm run check
```

## Structure

- Core TypeScript source files (in this directory)
- `../dist/core/` - Compiled JavaScript and type definitions (in root dist)
- `tsconfig.json` - TypeScript configuration for the core module

## Dependencies

All core-specific dependencies are managed in this workspace's `package.json`.

## Build Structure

agent-world/
├── dist/
│   ├── cli/           ← Root CLI files
│   ├── core/          ← Core workspace output
│   ├── server/        ← Root server files
│   ├── public/        ← Web workspace output
│   └── index.js       ← Root entry point
├── core/
│   ├── tsconfig.json  ← Builds to ../dist/core
│   └── package.json   ← Points to ../dist/core
├── web/
│   └── (builds to ../dist/public via Vite)
└── next/
    └── (builds to .next via Next.js)
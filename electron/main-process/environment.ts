/**
 * Electron Main Environment Helpers
 *
 * Features:
 * - Loads `.env` from prioritized runtime candidate paths.
 * - Resolves startup workspace from command-line arguments.
 * - Applies workspace storage defaults for desktop runtime.
 * - Configures LLM providers from environment variables.
 *
 * Implementation Notes:
 * - Keeps environment and provider wiring isolated from IPC handlers.
 * - Preserves existing CLI-parity defaults for storage and Ollama base URL.
 *
 * Recent Changes:
 * - 2026-02-12: Extracted environment + provider configuration logic from `electron/main.ts`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import dotenv from 'dotenv';

interface ProviderConfigDependencies {
  LLMProvider: any;
  configureLLMProvider: (provider: any, config: Record<string, unknown>) => void;
}

export function loadEnvironmentVariables(baseDir: string): void {
  const candidates = [
    process.env.AGENT_WORLD_DOTENV_PATH,
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(baseDir, '../.env')
  ]
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
    .map((candidate) => path.resolve(candidate));

  const uniqueCandidates = [...new Set(candidates)];
  for (const envPath of uniqueCandidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, quiet: true });
    break;
  }
}

export function workspaceFromCommandLine(argv: string[]): string | null {
  const arg = argv.find((item) => item.startsWith('--workspace='));
  if (!arg) return null;
  const value = arg.slice('--workspace='.length).trim();
  return value.length > 0 ? value : null;
}

export function configureWorkspaceStorage(workspacePath: string): void {
  fs.mkdirSync(workspacePath, { recursive: true });

  if (!process.env.AGENT_WORLD_STORAGE_TYPE) {
    process.env.AGENT_WORLD_STORAGE_TYPE = 'sqlite';
  }

  if (!process.env.AGENT_WORLD_DATA_PATH) {
    process.env.AGENT_WORLD_DATA_PATH = workspacePath;
  }
}

export function configureProvidersFromEnv(dependencies: ProviderConfigDependencies): void {
  const { LLMProvider, configureLLMProvider } = dependencies;
  const configMap = [
    { env: 'OPENAI_API_KEY', provider: LLMProvider.OPENAI },
    { env: 'ANTHROPIC_API_KEY', provider: LLMProvider.ANTHROPIC },
    { env: 'GOOGLE_API_KEY', provider: LLMProvider.GOOGLE },
    { env: 'XAI_API_KEY', provider: LLMProvider.XAI }
  ];

  for (const entry of configMap) {
    const apiKey = process.env[entry.env];
    if (apiKey) {
      configureLLMProvider(entry.provider, { apiKey });
    }
  }

  if (process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_BASE_URL) {
    configureLLMProvider(LLMProvider.OPENAI_COMPATIBLE, {
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL
    });
  }

  if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_RESOURCE_NAME && process.env.AZURE_DEPLOYMENT) {
    configureLLMProvider(LLMProvider.AZURE, {
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      resourceName: process.env.AZURE_RESOURCE_NAME,
      deployment: process.env.AZURE_DEPLOYMENT,
      apiVersion: process.env.AZURE_API_VERSION || '2024-10-21-preview'
    });
  }

  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
  configureLLMProvider(LLMProvider.OLLAMA, { baseUrl: ollamaUrl });
}


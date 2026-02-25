/**
 * Purpose:
 * - Provide a single Gemini utility script for auth checks, model discovery, model invocation tests, and tool-call debugging.
 *
 * Key features:
 * - `list-models`: verify API key and list available models via REST API.
 * - `test-models`: invoke one or more Gemini models through the SDK with a test prompt.
 * - `debug-tool`: stream raw Gemini responses for a function-calling scenario.
 *
 * Notes on implementation:
 * - Supports API key from `--key` or `GOOGLE_API_KEY` loaded through dotenv.
 * - Uses simple function-based command routing with minimal dependencies.
 *
 * Recent changes:
 * - Consolidates `debug-gemini-tool.ts`, `test-google-key.ts`, `test-google-list.ts`, and `test-google.ts` into one script.
 */

import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

type Mode = 'list-models' | 'test-models' | 'debug-tool';

type CliOptions = {
  mode: Mode;
  apiKey?: string;
  models: string[];
  prompt: string;
  toolPrompt: string;
  showAllModels: boolean;
};

const DEFAULT_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro', 'models/gemini-1.5-flash'];
const DEFAULT_PROMPT = 'Hello?';
const DEFAULT_TOOL_PROMPT = 'List files in current directory using shell_cmd';

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/gemini-tools.ts <mode> [options]

Modes:
  list-models    List available models via REST API
  test-models    Test one or more models via SDK generateContent
  debug-tool     Test function-calling stream output via SDK

Options:
  --key <apiKey>          Use this API key instead of GOOGLE_API_KEY
  --model <name>          Model to test (repeatable, test-models only)
  --prompt <text>         Prompt for test-models (default: "${DEFAULT_PROMPT}")
  --tool-prompt <text>    Prompt for debug-tool (default: "${DEFAULT_TOOL_PROMPT}")
  --show-all-models       Show non-Gemini models in list-models
  -h, --help              Show this message

Examples:
  npx tsx scripts/gemini-tools.ts list-models
  npx tsx scripts/gemini-tools.ts list-models --show-all-models
  npx tsx scripts/gemini-tools.ts test-models --model gemini-2.0-flash
  npx tsx scripts/gemini-tools.ts debug-tool --model gemini-2.0-flash
`);
}

function parseCliOptions(argv: string[]): CliOptions {
  if (argv.includes('-h') || argv.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const modeArg = positional[0] as Mode | undefined;
  const mode: Mode = modeArg ?? 'list-models';

  if (!['list-models', 'test-models', 'debug-tool'].includes(mode)) {
    console.error(`Unknown mode: ${modeArg}`);
    printUsage();
    process.exit(1);
  }

  const options: CliOptions = {
    mode,
    models: [...DEFAULT_MODELS],
    prompt: DEFAULT_PROMPT,
    toolPrompt: DEFAULT_TOOL_PROMPT,
    showAllModels: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--key' && next) {
      options.apiKey = next;
      i++;
      continue;
    }
    if (arg === '--model' && next) {
      if (options.models === DEFAULT_MODELS) {
        options.models = [];
      }
      options.models.push(next);
      i++;
      continue;
    }
    if (arg === '--prompt' && next) {
      options.prompt = next;
      i++;
      continue;
    }
    if (arg === '--tool-prompt' && next) {
      options.toolPrompt = next;
      i++;
      continue;
    }
    if (arg === '--show-all-models') {
      options.showAllModels = true;
      continue;
    }
  }

  return options;
}

function getApiKey(cliKey?: string): string {
  const key = cliKey ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    console.error('No API key found. Pass --key or set GOOGLE_API_KEY in .env');
    process.exit(1);
  }
  return key;
}

async function listModels(apiKey: string, showAllModels: boolean): Promise<void> {
  console.log(`Testing Google API key: ${apiKey.substring(0, 8)}...`);
  console.log('Listing models via REST API...');

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!response.ok) {
    console.error(`List models failed: ${response.status} ${response.statusText}`);
    console.error(await response.text());
    process.exit(1);
  }

  const data = (await response.json()) as { models?: Array<{ name: string }> };
  const models = data.models ?? [];
  const filtered = showAllModels ? models : models.filter((m) => m.name.includes('gemini'));

  if (filtered.length === 0) {
    console.log(showAllModels ? 'No models returned.' : 'No Gemini models returned.');
    return;
  }

  console.log('Available models:');
  for (const model of filtered) {
    console.log(`- ${model.name}`);
  }
}

function buildGeminiClient(apiKey: string): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKey);
}

async function testModels(apiKey: string, models: string[], prompt: string): Promise<void> {
  const client = buildGeminiClient(apiKey);
  console.log(`Testing ${models.length} model(s)...`);

  for (const modelName of models) {
    console.log(`\nTesting ${modelName}...`);
    try {
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      console.log(`Success: ${result.response.text()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed: ${message}`);
    }
  }
}

async function debugToolCall(apiKey: string, modelName: string, prompt: string): Promise<void> {
  const client = buildGeminiClient(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    tools: [
      {
        functionDeclarations: [
          {
            name: 'shell_cmd',
            description: 'Execute a shell command',
            parameters: {
              type: 'object',
              properties: {
                command: { type: 'string' },
                directory: { type: 'string' },
              },
              required: ['command'],
            },
          },
        ],
      },
    ],
  });

  console.log(`Calling ${modelName} with tool declaration...`);
  const result = await model.generateContentStream({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  for await (const chunk of result.stream) {
    console.log('\n--- CHUNK ---');
    console.log(JSON.stringify(chunk, null, 2));
  }
}

async function run(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const apiKey = getApiKey(options.apiKey);

  if (options.mode === 'list-models') {
    await listModels(apiKey, options.showAllModels);
    return;
  }

  if (options.mode === 'test-models') {
    await testModels(apiKey, options.models, options.prompt);
    return;
  }

  const modelForDebug = options.models[0] ?? 'gemini-2.0-flash';
  await debugToolCall(apiKey, modelForDebug, options.toolPrompt);
}

run().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});

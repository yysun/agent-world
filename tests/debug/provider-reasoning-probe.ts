/**
 * Provider Reasoning Probe
 *
 * Features:
 * - Uses Agent World's provider configuration and client factories for Azure OpenAI and Google
 * - Streams raw provider chunks to inspect how reasoning controls and reasoning payloads appear
 * - Supports env-backed probes via `npx tsx` without modifying production runtime paths
 *
 * Implementation Notes:
 * - Azure uses the repo's Azure OpenAI client factory and sends `reasoning_effort` on a streaming chat-completions request
 * - Google uses the repo's Google client factory and forwards a probe-only `thinkingConfig` payload through the installed SDK
 * - Output is sanitized: no secrets are printed, only request shape summaries and observed chunk fields
 *
 * Recent Changes:
 * - 2026-03-13: Added a repo-native streaming probe for Azure OpenAI and Google reasoning field discovery
 */

import 'dotenv/config';

import { pathToFileURL } from 'node:url';

import { createGoogleClient, createAzureOpenAIClient } from 'llm-runtime';
import {
  configureLLMProvider,
  getLLMProviderConfig,
  type AzureConfig,
  type GoogleConfig,
} from '../../core/llm-runtime.js';
import { LLMProvider } from '../../core/types.js';

export type ProbeProvider = 'azure' | 'google';
export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ProbeArgs {
  provider: ProbeProvider;
  effort: ReasoningEffort;
  efforts: ReasoningEffort[];
  prompt: string;
  model?: string;
  maxChunks: number;
}

export interface OpenAIChunkSummary {
  keys: string[];
  contentPreview: string | null;
  reasoningPreview: string | null;
  finishReason: string | null;
}

export interface GooglePartSummary {
  keys: string[];
  textPreview: string | null;
  thoughtFlag: boolean | null;
}

export interface GoogleChunkSummary {
  parts: GooglePartSummary[];
  finishReason: string | null;
}

const ALL_REASONING_EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high'];

function parseReasoningEffortList(value: string | undefined): ReasoningEffort[] {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const efforts = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (efforts.length === 0) {
    return [];
  }

  if (efforts.some((item) => item !== 'low' && item !== 'medium' && item !== 'high')) {
    throw new Error('Invalid --efforts list. Use a comma-separated list from low,medium,high.');
  }

  return Array.from(new Set(efforts)) as ReasoningEffort[];
}

export function parseProbeArgs(argv: string[]): ProbeArgs {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      values.set(key, 'true');
      continue;
    }
    values.set(key, value);
    index += 1;
  }

  const provider = (values.get('provider') || '').trim().toLowerCase();
  if (provider !== 'azure' && provider !== 'google') {
    throw new Error('Missing or invalid --provider. Use --provider azure or --provider google.');
  }

  const allEfforts = values.get('all-efforts') === 'true';
  const listedEfforts = parseReasoningEffortList(values.get('efforts'));
  const effort = (values.get('effort') || 'medium').trim().toLowerCase();
  if (effort !== 'low' && effort !== 'medium' && effort !== 'high') {
    throw new Error('Invalid --effort. Use low, medium, or high.');
  }
  const efforts = allEfforts
    ? [...ALL_REASONING_EFFORTS]
    : (listedEfforts.length > 0 ? listedEfforts : [effort as ReasoningEffort]);

  const maxChunksValue = Number(values.get('max-chunks') || '12');
  const maxChunks = Number.isFinite(maxChunksValue) && maxChunksValue > 0 ? Math.floor(maxChunksValue) : 12;

  return {
    provider,
    effort: efforts[0],
    efforts,
    prompt: values.get('prompt') || 'Compare three plugin architectures for an Electron app in one concise paragraph.',
    model: values.get('model') || undefined,
    maxChunks,
  };
}

export function buildGoogleThinkingConfig(effort: ReasoningEffort): { includeThoughts: true; thinkingBudget: number } {
  const thinkingBudgetByEffort: Record<ReasoningEffort, number> = {
    low: 256,
    medium: 1024,
    high: 2048,
  };

  return {
    includeThoughts: true,
    thinkingBudget: thinkingBudgetByEffort[effort],
  };
}

export function summarizeOpenAIChunk(chunk: any): OpenAIChunkSummary | null {
  const choice = chunk?.choices?.[0];
  const delta = choice?.delta;
  if (!choice) return null;

  const contentPreview = typeof delta?.content === 'string' ? delta.content.slice(0, 80) : null;
  const reasoningPreview = typeof delta?.reasoning_content === 'string'
    ? delta.reasoning_content.slice(0, 80)
    : typeof delta?.reasoning === 'string'
      ? delta.reasoning.slice(0, 80)
      : typeof delta?.thinking === 'string'
        ? delta.thinking.slice(0, 80)
        : null;

  if (!delta?.role && !contentPreview && !reasoningPreview && !choice.finish_reason) {
    return null;
  }

  return {
    keys: Object.keys(delta || {}),
    contentPreview,
    reasoningPreview,
    finishReason: choice.finish_reason ?? null,
  };
}

export function summarizeGoogleChunk(chunk: any): GoogleChunkSummary | null {
  const candidate = chunk?.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  if (parts.length === 0 && !candidate?.finishReason) {
    return null;
  }

  return {
    parts: parts.map((part: any) => ({
      keys: Object.keys(part || {}),
      textPreview: typeof part?.text === 'string' ? part.text.slice(0, 80) : null,
      thoughtFlag: typeof part?.thought === 'boolean' ? part.thought : null,
    })),
    finishReason: candidate?.finishReason ?? null,
  };
}

function configureAzureFromEnv(): AzureConfig {
  const apiKey = String(process.env.AZURE_OPENAI_API_KEY || '').trim();
  const resourceName = String(process.env.AZURE_OPENAI_RESOURCE_NAME || '').trim();
  const deployment = String(process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '').trim();

  const missing = [
    !apiKey ? 'AZURE_OPENAI_API_KEY' : null,
    !resourceName ? 'AZURE_OPENAI_RESOURCE_NAME' : null,
    !deployment ? 'AZURE_OPENAI_DEPLOYMENT_NAME' : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing Azure env vars: ${missing.join(', ')}`);
  }

  configureLLMProvider(LLMProvider.AZURE, {
    apiKey,
    resourceName,
    deployment,
    apiVersion: String(process.env.AZURE_OPENAI_API_VERSION || '').trim() || '2024-10-21-preview',
  });

  return getLLMProviderConfig(LLMProvider.AZURE);
}

function configureGoogleFromEnv(): GoogleConfig {
  const apiKey = String(process.env.GOOGLE_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Missing Google env var: GOOGLE_API_KEY');
  }

  configureLLMProvider(LLMProvider.GOOGLE, { apiKey });
  return getLLMProviderConfig(LLMProvider.GOOGLE);
}

async function runAzureProbe(args: ProbeArgs): Promise<void> {
  const config = configureAzureFromEnv();
  const client = createAzureOpenAIClient(config);
  const model = args.model || config.deployment;

  console.log(JSON.stringify({
    provider: 'azure',
    request: {
      model,
      stream: true,
      reasoningEfforts: args.efforts,
      max_completion_tokens: 128,
    },
    note: 'Reasoning tokens are expected on delta.reasoning_content when supported by the Azure model + API version.',
  }, null, 2));

  const runs: Array<{ effort: ReasoningEffort; observedChunks: OpenAIChunkSummary[] }> = [];
  for (const effort of args.efforts) {
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: args.prompt }],
      stream: true,
      max_completion_tokens: 128,
      reasoning_effort: effort,
    } as any);

    const summaries: OpenAIChunkSummary[] = [];
    for await (const chunk of stream) {
      const summary = summarizeOpenAIChunk(chunk);
      if (!summary) continue;
      summaries.push(summary);
      if (summaries.length >= args.maxChunks) break;
    }

    runs.push({ effort, observedChunks: summaries });
  }

  console.log(JSON.stringify({
    provider: 'azure',
    runs,
  }, null, 2));
}

async function runGoogleProbe(args: ProbeArgs): Promise<void> {
  const config = configureGoogleFromEnv();
  const client = createGoogleClient(config);
  const model = args.model || 'gemini-2.5-flash';

  console.log(JSON.stringify({
    provider: 'google',
    request: {
      model,
      stream: true,
      generationConfig: {
        maxOutputTokens: 128,
        temperature: 0.2,
        thinkingConfigs: args.efforts.map((effort) => ({ effort, config: buildGoogleThinkingConfig(effort) })),
      },
    },
    note: 'Reasoning tokens are expected in candidate content parts, commonly as parts marked with a thought flag when supported.',
  }, null, 2));

  console.log(JSON.stringify({
    provider: 'google',
    runs: await Promise.all(args.efforts.map(async (effort) => {
      const thinkingConfig = buildGoogleThinkingConfig(effort);
      const generativeModel = client.getGenerativeModel({
        model,
        generationConfig: {
          maxOutputTokens: 128,
          temperature: 0.2,
          thinkingConfig,
        } as any,
      } as any);

      const result = await generativeModel.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: args.prompt }] }],
        generationConfig: {
          maxOutputTokens: 128,
          temperature: 0.2,
          thinkingConfig,
        } as any,
      } as any);

      const summaries: GoogleChunkSummary[] = [];
      for await (const chunk of result.stream) {
        const summary = summarizeGoogleChunk(chunk);
        if (!summary) continue;
        summaries.push(summary);
        if (summaries.length >= args.maxChunks) break;
      }

      return { effort, observedChunks: summaries };
    })),
  }, null, 2));
}

async function main(): Promise<void> {
  const args = parseProbeArgs(process.argv.slice(2));
  if (args.provider === 'azure') {
    await runAzureProbe(args);
    return;
  }

  await runGoogleProbe(args);
}

function isExecutedAsScript(): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return import.meta.url === pathToFileURL(entryPath).href;
}

if (isExecutedAsScript()) {
  void main().catch((error: any) => {
    console.error(JSON.stringify({
      status: 'error',
      name: error?.name || 'Error',
      message: error?.message || String(error),
      statusCode: error?.status ?? error?.statusCode ?? null,
      type: error?.type ?? null,
    }, null, 2));
    process.exitCode = 1;
  });
}
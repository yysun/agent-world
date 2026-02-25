import { toGuardrailTraceFields } from './guardrails.js';

// Opik integration: trace bridge for world/sse events (message, LLM, tool, safety).
type WorldLike = {
  id?: string;
  name?: string;
  eventEmitter?: {
    on: (event: string, listener: (payload: any) => void) => void;
    removeListener: (event: string, listener: (payload: any) => void) => void;
  };
};

export type OpikTracerConfig = {
  client: any;
};

export class OpikTracer {
  private readonly client: any;
  private readonly activeSpans = new Map<string, any>();
  private readonly activeTraces = new Map<string, any>();
  private readonly listeners = new WeakMap<WorldLike, Array<{ event: string; handler: (payload: any) => void }>>();
  private activeScenarioLabel: string | null = null;

  private normalizeAgentKey(agentName: string): string {
    const raw = String(agentName || '').trim().toLowerCase();
    if (!raw) {
      return 'agent';
    }
    return raw.startsWith('agent:') ? raw.slice('agent:'.length) : raw;
  }

  constructor(config: OpikTracerConfig) {
    this.client = config.client;
  }

  attachToWorld(world: WorldLike): void {
    if (!this.client || !world?.eventEmitter || this.listeners.has(world)) {
      return;
    }

    const worldHandler = (payload: any) => {
      this.handleWorldEvent(payload);
    };
    const sseHandler = (payload: any) => {
      this.handleSSEEvent(payload);
    };
    const systemHandler = (payload: any) => {
      this.handleSystemEvent(payload);
    };

    world.eventEmitter.on('world', worldHandler);
    world.eventEmitter.on('sse', sseHandler);
    world.eventEmitter.on('system', systemHandler);

    this.listeners.set(world, [
      { event: 'world', handler: worldHandler },
      { event: 'sse', handler: sseHandler },
      { event: 'system', handler: systemHandler },
    ]);
  }

  detachFromWorld(world: WorldLike): void {
    const entries = this.listeners.get(world);
    if (!entries || !world?.eventEmitter) {
      return;
    }

    for (const entry of entries) {
      world.eventEmitter.removeListener(entry.event, entry.handler);
    }
    this.listeners.delete(world);
  }

  async flush(): Promise<void> {
    if (this.client?.flush) {
      await this.client.flush();
    }
  }

  private ensureTrace(agentName: string): any {
    const agentKey = this.normalizeAgentKey(agentName);
    const scenarioLabel = this.activeScenarioLabel;
    const key = scenarioLabel ? `${scenarioLabel}:${agentKey}` : agentKey;
    const existing = this.activeTraces.get(key);
    if (existing) {
      return existing;
    }

    const traceName = scenarioLabel
      ? `${scenarioLabel}: ${agentKey}`
      : `agent-world:${agentKey}`;
    const trace = this.client.trace({ name: traceName });
    this.activeTraces.set(key, trace);
    return trace;
  }

  private activityKey(payload: any): string {
    return `activity:${payload?.activityId ?? 'unknown'}:${payload?.source ?? 'unknown'}`;
  }

  private handleWorldEvent(payload: any): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    if (payload.type === 'response-start') {
      const trace = this.ensureTrace(payload.source || payload.agentName || 'world');
      const key = this.activityKey(payload);
      if (!this.activeSpans.has(key)) {
        const span = trace.span({
          name: 'message_lifecycle',
          type: 'general',
          input: {
            activityId: payload.activityId,
            source: payload.source,
            pendingOperations: payload.pendingOperations,
            timestamp: payload.timestamp,
          },
          tags: ['lifecycle:message', 'event:response-start'],
        });
        this.activeSpans.set(key, span);
      }
      return;
    }

    if (payload.type === 'response-end' || payload.type === 'idle') {
      const key = this.activityKey(payload);
      const span = this.activeSpans.get(key);
      if (span) {
        span.update({
          output: {
            type: payload.type,
            activityId: payload.activityId,
            source: payload.source,
            pendingOperations: payload.pendingOperations,
            timestamp: payload.timestamp,
          },
        });
        span.end();
        this.activeSpans.delete(key);
      }
      return;
    }

    if (payload.type === 'tool-start') {
      const trace = this.ensureTrace(payload.agentName || 'agent');
      const toolName = String(payload?.toolExecution?.toolName || 'tool');
      const riskLevel = String(payload?.toolExecution?.metadata?.riskLevel || 'low');
      const riskTags = Array.isArray(payload?.toolExecution?.metadata?.riskTags)
        ? payload.toolExecution.metadata.riskTags
        : [];

      const span = trace.span({
        name: toolName,
        type: 'tool',
        input: payload?.toolExecution?.input,
        tags: [`risk_level:${riskLevel}`, ...riskTags],
      });

      this.activeSpans.set(`${payload.messageId}:${payload.toolExecution?.toolCallId}`, span);
      return;
    }

    if (payload.type === 'tool-result' || payload.type === 'tool-error') {
      const spanId = `${payload.messageId}:${payload.toolExecution?.toolCallId}`;
      const span = this.activeSpans.get(spanId);
      if (!span) {
        return;
      }

      span.update({
        output: payload?.toolExecution?.result,
        metadata: payload?.toolExecution?.metadata,
      });
      span.end();
      this.activeSpans.delete(spanId);
      return;
    }

    if (payload.type === 'guardrail') {
      const trace = this.ensureTrace(payload.agentName || 'agent');
      const fields = toGuardrailTraceFields({
        triggered: !!payload.triggered,
        blocked: !!payload.blocked,
        severity: payload.severity || 'low',
        reasons: payload.reasons || [],
      });

      if (trace.logFeedbackScore) {
        trace.logFeedbackScore({
          name: 'Safety/GuardrailTriggered',
          value: fields.triggered ? 0 : 1,
          reason: fields.reasons.join(', ') || undefined,
        });
      }
    }
  }

  private handleSSEEvent(payload: any): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    if (payload.type === 'start') {
      const traceKey = payload.agentName || 'agent';
      const trace = this.ensureTrace(traceKey);
      const span = trace.span({
        name: 'llm_generation',
        type: 'llm',
      });
      this.activeSpans.set(payload.messageId, { span, content: '', traceKey });
      return;
    }

    if (payload.type === 'chunk' && payload.content) {
      const item = this.activeSpans.get(payload.messageId);
      if (item) {
        item.content += payload.content;
      }
      return;
    }

    if (payload.type === 'end') {
      const item = this.activeSpans.get(payload.messageId);
      if (!item) {
        return;
      }

      const usage = payload.usage
        ? {
            prompt_tokens: payload.usage.inputTokens,
            completion_tokens: payload.usage.outputTokens,
            total_tokens: payload.usage.totalTokens,
          }
        : undefined;

      item.span.update({
        output: { content: item.content || '' },
        usage,
      });
      item.span.end();

      const traceKey = item.traceKey as string | undefined;
      if (traceKey) {
        const trace = this.activeTraces.get(traceKey);
        if (trace) {
          trace.end();
          this.activeTraces.delete(traceKey);
        }
      }

      this.activeSpans.delete(payload.messageId);
    }
  }

  private handleSystemEvent(payload: any): void {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    if (payload.type === 'scenario-context') {
      this.activeScenarioLabel = typeof payload.label === 'string' && payload.label.trim()
        ? payload.label.trim()
        : null;
    }
  }
}

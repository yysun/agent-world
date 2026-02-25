// Opik integration: guardrail result mapper for trace-safe fields.
export type GuardrailTraceFields = {
  triggered: boolean;
  blocked: boolean;
  severity: 'low' | 'medium' | 'high';
  reasons: string[];
};

export function toGuardrailTraceFields(input: {
  triggered: boolean;
  blocked: boolean;
  severity: 'low' | 'medium' | 'high';
  reasons?: string[];
}): GuardrailTraceFields {
  return {
    triggered: input.triggered,
    blocked: input.blocked,
    severity: input.severity,
    reasons: input.reasons ?? [],
  };
}

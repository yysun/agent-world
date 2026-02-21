export type GuardrailSeverity = 'low' | 'medium' | 'high';

// Opik integration: core safety checks shared by optional Opik safety/eval flows.
export type GuardrailFinding = {
  type: 'pii' | 'jailbreak' | 'restricted-topic';
  reason: string;
  severity: GuardrailSeverity;
};

export type GuardrailResult = {
  flagged: boolean;
  blocked: boolean;
  severity: GuardrailSeverity;
  reasons: string[];
  findings: GuardrailFinding[];
  redactedText: string;
};

export type GuardrailPolicy = {
  redact: boolean;
  blockOnHighSeverity: boolean;
};

const API_KEY_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: 'PII_API_KEY_OPENAI', pattern: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { reason: 'PII_API_KEY_GENERIC', pattern: /\b(?:api[-_ ]?key|token|secret)\s*[:=]\s*[A-Za-z0-9_\-]{12,}\b/gi },
  { reason: 'PII_BEARER_TOKEN', pattern: /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/gi },
];

const CREDIT_CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const PHONE_PATTERN = /\b(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;

const JAILBREAK_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /jailbreak/i,
  /system\s+override/i,
  /developer\s+mode/i,
  /reveal\s+(the\s+)?system\s+prompt/i,
];

const RESTRICTED_TOPIC_PATTERNS = [
  /build\s+(a\s+)?bomb/i,
  /how\s+to\s+make\s+malware/i,
  /credit\s+card\s+fraud/i,
  /exploit\s+zero-day/i,
];

function luhnValid(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

export function checkPII(content: string): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];
  const text = content || '';

  for (const candidate of API_KEY_PATTERNS) {
    if (candidate.pattern.test(text)) {
      findings.push({ type: 'pii', reason: candidate.reason, severity: 'high' });
    }
  }

  const ccMatches = text.match(CREDIT_CARD_PATTERN) || [];
  const hasLuhnCard = ccMatches.some((match) => luhnValid(match));
  if (hasLuhnCard) {
    findings.push({ type: 'pii', reason: 'PII_CREDIT_CARD', severity: 'high' });
  }

  if (PHONE_PATTERN.test(text)) {
    findings.push({ type: 'pii', reason: 'PII_PHONE_NUMBER', severity: 'medium' });
  }

  return findings;
}

export function checkJailbreak(content: string, inputs: string): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];
  const combined = `${content || ''}\n${inputs || ''}`;

  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(combined)) {
      findings.push({ type: 'jailbreak', reason: 'JAILBREAK_DETECTED', severity: 'high' });
      break;
    }
  }

  for (const pattern of RESTRICTED_TOPIC_PATTERNS) {
    if (pattern.test(combined)) {
      findings.push({ type: 'restricted-topic', reason: 'RESTRICTED_TOPIC_DETECTED', severity: 'high' });
      break;
    }
  }

  return findings;
}

function redactContent(content: string): string {
  let redacted = content;

  for (const candidate of API_KEY_PATTERNS) {
    redacted = redacted.replace(candidate.pattern, '[REDACTED_API_KEY]');
  }

  redacted = redacted.replace(CREDIT_CARD_PATTERN, (value) => (luhnValid(value) ? '[REDACTED_CREDIT_CARD]' : value));
  redacted = redacted.replace(PHONE_PATTERN, '[REDACTED_PHONE]');

  return redacted;
}

function highestSeverity(findings: GuardrailFinding[]): GuardrailSeverity {
  if (findings.some((finding) => finding.severity === 'high')) {
    return 'high';
  }
  if (findings.some((finding) => finding.severity === 'medium')) {
    return 'medium';
  }
  return 'low';
}

export function runGuardrails(
  content: string,
  inputs: string,
  policy: GuardrailPolicy = { redact: true, blockOnHighSeverity: true }
): GuardrailResult {
  const findings = [
    ...checkPII(content),
    ...checkJailbreak(content, inputs),
  ];

  const flagged = findings.length > 0;
  const severity = highestSeverity(findings);
  const blocked = Boolean(policy.blockOnHighSeverity && severity === 'high' && flagged);
  const redactedText = policy.redact ? redactContent(content) : content;

  return {
    flagged,
    blocked,
    severity,
    reasons: findings.map((finding) => finding.reason),
    findings,
    redactedText,
  };
}

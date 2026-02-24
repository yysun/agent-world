

export interface SecurityResult {
  flagged: boolean;
  reason?: string;
  redactedText?: string;
}

export class SecurityGuardrail {
  
  constructor() {
  }

  public scanForPII(text: string): SecurityResult {
        const apiPatterns = [
            /sk-[a-zA-Z0-9]{20,}/g, // OpenAI style
            /key-[a-zA-Z0-9]{10,}/g,
            /[0-9a-fA-F]{32}/g // Generic hex keys
        ];

        let flagged = false;
        let redacted = text;

        for (const pattern of apiPatterns) {
            if (pattern.test(text)) {
                flagged = true;
                redacted = redacted.replace(pattern, '[REDACTED_API_KEY]');
            }
        }

        return { flagged, reason: flagged ? "PII_API_KEY" : undefined, redactedText: redacted };
  }

  public scanForHarmfulContent(text: string): SecurityResult {
      const blockedKeywords = ["ignore system prompt", "jailbreak", "system override"];
      const lower = text.toLowerCase();
      
      for (const keyword of blockedKeywords) {
          if (lower.includes(keyword)) {
              return { flagged: true, reason: "HARMFUL_KEYWORD", redactedText: "[BLOCKED_CONTENT]" };
          }
      }
      return { flagged: false, redactedText: text };
  }

  public validate(text: string): SecurityResult {
      const pii = this.scanForPII(text);
      if (pii.flagged) return pii;

      const harmful = this.scanForHarmfulContent(text);
      if (harmful.flagged) return harmful;

      return { flagged: false, redactedText: text };
  }
}

export const globalGuardrail = new SecurityGuardrail();

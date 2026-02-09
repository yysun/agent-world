# Opik Integration Scripts

This directory contains scripts for testing and verifying Opik observability integration.

## Scripts

### verify-web-integration.ts
Tests the Opik web dashboard connectivity by creating a verification trace.

**Usage:**
```bash
npx tsx packages/opik/scripts/verify-web-integration.ts
```

**What it does:**
- Creates a test trace with simulated token usage
- Verifies that traces appear in the Opik web dashboard
- Confirms end-to-end integration is working

**Expected Output:**
- Success message with Opik dashboard URL
- Trace should appear in dashboard with tags: `verification`, `user-check`, `phase-4-confirmed`

## Related Documentation

- See `packages/opik/README.md` for integration overview
- See `.docs/done/2026-02-09/` for safety & guardrails implementation

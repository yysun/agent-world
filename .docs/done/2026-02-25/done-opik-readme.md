# Implementation: Opik Test Documentation

**Date:** 2026-02-25
**Task:** Create README for Opik tests

## Summary
Created a dedicated README file in `tests/opik/` to document the usage of robustness evaluation scripts (`eval-robustness.ts`) and safety checks (`eval-simple-safety.ts`).

## Changes

### 1. Created `tests/opik/README.md`
- Added instructions for running `eval-robustness.ts` in default (heuristic) mode.
- Added instructions for "LLM-as-a-Judge" mode with `gemini-2.5-pro`.
- Documented CLI flags (`--limit`, `--dataset`, etc.).
- Added instructions for `eval-simple-safety.ts`.

### 2. Updated `tests/README.md`
- Added an entry for `opik/` in the Test Structure section.

## Verification
- Verified file creation and content.
- Verified link in parent README.

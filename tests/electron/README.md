# Electron Tests

Layer-oriented test organization for Electron runtime behavior.

## Structure

- `tests/electron/main/`
  - Main-process lifecycle/window/IPC registration orchestration.
- `tests/electron/preload/`
  - Preload bridge contracts, invoke guards, payload normalization.
- `tests/electron/renderer/`
  - Renderer streaming/activity state and extracted domain orchestration helpers.

## Naming Convention

- Keep filenames focused by concern: `<feature>-<scope>.test.ts`
- Prefer explicit suffixes where useful:
  - `*-domain.test.ts` for domain helper modules
  - `*-bridge.test.ts` for preload bridge behavior
  - `main-*.test.ts` for main-process orchestration

## Notes

- Tests are in-memory only.
- No real LLM/provider calls are used in these Electron unit tests.

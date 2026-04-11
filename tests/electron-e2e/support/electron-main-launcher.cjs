/**
 * Electron E2E CommonJS launcher shim.
 *
 * Purpose:
 * - Provide a CommonJS entrypoint that Electron can `require()` during Playwright E2E runs.
 *
 * Key Features:
 * - Dynamically imports the compiled ESM desktop main entry.
 * - Preserves the production Electron main bundle unchanged.
 *
 * Implementation Notes:
 * - Electron Playwright launches the app through a CommonJS entry path.
 * - The real desktop main bundle is ESM and uses top-level `await`, so this shim bridges
 *   that loader boundary for the test harness.
 *
 * Recent Changes:
 * - 2026-04-11: Added the launcher shim so Electron Playwright can execute the compiled
 *   ESM main entry during desktop E2E coverage.
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function launchElectronMain() {
  const electronMainEntryPath = path.resolve(process.cwd(), 'electron/dist/main.js');
  await import(pathToFileURL(electronMainEntryPath).href);
}

void launchElectronMain().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Electron Main IPC Registration Helpers
 *
 * Features:
 * - Registers deterministic IPC channel routes for main-process handlers.
 * - Keeps registration logic isolated from business handlers.
 *
 * Implementation Notes:
 * - Accepts a minimal `ipcMain.handle` compatible object for testability.
 * - Uses ordered route registration to preserve deterministic behavior.
 *
 * Recent Changes:
 * - 2026-02-12: Added extracted IPC registration helper for Phase 3 modularization.
 */

export type MainIpcRouteHandler = (event: unknown, payload?: unknown) => Promise<unknown> | unknown;

export interface MainIpcRoute {
  channel: string;
  handler: MainIpcRouteHandler;
}

export interface IpcMainHandleLike {
  handle: (channel: string, listener: MainIpcRouteHandler) => void;
}

export function registerIpcRoutes(ipcMainLike: IpcMainHandleLike, routes: MainIpcRoute[]): void {
  for (const route of routes) {
    ipcMainLike.handle(route.channel, route.handler);
  }
}

/**
 * App Component - Root application component
 * 
 * Purpose: Main app shell with routing and global providers
 * 
 * Features:
 * - WebSocket provider for global client access
 * - React Router setup (to be added in Phase 7)
 * - Route definitions (to be added in Phase 7)
 * 
 * Changes:
 * - 2025-11-03: Added WebSocketProvider
 * - 2025-11-03: Initial setup for Phase 1
 */

import { WebSocketProvider } from '@/lib/WebSocketContext';
import { useWebSocket } from '@/hooks/useWebSocket';

function AppContent() {
  const { state, error } = useWebSocket();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-bold">Agent World</h1>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${state === 'connected'
                  ? 'bg-green-500'
                  : state === 'connecting' || state === 'reconnecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : 'bg-red-500'
                }`}
            />
            <span className="text-sm text-muted-foreground capitalize">{state}</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
            Error: {error.message}
          </div>
        )}

        <p className="mt-4 text-muted-foreground">
          Vite + React frontend with WebSocket integration ready.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Phase 4 complete: WebSocket hooks implemented. Next: Port components (Phase 5).
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <WebSocketProvider>
      <AppContent />
    </WebSocketProvider>
  );
}

export default App;

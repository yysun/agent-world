/**
 * App Component - Root application component
 * 
 * Purpose: Main app shell with routing and global providers
 * 
 * Features:
 * - React Router for page navigation
 * - ErrorBoundary for graceful error handling
 * - Layout wrapper for consistent UI
 * - Route definitions (Home, World detail)
 * 
 * Routes:
 * - / → HomePage (world list)
 * - /world/:worldId → WorldPage (world detail with agents and chat)
 * - * → 404 Not Found
 * 
 * Changes:
 * - 2025-11-12: Removed WebSocketProvider, now using REST API + SSE
 * - 2025-11-03: Added WebSocketProvider (Phase 4)
 * - 2025-11-03: Added React Router setup (Phase 7)
 * - 2025-11-03: Added ErrorBoundary and Layout wrappers
 * - 2025-11-03: Initial setup for Phase 1
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary.tsx';
import Layout from '@/components/Layout.tsx';
import HomePage from '@/pages/HomePage.tsx';
import WorldPage from '@/pages/WorldPage.tsx';

function NotFoundPage() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-foreground mb-2">404</h2>
        <p className="text-muted-foreground mb-4">Page not found</p>
        <a
          href="/"
          className="text-primary hover:underline"
        >
          Go back home
        </a>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/world/:worldId" element={<WorldPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;

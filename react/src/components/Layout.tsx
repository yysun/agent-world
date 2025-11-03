/**
 * Layout Component - Main layout wrapper with header and navigation
 * 
 * Purpose: Consistent layout structure for all pages
 * 
 * Features:
 * - Header with site title and connection status
 * - Navigation links (to be added in Phase 7 with routing)
 * - Footer with copyright
 * - Responsive design
 * - Main content area with proper spacing
 * 
 * Implementation:
 * - Uses ConnectionStatus component for WebSocket state
 * - Flex layout with sticky header
 * - Full height viewport
 * - Styled with Tailwind CSS
 * 
 * Changes:
 * - 2025-11-03: Created for Phase 5 (adapted from Next.js pattern)
 */

import { ReactNode } from 'react';
import ConnectionStatus from './ConnectionStatus.tsx';
import { useWebSocket } from '@/hooks/useWebSocket';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { state } = useWebSocket();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground font-sans">
              Agent World
            </h1>
            <span className="text-xs text-muted-foreground font-sans">
              v1.0
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Navigation will be added in Phase 7 */}
            <ConnectionStatus state={state} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-4">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground font-sans">
          © 2024 Agent World. Built with Vite + React + WebSocket.
        </div>
      </footer>
    </div>
  );
}

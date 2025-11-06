/**
 * Layout Component - Main layout wrapper with header and navigation
 * 
 * Purpose: Consistent layout structure for all pages
 * 
 * Features:
 * - Header with site title and connection status
 * - Navigation links (to be added in Phase 7 with routing)
 * - Footer removed for cleaner design
 * - Responsive design
 * - Main content area with proper spacing
 * - shadcn design system integration
 * 
 * Implementation:
 * - Uses ConnectionStatus component for WebSocket state
 * - Flex layout with sticky header
 * - Full height viewport
 * - Styled with Tailwind CSS and shadcn tokens
 * 
 * Changes:
 * - 2025-11-04: Updated with shadcn design principles, removed footer
 * - 2025-11-03: Created for Phase 5 (adapted from Next.js pattern)
 */

import { ReactNode } from 'react';
import ConnectionStatus from './ConnectionStatus.tsx';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Badge } from '@/components/ui/badge';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { state } = useWebSocket();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-lg shadow-md border-b border-border/50">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xl">
              🌍
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                Agent World
              </h1>
            </div>
            <Badge variant="secondary" className="text-xs font-semibold hidden sm:inline-flex">
              Beta
            </Badge>
          </div>

          <div className="flex items-center gap-4">
            <ConnectionStatus state={state} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
}

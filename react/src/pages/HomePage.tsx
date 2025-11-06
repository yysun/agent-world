/**
 * HomePage - World list and creation page
 * 
 * Purpose: Display all worlds with create/select functionality
 * 
 * Features:
 * - List all worlds with name and description
 * - Create new world with inline form
 * - Navigate to world detail page
 * - Loading and empty states
 * - Responsive grid layout
 * - shadcn UI components for consistent design
 * 
 * Implementation:
 * - Uses useWorldData hook for CRUD operations
 * - Uses React Router for navigation
 * - Inline create form (no modal)
 * - Grid layout for world cards with shadcn Card
 * - Error handling with user feedback
 * 
 * Changes:
 * - 2025-11-04: Redesigned with shadcn UI components and improved layout
 * - 2025-11-03: Created for Phase 6, adapted from Next.js app/page.tsx
 * - 2025-11-03: Changed from REST API to WebSocket commands via hooks
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorldData } from '@/hooks/useWorldData';
import Loading from '@/components/Loading.tsx';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function HomePage() {
  const navigate = useNavigate();
  const { worlds, loading, error, createWorld, refetch } = useWorldData();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldDescription, setNewWorldDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleCreateWorld = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorldName.trim()) return;

    setCreating(true);
    setCreateError(null);

    try {
      await createWorld({
        name: newWorldName,
        description: newWorldDescription || undefined,
      });

      // Success - reset form and refresh list
      setNewWorldName('');
      setNewWorldDescription('');
      setShowCreateForm(false);
      await refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create world');
    } finally {
      setCreating(false);
    }
  };

  const selectWorld = (worldId: string) => {
    navigate(`/world/${worldId}`);
  };

  if (loading) {
    return <Loading message="Loading worlds..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 max-w-7xl">
        {/* Header Section */}
        <div className="text-center mb-12 sm:mb-16 lg:mb-20">
          <div className="inline-block mb-6 px-4 py-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full">
            ✨ Welcome to Agent World
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-4 sm:mb-6 tracking-tight">
            Build Your AI Agent
            <span className="block mt-2 bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
              Ecosystem
            </span>
          </h1>
          <p className="text-base sm:text-lg lg:text-xl text-muted-foreground mb-8 sm:mb-10 max-w-2xl mx-auto leading-relaxed">
            Create intelligent worlds where AI agents collaborate, communicate, and solve complex problems together
          </p>
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            size="lg"
            className="shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 px-8 py-6 text-base font-semibold"
          >
            {showCreateForm ? '✕ Cancel' : '✨ Create New World'}
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="mb-8 bg-destructive/5 border-destructive/20 shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="text-destructive text-xl">⚠️</div>
                <div>
                  <p className="text-sm font-medium text-destructive mb-1">Error</p>
                  <p className="text-sm text-destructive/80">{error.message}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create World Form */}
        {showCreateForm && (
          <Card className="mb-12 sm:mb-16 max-w-2xl mx-auto shadow-xl border-primary/10 bg-gradient-to-br from-card to-card/50 backdrop-blur">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">🌍</div>
                <CardTitle className="text-2xl">Create New World</CardTitle>
              </div>
              <CardDescription className="text-base">
                Enter details for your new AI agent world
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateWorld} className="space-y-6">
                <div className="space-y-2.5">
                  <label htmlFor="worldName" className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span>World Name</span>
                    <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="text"
                    id="worldName"
                    value={newWorldName}
                    onChange={(e) => setNewWorldName(e.target.value)}
                    placeholder="e.g., Customer Support Team, Creative Studio..."
                    required
                    disabled={creating}
                    className="h-12 text-base"
                  />
                </div>
                <div className="space-y-2.5">
                  <label htmlFor="worldDescription" className="text-sm font-semibold text-foreground">
                    Description
                  </label>
                  <Textarea
                    id="worldDescription"
                    value={newWorldDescription}
                    onChange={(e) => setNewWorldDescription(e.target.value)}
                    placeholder="Describe the purpose of this world and what agents will do..."
                    rows={4}
                    disabled={creating}
                    className="text-base resize-none"
                  />
                </div>

                {createError && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="text-destructive">⚠️</span>
                      <p className="text-sm text-destructive font-medium">{createError}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={creating || !newWorldName.trim()}
                    size="lg"
                    className="flex-1 shadow-md hover:shadow-lg transition-all"
                  >
                    {creating ? '⏳ Creating...' : '✨ Create World'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setShowCreateForm(false);
                      setCreateError(null);
                    }}
                    disabled={creating}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Worlds Grid */}
        {worlds.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {worlds.map((world) => (
              <Card
                key={world.id}
                className="cursor-pointer hover:shadow-2xl transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 group border-border/40 bg-gradient-to-br from-card to-card/80 backdrop-blur overflow-hidden"
                onClick={() => selectWorld(world.id)}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <CardHeader className="relative">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300">
                      🌍
                    </div>
                    <div className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                      Active
                    </div>
                  </div>
                  <CardTitle className="text-xl font-bold group-hover:text-primary transition-colors duration-300">
                    {world.name}
                  </CardTitle>
                  {world.description && (
                    <CardDescription className="line-clamp-2 text-base leading-relaxed mt-2">
                      {world.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardFooter className="relative pt-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between group/btn hover:bg-primary/5"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectWorld(world.id);
                    }}
                  >
                    <span>Open World</span>
                    <span className="group-hover/btn:translate-x-1 transition-transform duration-200">→</span>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : !showCreateForm ? (
          <Card className="max-w-lg mx-auto text-center shadow-lg border-dashed border-2 border-border bg-gradient-to-br from-card to-muted/20">
            <CardHeader className="space-y-4 pb-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-muted/30 flex items-center justify-center text-4xl">
                🌟
              </div>
              <CardTitle className="text-2xl sm:text-3xl font-bold">No Worlds Yet</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                Create your first world to get started with AI agents.
                <span className="block mt-2 text-sm">Start building something amazing today!</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-8">
              <Button
                onClick={() => setShowCreateForm(true)}
                size="lg"
                className="shadow-md hover:shadow-lg transition-all hover:scale-105 px-8 py-6 text-base font-semibold"
              >
                ✨ Create Your First World
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Footer */}
      <footer className="w-full py-8 sm:py-12 text-center text-sm text-muted-foreground mt-16 sm:mt-24 border-t border-border/30">
        <p className="mb-2 font-medium">Agent World</p>
        <p className="text-xs">&copy; {new Date().getFullYear()} All rights reserved. Built with ❤️</p>
      </footer>
    </div>
  );
}

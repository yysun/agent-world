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
 * - Experts-style UI with tabs and sort dropdown
 * 
 * Implementation:
 * - Uses useWorldData hook for CRUD operations
 * - Uses React Router for navigation
 * - Inline create form (no modal)
 * - Grid layout for world cards with shadcn Card
 * - Error handling with user feedback
 * 
 * Changes:
 * - 2026-02-01: Redesigned to match Experts page style with tabs and compact cards
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

export default function HomePage() {
  const navigate = useNavigate();
  const { worlds, loading, error, createWorld, refetch } = useWorldData();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldDescription, setNewWorldDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('recent');
  const [activeTab, setActiveTab] = useState('all');

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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2">
              Welcome to Agent World
            </h1>
            <p className="text-base text-muted-foreground">
              Browse and create worlds to get more done.
            </p>
          </div>
          <Button
            onClick={() => setShowCreateForm(!showCreateForm)}
            size="default"
            className="flex items-center gap-2"
          >
            <span className="text-lg">+</span>
            <span>Create</span>
          </Button>
        </div>

        {/* Tabs and Sort */}
        <div className="flex items-center justify-between mb-6 border-b">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between">
              <TabsList className="bg-transparent border-0 p-0 h-auto">
                <TabsTrigger
                  value="all"
                  className="border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent rounded-none px-4 py-2"
                >
                  All Worlds
                </TabsTrigger>
                <TabsTrigger
                  value="my"
                  className="border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent rounded-none px-4 py-2"
                >
                  My Worlds
                </TabsTrigger>
              </TabsList>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recent</SelectItem>
                  <SelectItem value="popular">Popular</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Tabs>
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
          <Card className="mb-8 max-w-2xl mx-auto shadow-lg">
            <CardHeader className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl">🌍</div>
                <CardTitle className="text-xl">Create New World</CardTitle>
              </div>
              <CardDescription>
                Enter details for your new AI agent world
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateWorld} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="worldName" className="text-sm font-medium text-foreground">
                    World Name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="text"
                    id="worldName"
                    value={newWorldName}
                    onChange={(e) => setNewWorldName(e.target.value)}
                    placeholder="e.g., Customer Support Team"
                    required
                    disabled={creating}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="worldDescription" className="text-sm font-medium text-foreground">
                    Description
                  </label>
                  <Textarea
                    id="worldDescription"
                    value={newWorldDescription}
                    onChange={(e) => setNewWorldDescription(e.target.value)}
                    placeholder="Describe the purpose of this world..."
                    rows={3}
                    disabled={creating}
                  />
                </div>

                {createError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-sm text-destructive">{createError}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    type="submit"
                    disabled={creating || !newWorldName.trim()}
                    className="flex-1"
                  >
                    {creating ? 'Creating...' : 'Create World'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
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
        <Tabs value={activeTab} className="w-full">
          <TabsContent value="all" className="mt-0">
            {worlds.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {worlds.map((world) => (
                  <Card
                    key={world.id}
                    className="cursor-pointer hover:shadow-md transition-all duration-200 group"
                    onClick={() => selectWorld(world.id)}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl flex-shrink-0">
                          🌍
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base font-semibold mb-1 line-clamp-1">
                            {world.name}
                          </CardTitle>
                          <CardDescription className="text-sm line-clamp-2">
                            {world.description || 'AI agent world'}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="px-4 pb-4 pt-0 flex items-center justify-between text-xs text-muted-foreground">
                      <span>By Agent World</span>
                      <span>Active</span>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : !showCreateForm ? (
              <Card className="max-w-md mx-auto text-center">
                <CardHeader className="space-y-3 pb-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center text-3xl">
                    🌟
                  </div>
                  <CardTitle className="text-xl">No Worlds Yet</CardTitle>
                  <CardDescription>
                    Create your first world to get started with AI agents.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-6">
                  <Button
                    onClick={() => setShowCreateForm(true)}
                    className="w-full"
                  >
                    Create Your First World
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>
          <TabsContent value="my" className="mt-0">
            {worlds.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {worlds.map((world) => (
                  <Card
                    key={world.id}
                    className="cursor-pointer hover:shadow-md transition-all duration-200 group"
                    onClick={() => selectWorld(world.id)}
                  >
                    <CardHeader className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl flex-shrink-0">
                          🌍
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base font-semibold mb-1 line-clamp-1">
                            {world.name}
                          </CardTitle>
                          <CardDescription className="text-sm line-clamp-2">
                            {world.description || 'AI agent world'}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="px-4 pb-4 pt-0 flex items-center justify-between text-xs text-muted-foreground">
                      <span>By You</span>
                      <span>Active</span>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="max-w-md mx-auto text-center">
                <CardHeader className="space-y-3 pb-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center text-3xl">
                    📝
                  </div>
                  <CardTitle className="text-xl">No Personal Worlds</CardTitle>
                  <CardDescription>
                    Worlds you create will appear here.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

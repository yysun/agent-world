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
 * 
 * Implementation:
 * - Uses useWorldData hook for CRUD operations
 * - Uses React Router for navigation
 * - Inline create form (no modal)
 * - Grid layout for world cards
 * - Error handling with user feedback
 * 
 * Changes:
 * - 2025-11-03: Created for Phase 6, adapted from Next.js app/page.tsx
 * - 2025-11-03: Changed from REST API to WebSocket commands via hooks
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorldData } from '@/hooks/useWorldData';
import Loading from '@/components/Loading.tsx';

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
    <div className="min-h-screen flex flex-col bg-background font-sans">
      {/* Header: Title, Subtitle, Add Button */}
      <div className="w-full max-w-4xl mx-auto p-6 pt-10">
        <div className="text-center mb-4">
          <h1 className="text-4xl font-bold text-foreground mb-2 font-sans">Agent World</h1>
          <p className="text-lg text-muted-foreground font-sans">Select a world or create a new one</p>
        </div>
        <div className="mb-2 text-center">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-primary hover:bg-primary/80 text-primary-foreground px-6 py-3 rounded-xl font-medium transition-colors shadow-sm"
          >
            Create New World
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="max-w-4xl mx-auto px-6 w-full mb-4">
          <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
            Error: {error.message}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div className="max-w-4xl mx-auto p-6 w-full">
          {/* Create World Form */}
          {showCreateForm && (
            <div className="bg-card rounded-2xl shadow-lg p-8 mb-8 border border-primary/30">
              <form onSubmit={handleCreateWorld}>
                <div className="mb-4">
                  <label htmlFor="worldName" className="block text-sm font-medium text-foreground mb-2">
                    World Name
                  </label>
                  <input
                    type="text"
                    id="worldName"
                    value={newWorldName}
                    onChange={(e) => setNewWorldName(e.target.value)}
                    className="w-full px-3 py-2 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground font-sans"
                    placeholder="Enter world name..."
                    required
                    disabled={creating}
                  />
                </div>
                <div className="mb-4">
                  <label htmlFor="worldDescription" className="block text-sm font-medium text-foreground mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    id="worldDescription"
                    value={newWorldDescription}
                    onChange={(e) => setNewWorldDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-primary/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 bg-background text-foreground font-sans"
                    placeholder="Enter world description..."
                    rows={3}
                    disabled={creating}
                  />
                </div>

                {createError && (
                  <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
                    {createError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={creating || !newWorldName.trim()}
                    className="bg-primary hover:bg-primary/80 disabled:bg-muted text-primary-foreground px-4 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:cursor-not-allowed"
                  >
                    {creating ? 'Creating...' : 'Create World'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setCreateError(null);
                    }}
                    disabled={creating}
                    className="bg-muted hover:bg-muted/80 text-foreground px-4 py-2 rounded-lg font-medium transition-colors shadow-sm border border-primary/30 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Worlds Grid */}
          <div className="w-full flex justify-center">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl w-full">
              {worlds.map((world) => (
                <div
                  key={world.id}
                  onClick={() => selectWorld(world.id)}
                  className="bg-card rounded-2xl border border-primary/30 shadow-lg p-6 cursor-pointer hover:shadow-xl transition-shadow min-w-[220px] max-w-xs w-full flex flex-col justify-between group h-[142px]"
                >
                  <div>
                    <h3 className="text-xl font-semibold text-foreground mb-2 font-sans">{world.name}</h3>
                    {world.description && (
                      <p className="text-muted-foreground text-sm font-sans line-clamp-2">{world.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); selectWorld(world.id); }}
                    className="mt-4 text-muted-foreground text-sm font-medium group-hover:underline self-start bg-transparent border-none p-0 cursor-pointer focus:outline-none"
                    tabIndex={0}
                  >
                    Click to enter →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {worlds.length === 0 && !showCreateForm && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg mb-4 font-sans">No worlds found</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-primary hover:bg-primary/80 text-primary-foreground px-6 py-3 rounded-xl font-medium transition-colors shadow-sm"
              >
                Create Your First World
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="w-full py-4 text-center text-xs text-muted-foreground bg-background border-t border-primary/10 mt-auto">
        &copy; {new Date().getFullYear()} Agent World. All rights reserved.
      </footer>
    </div>
  );
}

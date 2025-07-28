'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface World {
  id: string;
  name: string;
  description?: string;
}

export default function Home() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldDescription, setNewWorldDescription] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadWorlds();
  }, []);

  const loadWorlds = async () => {
    try {
      const response = await fetch('/api/worlds');
      const data = await response.json();
      setWorlds(data.worlds || []);
    } catch (error) {
      console.error('Error loading worlds:', error);
    } finally {
      setLoading(false);
    }
  };

  const createWorld = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorldName.trim()) return;

    setCreating(true);
    try {
      const response = await fetch('/api/worlds', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newWorldName,
          description: newWorldDescription,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setWorlds([...worlds, data.world]);
        setNewWorldName('');
        setNewWorldDescription('');
        setShowCreateForm(false);
      }
    } catch (error) {
      console.error('Error creating world:', error);
    } finally {
      setCreating(false);
    }
  };

  const selectWorld = (worldId: string) => {
    router.push(`/world/${worldId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-lg text-muted-foreground font-sans">Loading worlds...</div>
      </div>
    );
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
      <div className="flex-1 flex flex-col">
        <div className="max-w-4xl mx-auto p-6 w-full">
          {/* Create World Form */}
          {showCreateForm && (
            <div className="bg-card rounded-2xl shadow-lg p-8 mb-8 border border-primary/30">
              <form onSubmit={createWorld}>
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
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={creating}
                    className="bg-primary hover:bg-primary/80 disabled:bg-muted text-primary-foreground px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                  >
                    {creating ? 'Creating...' : 'Create World'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="bg-muted hover:bg-muted/80 text-foreground px-4 py-2 rounded-lg font-medium transition-colors shadow-sm border border-primary/30"
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
                      <p className="text-muted-foreground text-sm font-sans">{world.description}</p>
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

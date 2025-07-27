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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">Loading worlds...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Agent World</h1>
          <p className="text-lg text-gray-600">Select a world or create a new one</p>
        </div>

        {/* Create World Button */}
        <div className="mb-8 text-center">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Create New World
          </button>
        </div>

        {/* Create World Form */}
        {showCreateForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <form onSubmit={createWorld}>
              <div className="mb-4">
                <label htmlFor="worldName" className="block text-sm font-medium text-gray-700 mb-2">
                  World Name
                </label>
                <input
                  type="text"
                  id="worldName"
                  value={newWorldName}
                  onChange={(e) => setNewWorldName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter world name..."
                  required
                />
              </div>
              <div className="mb-4">
                <label htmlFor="worldDescription" className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  id="worldDescription"
                  value={newWorldDescription}
                  onChange={(e) => setNewWorldDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter world description..."
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-md font-medium transition-colors"
                >
                  {creating ? 'Creating...' : 'Create World'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Worlds Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {worlds.map((world) => (
            <div
              key={world.id}
              onClick={() => selectWorld(world.id)}
              className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-shadow border-l-4 border-blue-500"
            >
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{world.name}</h3>
              {world.description && (
                <p className="text-gray-600 text-sm">{world.description}</p>
              )}
              <div className="mt-4 text-blue-600 text-sm font-medium">Click to enter →</div>
            </div>
          ))}
        </div>

        {worlds.length === 0 && !showCreateForm && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg mb-4">No worlds found</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Create Your First World
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

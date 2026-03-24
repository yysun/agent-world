/**
 * Purpose:
 * - Render the Home page feature view using the layered web view architecture.
 *
 * Key Features:
 * - Handles loading, error, empty, and populated world-selection states.
 * - Delegates carousel and modal behavior to feature-owned view dependencies.
 *
 * Notes on Implementation:
 * - This feature view owns Home-specific composition while generic layout pieces come from patterns.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the Home feature view module for the layered refactor.
 */

import { CenteredStatePanel } from '../../../patterns';
import type { World } from '../../../types';
import SwipeCarousel from './swipe-carousel';

export interface HomeViewState {
  worlds: World[];
  loading: boolean;
  error: string | null;
  showWorldEdit: boolean;
  worldEditMode: 'create' | 'edit' | 'delete';
  selectedWorldForEdit: World | null;
}

type HomePageViewProps = {
  state: HomeViewState;
};

export function HomePageView({ state }: HomePageViewProps) {
  if (state.loading) {
    return <div className="home-page max-w-7xl mx-auto px-8 py-4" data-testid="home-page">
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-2xl text-text-secondary">Loading worlds...</div>
      </div>
    </div>;
  }

  if (state.error) {
    return <div className="home-page max-w-7xl mx-auto px-8 py-4" data-testid="home-page">
      <CenteredStatePanel
        title="Error loading worlds"
        body={state.error}
        actions={[{ label: 'Retry', $onclick: '/' }]}
      />
    </div>;
  }

  if (state.worlds.length === 0) {
    return <div className="home-page max-w-7xl mx-auto px-8 py-4" data-testid="home-page">
      <CenteredStatePanel
        title="No worlds found"
        body="Create your first world to get started!"
        actions={[{ label: 'Create World', $onclick: 'open-world-create', 'data-testid': 'world-create-empty' }]}
      />
    </div>;
  }

  return <div className="home-page max-w-7xl mx-auto px-8 py-4 min-h-screen flex flex-col justify-center" data-testid="home-page">
    <div className="flex justify-center mb-8">
      <h1 className="banner-title text-4xl tablet:text-5xl desktop:text-6xl font-bold text-center">
        PICK YOUR WORLD
      </h1>
    </div>

    <SwipeCarousel worlds={state.worlds} />
  </div>;
}

export default HomePageView;
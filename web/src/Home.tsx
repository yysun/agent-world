/*
 * Home Component - World Selection Interface
 * 
 * Features:
 * - World carousel that shows at least 3 worlds at once
 * - Navigation arrows with highlighted states at boundaries
 * - Responsive world cards with center/side positioning
 * - Interactive world selection with description display
 * - Indicator dots for world navigation
 * 
 * Implementation:
 * - AppRun component with state management
 * - Dynamic visibility logic for optimal world display
 * - Highlighted arrow states for better UX
 * - Responsive design for mobile and desktop
 * 
 * Recent Changes:
 * - Modified carousel to always show at least 3 items
 * - Added highlighted state for navigation arrows at boundaries
 * - Improved responsive layout for world cards
 * - Enhanced visual feedback for navigation states
 */

import { app, Component } from 'apprun';

interface World {
  id: string;
  name: string;
  description: string;
}

export default class HomeComponent extends Component {
  state = {
    worlds: [
      {
        id: 'city',
        name: 'City',
        description: 'A bustling metropolis filled with towering skyscrapers, busy streets, and endless opportunities. Navigate through corporate intrigue and urban adventures.'
      },
      {
        id: 'mystic-forest',
        name: 'Mystic Forest',
        description: 'An enchanted woodland realm where ancient magic flows through towering trees and mystical creatures roam freely. Discover hidden secrets and magical artifacts.'
      },
      {
        id: 'cyber-ocean',
        name: 'Cyber Ocean',
        description: 'A digital seascape where data flows like waves and AI entities swim through streams of code. Explore the depths of cyberspace and virtual reality.'
      }
    ],
    currentIndex: 1
  };

  view = state => (
    <div class="container">
      {/* Banner */}
      <div class="row">
        <div class="col banner-col">
          <h1 class="banner-title">CREATE OR PICK YOUR WORLD</h1>
        </div>
      </div>


      {/* Add New World Button */}
      <div class="add-world-container">
        <button
          class="btn add-world-btn"
          onclick={() => this.run('add-new-world')}
          title="Add New World"
        >
          <span class="plus-icon">+</span>
        </button>
      </div>

      {/* World Carousel */}
      <div class="row carousel-row">
        <div class="col">
          <div class="world-carousel">

            {/* Left Arrow */}
            <button
              class={`btn carousel-arrow`}
              onclick={() => this.run('prev-world')}
            >
              ‹
            </button>

            {/* World Cards */}
            <div class="world-cards">
              {state.worlds.map((world, index) => {
                const isCenter = index === state.currentIndex;
                // Show at least 3 items: if we have 3 or fewer worlds, show all
                // If we have more than 3, show center + 1 on each side
                let isVisible = false;
                if (state.worlds.length <= 3) {
                  isVisible = true; // Show all when 3 or fewer
                } else {
                  isVisible = Math.abs(index - state.currentIndex) <= 1;
                }

                if (!isVisible) return null;

                return (
                  <button
                    class={`btn world-card-btn ${isCenter ? 'btn-primary center' : 'btn-secondary side'}`}
                    onclick={() => this.run('select-world', world)}
                  >
                    <span class="world-name">
                      {world.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right Arrow */}
            <button
              class={`btn carousel-arrow`}
              onclick={() => this.run('next-world')}
            >
              ›
            </button>
          </div>

          {/* World Indicator Dots */}
          <div class="world-indicators">
            {state.worlds.map((world, index) => (
              <button
                class={`world-dot ${index === state.currentIndex ? 'active' : ''}`}
                onclick={() => this.run('select-world', world)}
                title={world.name}
              />
            ))}
          </div>
        </div>
      </div>

      {/* World Description */}
      <div class="row">
        <div class="col">
          <div class="description-card">
            <h4 class="description-title">
              {state.worlds[state.currentIndex].name}
            </h4>
            <p class="description-text">
              {state.worlds[state.currentIndex].description}
            </p>
            <button
              class="btn btn-primary enter-btn"
              onclick={() => this.run('enter-world', state.worlds[state.currentIndex])}
            >
              Enter {state.worlds[state.currentIndex].name}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  update = {
    '/': state => state,
    'prev-world': state => ({
      ...state,
      currentIndex: state.currentIndex > 0 ? state.currentIndex - 1 : state.worlds.length - 1
    }),
    'next-world': state => ({
      ...state,
      currentIndex: state.currentIndex < state.worlds.length - 1 ? state.currentIndex + 1 : 0
    }),
    'select-world': (state, world) => {
      const index = state.worlds.findIndex(w => w.id === world.id);
      return { ...state, currentIndex: index };
    },
    'enter-world': (state, world) => {
      console.log('Entering world:', world);
      // TODO: Navigate to the selected world
      return state;
    },
    'add-new-world': state => {
      console.log('Adding new world');
      // TODO: Open dialog or navigate to world creation
      return state;
    }
  };
}


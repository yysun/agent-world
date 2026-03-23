/**
 * Queue Feature Components Barrel
 *
 * Purpose:
 * - Expose queue-specific business UI components owned by the renderer queue feature.
 *
 * Key Features:
 * - Provides a feature-scoped import surface separate from the shared design-system layers.
 * - Keeps queue message and agent queue presentation grouped by business domain.
 *
 * Implementation Notes:
 * - This barrel is for business-specific renderer UI and must not be promoted into `design-system/`.
 *
 * Recent Changes:
 * - 2026-03-23: Added the initial feature-scoped queue components barrel.
 */

export { default as AgentQueueDisplay } from './AgentQueueDisplay';
export { default as MessageQueuePanel } from './MessageQueuePanel';
export { default as QueueMessageItem } from './QueueMessageItem';
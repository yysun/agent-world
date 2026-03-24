/**
 * Purpose:
 * - Re-export public primitive view building blocks for the web app.
 *
 * Key Features:
 * - Provides stable imports for generic controls during the layered refactor.
 *
 * Notes on Implementation:
 * - Keep this barrel limited to presentation-focused primitives.
 *
 * Summary of Recent Changes:
 * - 2026-03-24: Added the primitive layer barrel exports.
 */

export { PrimitiveButton } from './button';
export { PrimitiveInput } from './input';
export { PrimitiveSelect } from './select';
export { PrimitiveTextarea } from './textarea';
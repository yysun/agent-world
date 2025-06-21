/*
 * Simple Types for CLI Commands
 * 
 * Basic type definitions for simplified CLI.
 * 
 * Changes:
 * - Simplified to pass World object directly to commands
 * - Removed SimpleState wrapper - commands now receive World directly
 */

import { World } from '../../world/World';

export type SimpleCommand = (args: string[], world: World) => Promise<void>;

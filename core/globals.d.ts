/**
 * Global type declarations for Agent World Core
 *
 * Note: __IS_BROWSER__ has been replaced with runtime environment detection
 * via isNodeEnvironment() function in utils.ts
 */

// Reserved for future global type declarations
// Currently includes module declarations for lightweight markdown conversion packages.

declare module 'turndown' {
  export type ReplacementFunction = (content: string, node: Node, options: unknown) => string;

  export type Rule = {
    filter: string | string[] | ((node: Node, options: unknown) => boolean);
    replacement: ReplacementFunction;
  };

  export default class TurndownService {
    constructor(options?: Record<string, unknown>);
    use(plugin: unknown): void;
    addRule(key: string, rule: Rule): void;
    turndown(input: string): string;
  }
}

declare module 'turndown-plugin-gfm' {
  export const gfm: unknown;
}

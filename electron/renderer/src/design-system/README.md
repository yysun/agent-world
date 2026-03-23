# Electron Renderer Design System

This directory owns the renderer design-system core.

Allowed contents by layer:

- `foundations/`: tokens, globals, and other product-agnostic visual rules.
- `primitives/`: atomic generic reusable base components such as buttons, cards, menu items, radios, checkboxes, switches, and other form controls with no business-specific behavior.
- `patterns/`: generic composed structures built from foundations and primitives, such as reusable dialog shells, labeled field wrappers, panel action bars, or editor layouts.

Forbidden contents:

- No chat, world, agent, queue, skill, settings, timer, status, or navigation-specific UI in this directory unless it has first been generalized into an atomic base component.
- No imports from business-specific renderer UI into `primitives/` or `patterns/`.
- No feature-specific selectors in `foundations/` unless they are generalized first.

Dependency direction:

- `foundations -> primitives -> patterns -> business-specific UI`

When classification is unclear, keep the module in `components/` until the abstraction is genuinely generic.
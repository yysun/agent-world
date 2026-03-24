---
name: react-architect
description: >
  Enforce three-layer UI architecture (Foundations → Primitives → Patterns) for React + Tailwind projects.
  Use this skill whenever the user creates, modifies, reviews, or refactors React components, UI styling,
  CSS variables, Tailwind tokens, or design system code. Also use when the user asks where a component belongs,
  how to organize UI code, whether something should be a primitive or pattern, or how to avoid duplication
  in their component library — even if they don't mention "design system" or "three layers" explicitly.
---

# Three-Layer UI Architecture

Organize React + Tailwind UI code into three strict layers so components stay reusable, consistent, and free of accidental coupling.

## When to Apply

Apply whenever you:
- **Create** a new React component, CSS variable, or Tailwind token
- **Modify** an existing UI component's styling or structure
- **Review** code that touches `design-system/` or component files
- **Refactor** UI code — decide what to extract and where it belongs

Skip when: writing backend code, tests-only changes, or config/build files.

## The Three Layers

| # | Layer | What goes here | Directory | Examples |
|---|-------|---------------|-----------|----------|
| 1 | **Foundations** | Design tokens & shared styles — no JSX | `design-system/foundations/` | CSS custom properties, `tokens.css`, Tailwind theme extensions, shared field styles, spacing/color/typography scales |
| 2 | **Primitives** | Single-purpose reusable React components | `design-system/primitives/` | Button, Input, Textarea, Select, Checkbox, Radio, Switch, Badge, Card, Dialog, Tabs, Tooltip, IconButton |
| 3 | **Patterns** | Composed layouts built from Primitives | `design-system/patterns/` | AppShell, SidebarLayout, FormSection, PageHeader, FilterBar, EmptyState, BaseEditor, TextEditorDialog |

Anything serving only **one feature/page/workflow** stays outside `design-system/` in feature or app-shell code.

## Recommended Folder Structure

The three-layer design system works best when the rest of the app is **also** organized deliberately. Do not turn `components/` into a catch-all bucket for every non-design-system file.

Recommended shape:

```text
src/
├── app/                         # app shell, route shells, top-level providers
├── design-system/
│   ├── foundations/
│   ├── primitives/
│   └── patterns/
├── features/
│   ├── chat/
│   ├── settings/
│   ├── worlds/
│   └── skills/
└── shared/                      # non-UI shared helpers used across features
```

Use these placement rules:

- `app/`: top-level layout, routing shells, app-wide orchestration, providers
- `design-system/`: only Foundations, Primitives, and Patterns
- `features/<domain>/`: business-specific UI, hooks, view models, and helpers for a product area
- `shared/`: cross-feature utilities, hooks, constants, and types that are not design-system UI

If the repo already has a `components/` folder, treat it as transitional unless it is already feature-scoped. Prefer moving toward `features/<domain>/components/` or `app/` ownership rather than adding more unrelated modules into one flat directory.

## Dependency Direction

```
Foundations  ←  Primitives  ←  Patterns  ←  Feature code
```

Arrows point toward the UI layer a file may depend on. Treat this as an adjacent-only UI chain and do not skip layers:

- **Foundations** import nothing from the UI layers — they are the leaf.
- **Primitives** import only from Foundations. Never from Patterns or feature code.
- **Patterns** import from Foundations and Primitives. Never from feature code.
- **Feature view code** may import from the Patterns layer only.
- **App/page shell code** may assemble features and patterns, but must not import Primitives or Foundations directly.
- **No skipped UI-layer imports**: features do not reach down to Primitives or Foundations; Patterns do not reach into features.
- **No lateral imports** within the same layer (exception: re-exports in `index.ts`).

This restriction is for UI-layer imports. Non-UI imports such as `types`, `domain`, `api`, and `utils` remain allowed where they belong.

Violating this direction creates circular dependencies and makes components impossible to reuse. When you notice an upward import, refactor it out — push shared logic down to the correct layer.

## Decision Flowchart

When adding or changing UI code, walk through these questions in order:

1. **Is it a raw visual value** (color, spacing, radius, shadow, font size, z-index)?
   → Check if a Foundation token exists. If not, add one to `tokens.css` or the relevant foundations file.
   → Never hard-code values like `#1a1a2e` or `text-[14px]` — use the token.

2. **Is it a single interactive control** (button, input, toggle, card, badge)?
   → Check if a Primitive exists. Reuse it. If a variant is missing, add a variant to the existing Primitive.
   → Only create a new Primitive when no existing one is close.

3. **Is it a composed structure** used (or likely to be used) on 2+ screens?
   → Check if a Pattern exists. Reuse or extend it.
   → Only create a new Pattern when composition of Primitives is clearly repeated.

4. **Is it specific to one feature/page/workflow?**
   → Keep it in `features/<domain>/` or `app/`. Do not add to `design-system/`.

5. **Still unsure?** → Place it in the owning feature folder first. Promote to the design system later when reuse actually appears — premature abstraction is worse than mild duplication.

## Constraints

### Foundations
- Pure data: tokens, CSS variables, style objects, Tailwind config — no React components
- Every repeated visual value (color, spacing, radius, shadow) should live here
- Use semantic names (`--color-surface`, `--spacing-md`) not raw values

### Primitives
- Generic: no business logic, no feature-specific props
- Reference Foundation tokens (CSS variables / Tailwind theme), not raw values
- Support relevant states: `disabled`, `loading`, `error`; sizes and variants as needed
- Accessible: semantic HTML elements, keyboard navigable, visible focus ring, proper `aria-` labels
- No `div`-as-button — use `<button>`, `<input>`, `<select>`, etc.

### Patterns
- Compose from Primitives (and Foundations), not raw HTML
- Reusable across 2+ screens — if only one screen uses it, it belongs in feature code
- No business logic: accept data and callbacks via props
- May manage local layout state (e.g., sidebar open/closed), but never domain state

### Tailwind Usage
- Prefer utility classes over custom CSS
- Avoid repeated arbitrary values (`bg-[#1a1a2e]`) — extract to a Foundation token instead
- Use semantic theme names (`bg-surface`, `text-muted`) over raw Tailwind colors
- When a group of utilities repeats across 3+ components, extract to Foundations

### React
- Functional components only
- Local state stays local; lift only when a parent genuinely needs it
- Composition over mega-components — a component doing too many things should be split

## Barrel Exports

Each layer re-exports all public items from an `index.ts`:

```
design-system/
├── index.ts              ← re-exports foundations, primitives, patterns
├── foundations/index.ts
├── primitives/index.ts
└── patterns/index.ts
```

When you add a new Primitive or Pattern, also add its export to the layer's `index.ts`. Feature code imports shared UI from the Patterns barrel, not from individual Primitive files — this keeps import paths stable and preserves the layer boundary.

## Generation Order

When writing new UI code, follow this sequence:

1. Scan existing Foundations — reuse tokens
2. Scan existing Primitives — reuse components
3. Scan existing Patterns — reuse layouts
4. Place business-specific UI in the owning `features/<domain>/` folder or `app/`
5. Create a new shared item only when reuse is insufficient
6. Wire business logic in feature code, never inside the design system

## Review Checklist

Before finishing any UI change, verify:

- [ ] No raw visual values — repeated colors/spacing/radius are Foundation tokens
- [ ] No duplicated base controls — extracted to Primitives
- [ ] No duplicated composed structures — extracted to Patterns
- [ ] Business-specific code is in `features/<domain>/` or `app/`, not in `design-system/`
- [ ] Dependency direction is correct (no upward or skipped-layer UI imports)
- [ ] Feature/app UI does not import Primitives or Foundations directly
- [ ] New shared items are exported from their layer's `index.ts`
- [ ] Accessible: semantic HTML, keyboard support, visible focus, proper labels

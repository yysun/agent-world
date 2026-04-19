---
name: react-tailwind-layered-web
description: >
  Build, refactor, review, or organize a React + Tailwind web app using a layered UI architecture:
  `src/foundations`, `src/primitives`, `src/patterns`, `src/features`, `src/pages`, `src/shell`,
  and `src/shared`. Use this skill whenever the user asks to create or change pages, routes,
  layouts, components, styling, feature UI, or app structure, especially when deciding where code
  belongs, how dependencies should flow, how to keep routes thin, or how to avoid dumping code into
  catch-all folders like `components` or `lib`.
---

# React Tailwind Layered Web

Use this skill to keep React + Tailwind apps organized around clear ownership, thin route composition, and one-way imports.

## Apply When

Apply when work touches:
- app setup, routing, layouts, or page composition
- React components, Tailwind styling, or UI refactors
- feature-specific UI and behavior
- folder placement, module ownership, or import direction

Skip when the task is backend-only, infra-only, or unrelated to the web UI.

## Core Rules

- Keep the top-level router thin.
- Keep route files thin; they should mostly compose shell and feature workspaces.
- Keep domain contracts explicit; do not invent browser-only domain behavior when ownership belongs to shared contracts or the backend.
- Prefer the lowest valid layer; do not promote code upward just because it might be reused later.
- Do not create or grow catch-all folders like `components` or `lib` when a clearer layer exists.

## Layer Map

| Layer | Purpose | Allowed contents | Disallowed contents |
|---|---|---|---|
| `src/foundations/` | Visual foundations | design tokens, Tailwind imports, base styles | React components, domain logic |
| `src/primitives/` | Generic UI controls | buttons, inputs, cards, form controls | business logic, API calls |
| `src/patterns/` | Reusable UI compositions | headers, panels, form sections, list shells | business logic, API calls |
| `src/features/` | Domain UI and behavior | product-specific views, hooks, state, feature composition | generic shared UI that belongs lower |
| `src/pages/` | Route entry points | page orchestration, route-level assembly | deep feature logic, generic UI libraries |
| `src/shell/` | App framing | layout chrome, providers, navigation shell | feature-owned domain behavior |
| `src/shared/` | Sidecar shared code | API clients, schemas, helpers, generic utilities | UI-layer imports |

## Placement Rules

Use this decision order:

1. If it is styles, tokens, or Tailwind/base CSS only, place it in `src/foundations/`.
2. If it is a generic standalone control, place it in `src/primitives/`.
3. If it is a reusable UI composition built from primitives, place it in `src/patterns/`.
4. If it knows about a product domain, workflow, or business state, place it in `src/features/`.
5. If it only wires routes, page assembly, or app framing, place it in `src/pages/` or `src/shell/`.
6. If it is non-UI shared logic, place it in `src/shared/`.

When in doubt, keep code in the owning feature first and only extract downward once it is clearly generic.

## Import Rules

Keep imports one-way:

```text
foundations -> primitives -> patterns -> features -> pages
foundations -> primitives -> patterns -> features -> shell
shared -> usable by all layers
```

Enforce these constraints:
- `foundations` imports from no UI layer
- `primitives` may use `foundations` and `shared`
- `patterns` may use `foundations`, `primitives`, and `shared`
- `features` may use `patterns`, lower UI layers if the host project already allows it, and `shared`
- `pages` and `shell` compose feature work; they should not become feature owners
- `shared` must never import from UI layers

Follow the host project's existing import style. Do not introduce aliases just for this skill.

## React + Tailwind Guidance

- Use function components.
- Prefer Tailwind utilities with `className` extension points.
- Establish a clear visual direction early and preserve it.
- Keep typography consistent:
  - `text-xs`: labels, badges, metadata, uppercase markers
  - `text-sm`: body copy, helper text, inputs, buttons, small headings
  - `text-base`: section and component titles
  - `text-lg`: page titles and prominent headings
  - `text-2xl`: stat values

## Working Sequence

For each requested change:

1. Start from the user-facing outcome.
2. Identify the owning route, shell, feature, or shared contract.
3. Place each new file in the lowest valid layer.
4. Extract repeated generic UI downward into `primitives` or `patterns`.
5. Keep domain behavior in `features` and shared contracts in `src/shared/` or the backend/service layer.
6. Keep pages and routing code thin.
7. Add the required source-file header block to every source file you create or edit when the host project requires it.

## Done Check

Before finishing:

- New code sits in the correct layer.
- Imports follow the allowed boundaries.
- Router and route files remain thin.
- Domain behavior stays in `features` or shared/server-owned contracts.
- Styling stays consistent with the chosen visual direction.
- Normal UI validation for the host app has been run.

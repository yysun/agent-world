# Electron Renderer Design System Layers Test Scenarios

## Purpose

Capture the layer-boundary behaviors required for the Electron renderer design-system refactor, including the clarification that `Primitives` are limited to atomic generic base components such as buttons, cards, menu items, inputs, and similar neutral UI building blocks.

## Scope

1. Foundations ownership and exclusion of feature-specific selectors.
2. Primitive-layer ownership for atomic base components only.
3. Pattern-layer ownership for product-agnostic composed structures.
4. Exclusion of business-specific and specialized widgets from the design-system core or from the primitive layer.
5. Stable renderer behavior while layer ownership changes.

## Layer Scenarios

1. The design-system primitive export surface exposes only atomic generic base components, not specialized status widgets, timers, sidebar affordances, or settings-specific controls.
2. A generic button-like control extracted from repeated renderer markup can be consumed by multiple feature components without carrying chat, world, skill, queue, settings, or navigation-specific naming.
3. A generic card or panel surface extracted from repeated renderer shells exposes neutral presentational props and does not embed world, agent, or message semantics.
4. A generic menu-item or list-row primitive exposes atomic selection and decoration affordances only, while feature-specific copy and behavior remain outside the primitive.
5. Product-agnostic composed structures such as layout shells or slot-based editors may live in `Patterns`, but they must consume primitives rather than be mislabeled as primitives themselves.
6. Specialized widgets such as thinking indicators, elapsed-time displays, settings-only toggles, or sidebar-specific toggle buttons remain outside `Primitives` unless they are first split into truly atomic pieces.
7. Neutral toggle controls are expressed through the generic `Switch` primitive, while labeled settings rows remain business-specific UI.
8. Repeated labeled field wrappers and side-panel footer action rows may live in `Patterns` only when they own layout/styling structure and no world, agent, or settings workflow behavior.

## Regression Scenarios

1. Rewiring business components to consume extracted atomic primitives preserves current renderer behavior and visual parity.
2. The renderer stylesheet entry remains stable while foundation CSS stays separate from feature-specific selectors.
3. Layer-aware barrels continue to make ownership obvious after primitive extraction or reclassification.
4. Business-specific components continue to render and interact correctly after imports are rewired away from any misclassified primitive exports.
5. Inline message editing, composer input, and skill-editor text editing continue to function after moving onto the shared textarea/input/select primitives.
6. Feature and app-shell entry points remain the public ownership boundaries for migrated business UI, and the narrowed compatibility barrel does not re-export those migrated surfaces.

## Edge Cases

1. A reusable component with a generic visual shell but a specialized product role is not promoted to `Primitives` unless the product role is removed from its API.
2. A component reused in several Electron screens still remains outside `Primitives` if its name or props encode a concrete renderer workflow.
3. A component that combines multiple atomic elements may belong in `Patterns` rather than `Primitives` even when it is product-agnostic.

## Validation Notes

1. Prefer targeted boundary/export tests plus focused renderer regression tests over broad snapshot tests.
2. Include at least one regression check that proves specialized widgets are excluded from the primitive barrel.
3. Reuse existing renderer tests that cover moved imports so behavior safety is validated at the production boundary.
4. Keep export-surface tests aligned with the approved atomic primitive and generic pattern set so stale tests do not reintroduce architectural drift.
5. When a generic visual wrapper such as `LabeledField` is introduced, keep accessibility ownership explicit in the consuming business component tests.
6. Include at least one regression check that the app-shell barrel exposes shell composition while `components/index.ts` remains a shrinking compatibility surface only.
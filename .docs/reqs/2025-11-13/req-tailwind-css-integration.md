# Requirement: Tailwind CSS Integration with Doodle CSS

**Date:** 2025-11-13  
**Focus:** WHAT, not HOW

## Overview

Integrate Tailwind CSS into the web frontend to leverage modern utility-first CSS capabilities while preserving the existing Doodle CSS visual identity (hand-drawn, playful aesthetic with "Short Stack" font).

## Business Goals

- **Developer Experience**: Reduce custom CSS maintenance burden (currently 2700+ lines)
- **Consistency**: Use utility classes for spacing, layout, and responsive design
- **Flexibility**: Enable faster UI iterations with Tailwind's utility patterns
- **Visual Identity**: Maintain the whimsical, hand-drawn look that defines Agent World's UI

## Core Requirements

### 1. Preserve Visual Identity

**MUST preserve:**
- Doodle CSS border effects (`.doodle` class with hand-drawn borders)
- "Short Stack" font across all components
- Existing color palette (neutral grays with slate accents)
- Hand-drawn visual style and animations
- Agent sprite graphics and animations
- World carousel graphics and effects

### 2. Tailwind Integration Scope

**Use Tailwind for:**
- Layout utilities (flexbox, grid, spacing)
- Responsive design breakpoints
- Typography utilities (size, weight, line-height)
- Color utilities (as supplements to existing palette)
- Shadows, borders, and effects (non-doodle elements)

**Keep custom CSS for:**
- Doodle.css border decorations
- Agent sprite positioning
- Complex animations (carousel, agent shake, waiting dots)
- World-specific graphics
- Message styling with left border indicators
- Modal backdrops and overlays

### 3. Migration Strategy Requirements

**Incremental adoption:**
- No big-bang rewrite (too risky for 2700+ lines of CSS)
- Start with utility replacements for common patterns
- Preserve existing selectors during transition
- Both Tailwind and custom CSS coexist initially

**Priority areas for Tailwind conversion:**
1. Layout components (containers, rows, columns, flex/grid)
2. Spacing utilities (padding, margin, gap)
3. Responsive breakpoints
4. Typography utilities

**Keep as custom CSS:**
1. Doodle borders and decorations
2. Animation keyframes
3. Sprite positioning
4. Complex state-based styling (`.selected`, `.active`, `.memory-only-message`)

### 4. Configuration Requirements

**Tailwind config must:**
- Extend (not replace) existing color palette
- Use "Short Stack" as primary font family
- Match existing breakpoints (`600px`, `768px`, `480px`)
- Support existing shadow and border-radius values
- Include custom CSS variables from `styles.css`

### 5. Build Integration

**Vite integration:**
- PostCSS integration with Tailwind
- No impact on build performance
- Automatic purging of unused Tailwind classes
- Preserve existing CSS import order

### 6. Component Migration Requirements

**AppRun components should:**
- Use `className` (not `class`) for Tailwind utilities
- Combine Tailwind utilities with existing Doodle classes
- Maintain existing event handlers and state logic
- Keep functional behavior unchanged

### 7. Non-Goals (Out of Scope)

**DO NOT:**
- Replace Doodle CSS entirely
- Change the visual design or look-and-feel
- Modify agent sprites or graphics
- Alter animation behavior
- Change AppRun component architecture
- Redesign existing UI patterns

## Success Criteria

- ✅ Tailwind CSS integrated into Vite build
- ✅ "Short Stack" font preserved across all text
- ✅ Doodle borders visible on buttons, fieldsets, and cards
- ✅ Existing color palette maintained
- ✅ No visual regressions in any component
- ✅ Responsive behavior unchanged
- ✅ Build time not significantly increased
- ✅ Both Tailwind utilities and custom CSS work together

## Constraints

- **No Breaking Changes**: All existing components must continue to work
- **Visual Parity**: UI must look identical before/after integration
- **AppRun Compatibility**: Must work with AppRun's JSX syntax (`className`)
- **Performance**: No negative impact on bundle size or render performance

## Risk Mitigation

- **Specificity Conflicts**: Tailwind's reset may conflict with Doodle CSS
- **Font Flickering**: Ensure "Short Stack" preloading still works
- **Border Override**: Tailwind borders may override Doodle borders
- **Color Drift**: Need to carefully map existing colors to Tailwind palette

## Dependencies

- Tailwind CSS v3.x
- PostCSS for Vite integration
- Autoprefixer
- Existing Doodle CSS package

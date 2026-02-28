# Architecture Plan: Tailwind CSS Integration

**Date:** 2025-11-13  
**Related Requirement:** [req-tailwind-css-integration.md](../../reqs/2025-11-13/req-tailwind-css-integration.md)

## Implementation Strategy

### Phase 1: Setup and Configuration

#### 1.1 Install Dependencies
- [x] Install `tailwindcss` as devDependency
- [x] Install `postcss` as devDependency
- [x] Install `autoprefixer` as devDependency
- [x] Install `@tailwindcss/postcss` for Tailwind v4 compatibility

**Command:**
```bash
cd web && npm install -D tailwindcss postcss autoprefixer
```

#### 1.2 Initialize Tailwind Configuration
- [x] Generate `tailwind.config.js` in `/web` directory
- [x] Configure content paths to scan `.tsx` files
- [x] Extend theme with existing color palette
- [x] Set "Short Stack" as primary font family
- [x] Match existing breakpoints
- [x] Import CSS custom properties

**Configuration structure:**
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Short Stack"', 'cursive'],
      },
      colors: {
        // Map existing CSS variables to Tailwind
      },
      screens: {
        'mobile': '480px',
        'tablet': '600px',
        'desktop': '768px',
      },
    },
  },
  plugins: [],
  // CRITICAL: Preserve Doodle CSS specificity
  corePlugins: {
    preflight: false, // Disable Tailwind's base reset
  },
}
```

#### 1.3 Create PostCSS Configuration
- [x] Create `postcss.config.js` in `/web` directory
- [x] Configure Tailwind and Autoprefixer plugins

**Configuration:**
```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

#### 1.4 Update CSS Import Order
- [x] Add Tailwind directives to top of `styles.css`
- [x] Ensure Doodle CSS import remains after Tailwind base
- [x] Preserve existing custom CSS after Tailwind utilities

**New `styles.css` structure:**
```css
/* Tailwind base, components, utilities */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Existing custom CSS starts here */
/* World Selection Screen Styles ... */
```

**ALTERNATIVE (safer):** Create separate `tailwind.css`:
```css
/* web/src/tailwind.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Then import in `main.tsx`:
```tsx
import './tailwind.css';
import 'doodle.css/doodle.css';
import './styles.css';
```

---

### Phase 2: Color Palette Mapping

#### 2.1 Extract Existing Colors from CSS Variables
- [ ] Map `:root` variables to Tailwind config
- [ ] Create semantic color names

**Mapping:**
```javascript
colors: {
  bg: {
    primary: '#ffffff',
    secondary: '#f8f9fa',
    tertiary: '#f7fafc',
    accent: '#f1f5f9',
  },
  border: {
    primary: '#e2e8f0',
    secondary: '#cbd5e0',
    accent: '#475569',
  },
  text: {
    primary: '#2d3748',
    secondary: '#4a5568',
    tertiary: '#718096',
    quaternary: '#a0aec0',
  },
  accent: {
    primary: '#475569',
    secondary: '#334155',
  },
  // State colors for messages
  message: {
    user: '#e2e8f0',
    agent: '#2196f3',
    cross: '#ff9800',
    memory: '#9e9e9e',
    system: '#e53935',
  },
}
```

#### 2.2 Create Tailwind Utility Aliases
- [ ] Add custom utilities for common patterns
- [ ] Use `@layer utilities` for custom classes

---

### Phase 3: Component Migration (Incremental)

#### Priority 1: Layout Utilities (Low Risk)

**Target patterns:**
- Container widths: `max-w-*`, `w-full`, `mx-auto`
- Flex layouts: `flex`, `flex-col`, `items-center`, `justify-center`, `gap-*`
- Grid layouts: `grid`, `grid-cols-*`
- Spacing: `p-*`, `m-*`, `gap-*`

**Example conversion:**
```tsx
// BEFORE (custom CSS)
<div class="container">
  <div class="row">
    <div class="col">

// AFTER (Tailwind + Doodle)
<div className="max-w-7xl mx-auto px-8 py-4">
  <div className="flex flex-wrap -mx-4">
    <div className="flex-1 px-4">
```

**Files to start with:**
- [x] `Layout.tsx` (minimal structure)
- [x] `Home.tsx` (carousel layout)

#### Priority 2: Spacing and Sizing

**Target patterns:**
- Padding/margin: `p-4`, `mt-2`, `mb-4`, `mx-auto`
- Width/height: `w-40`, `h-40`, `min-w-48`, `max-w-md`
- Gap: `gap-2`, `gap-4`, `space-x-2`

**Example:**
```tsx
// BEFORE
<div class="agents-list">
  <div class="agent-item">

// AFTER
<div className="flex flex-wrap gap-6 justify-center items-center">
  <div className="flex flex-col items-center gap-1 px-4 cursor-pointer">
```

#### Priority 3: Responsive Breakpoints

**Target patterns:**
- Mobile-first: `md:`, `lg:`, `tablet:`, `desktop:`
- Hide/show: `hidden`, `md:block`
- Size adjustments: `text-sm`, `md:text-base`

**Example:**
```tsx
// BEFORE (CSS media queries)
@media only screen and (max-width: 600px) {
  .world-card { width: 150px; }
}

// AFTER (Tailwind responsive utilities)
<div className="w-48 tablet:w-40 mobile:w-36">
```

#### Priority 4: Typography

**Target patterns:**
- Font size: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`
- Font weight: `font-normal`, `font-medium`, `font-bold`
- Line height: `leading-tight`, `leading-normal`, `leading-relaxed`
- Text alignment: `text-center`, `text-left`, `text-right`

**Example:**
```tsx
// BEFORE
<h1 class="banner-title">PICK YOUR WORLD</h1>

// AFTER
<h1 className="text-4xl font-bold text-text-primary">
  PICK YOUR WORLD
</h1>
```

---

### Phase 4: Preserve Critical Custom CSS

#### 4.1 Keep Doodle Borders
- [ ] Maintain `.doodle` class on body
- [ ] Preserve `.box` class with border-image
- [ ] Keep button border-image effects

**Strategy:** Apply Tailwind layout/spacing, keep Doodle decorations:
```tsx
<button className="btn btn-primary px-6 py-3 rounded-lg">
  {/* Doodle border from .btn class, Tailwind spacing */}
</button>
```

#### 4.2 Keep Agent Sprites
- [ ] Preserve sprite sheet CSS (`.agent-sprite`, `.sprite-0` - `.sprite-8`)
- [ ] Keep sprite animations (`@keyframes agentShake`, `@keyframes agentFloat`)
- [ ] Maintain message badge positioning

**No changes needed** - these are complex background-position rules.

#### 4.3 Keep Message Styling
- [ ] Preserve `.user-message`, `.agent-message` borders
- [ ] Keep `.cross-agent-message`, `.memory-only-message` indicators
- [ ] Maintain left border colors for message types

**Strategy:** Combine Tailwind layout with custom message classes:
```tsx
<div className="flex flex-col gap-1 p-4 rounded-xl max-w-full user-message">
  {/* Tailwind layout + custom .user-message border */}
</div>
```

#### 4.4 Keep Animations
- [ ] Preserve `@keyframes` definitions (waitingDots, pulse, fadeIn, agentShake)
- [ ] Keep animation classes (`.waiting-dots`, `.carousel-arrow.highlighted`)

**No changes needed** - these require custom keyframes.

#### 4.5 Keep World Carousel Graphics
- [ ] Preserve world dot indicators
- [ ] Keep carousel arrow states
- [ ] Maintain world card center/side transforms

**Partial migration:** Use Tailwind for spacing, keep transforms:
```tsx
<button className="flex items-center justify-center rounded-2xl shadow-sm world-card-btn center">
  {/* Tailwind layout + custom .world-card-btn transform */}
</button>
```

---

### Phase 5: Testing and Validation

#### 5.1 Visual Regression Checklist
- [ ] Home page world carousel displays correctly
- [ ] Agent sprites render with correct positioning
- [ ] Doodle borders visible on buttons and fieldsets
- [ ] Message borders show correct colors (user, agent, cross-agent, system)
- [ ] Animations play correctly (waiting dots, agent shake, carousel pulse)
- [ ] Responsive breakpoints work as before
- [ ] Font remains "Short Stack" everywhere
- [ ] Modal backdrops and overlays display correctly

#### 5.2 Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Android

#### 5.3 Performance Testing
- [ ] Bundle size comparison (before/after)
- [ ] Lighthouse score (no regression)
- [ ] Time to Interactive (no regression)
- [ ] CSS file size (after purge)

---

## Architecture Decision Records

### ADR-1: Disable Tailwind Preflight
**Decision:** Set `corePlugins.preflight: false` in Tailwind config.

**Rationale:**
- Tailwind's preflight reset removes default styles
- Doodle CSS relies on certain browser defaults
- Prevents conflicts with Doodle's border-image rules

**Trade-off:** Lose some Tailwind normalization, but gain compatibility.

---

### ADR-2: Use Separate `tailwind.css` File
**Decision:** Create `web/src/tailwind.css` for Tailwind directives, import before `styles.css`.

**Rationale:**
- Clear separation of concerns
- Easier to control CSS cascade order
- Safer migration path (can remove file if needed)

**Alternative considered:** Adding directives to top of `styles.css` (works but less modular).

---

### ADR-3: Incremental Migration, Not Rewrite
**Decision:** Convert components gradually, starting with low-risk layout utilities.

**Rationale:**
- 2700+ lines of CSS is too large for big-bang rewrite
- Reduces risk of visual regressions
- Allows testing at each step
- Can stop migration if issues arise

**Migration priority:**
1. Layout (containers, flex, grid)
2. Spacing (padding, margin, gap)
3. Responsive breakpoints
4. Typography

---

### ADR-4: Keep Complex CSS as Custom
**Decision:** Do NOT migrate sprite positioning, animations, or Doodle borders to Tailwind.

**Rationale:**
- These require complex CSS that Tailwind can't express
- Sprite positioning uses `background-position` with calculations
- Animations need custom `@keyframes`
- Doodle borders use `border-image` (not Tailwind compatible)

**Benefit:** Reduces migration complexity and risk.

---

### ADR-5: Use `className` (not `class`) in AppRun
**Decision:** All Tailwind utilities must use `className` attribute in `.tsx` files.

**Rationale:**
- AppRun uses JSX syntax (like React)
- `className` is the JSX standard
- Existing components already use `className` in some places

**Action:** Update components to use `className` consistently.

---

## Risk Analysis and Mitigation

### Risk 1: Specificity Wars
**Risk:** Tailwind utilities may override Doodle CSS due to specificity.

**Mitigation:**
- Disable preflight to preserve Doodle base styles
- Use Tailwind for layout/spacing (low specificity conflicts)
- Keep Doodle classes for decorations (borders, effects)
- Test each component after migration

---

### Risk 2: Font Flickering
**Risk:** Tailwind's font-family utility may cause "Short Stack" to reload.

**Mitigation:**
- Keep font preloading in `index.html`
- Set "Short Stack" as default in Tailwind config
- Test initial page load performance

---

### Risk 3: Color Drift
**Risk:** Tailwind colors may not exactly match existing palette.

**Mitigation:**
- Map existing CSS variables to Tailwind config
- Use exact hex values from `:root`
- Create semantic color names (`bg-primary`, `text-secondary`)
- Test color consistency across all components

---

### Risk 4: Bundle Size Increase
**Risk:** Adding Tailwind may significantly increase CSS bundle size.

**Mitigation:**
- Enable PurgeCSS (automatic in Tailwind 3+)
- Configure content paths to scan only `.tsx` files
- Compare bundle size before/after
- Remove unused custom CSS after migration

---

### Risk 5: Breaking Doodle Borders
**Risk:** Tailwind's border utilities may conflict with `border-image`.

**Mitigation:**
- Keep `.doodle` and `.box` classes as custom CSS
- Apply Tailwind spacing/layout, not borders
- Use `border-none` to explicitly disable Tailwind borders where needed
- Test all bordered elements (buttons, fieldsets, cards)

---

## Success Metrics

**Quantitative:**
- CSS file size reduction: Target 20-30% (custom CSS → Tailwind utilities)
- Build time change: Less than 10% increase
- Bundle size change: Less than 5% increase (after purge)
- Lighthouse score: No regression

**Qualitative:**
- Visual parity: 100% match with before state
- Developer velocity: Faster to add responsive layouts
- Maintainability: Less custom CSS to maintain
- Code consistency: Utility classes instead of ad-hoc styles

---

## Rollback Plan

If integration causes issues:

1. **Immediate rollback:**
   - Remove `tailwind.css` import from `main.tsx`
   - Revert `package.json` changes
   - Keep existing `styles.css` unchanged

2. **Partial rollback:**
   - Remove Tailwind directives from CSS
   - Keep PostCSS config (for future use)
   - Revert component `className` changes

3. **Investigation:**
   - Review browser console errors
   - Check CSS specificity conflicts
   - Test in different browsers

---

## Implementation Checklist

### Setup
- [x] Install Tailwind, PostCSS, Autoprefixer
- [x] Create `tailwind.config.js` with custom theme
- [x] Create `postcss.config.js`
- [x] Create `web/src/tailwind.css` with directives
- [x] Update `main.tsx` import order
- [x] Test build succeeds

### Configuration
- [x] Map color palette to Tailwind config
- [x] Set "Short Stack" font family
- [x] Configure responsive breakpoints
- [x] Disable preflight reset
- [x] Configure content paths for purge

### Migration (Incremental)
- [x] Convert Layout.tsx (minimal changes)
- [x] Convert Home.tsx carousel layout
- [x] Test visual parity
- [x] Convert agent list spacing
- [x] Test visual parity
- [x] Convert message layout utilities
- [x] Test visual parity
- [x] Convert responsive breakpoints
- [x] Test on mobile/tablet/desktop

### Validation
- [x] Run visual regression tests
- [x] Test all animations still work
- [x] Verify Doodle borders visible
- [x] Check font consistency
- [x] Test responsive behavior
- [x] Measure bundle size
- [x] Run Lighthouse audit

### Documentation
- [ ] Update web/README.md with Tailwind usage
- [ ] Document color palette mapping
- [ ] Add examples of combining Tailwind + Doodle
- [ ] Create migration guide for future components

---

## Future Improvements (Out of Scope)

These should NOT be done as part of this integration:

- ❌ Replace Doodle CSS entirely with Tailwind
- ❌ Redesign UI components with new visual style
- ❌ Add Tailwind plugins (forms, typography, etc.)
- ❌ Convert all custom CSS to Tailwind
- ❌ Change animation behavior
- ❌ Modify AppRun component architecture

**Future work:**
- Consider Tailwind UI components (after integration stable)
- Evaluate dark mode support (requires theme redesign)
- Add more semantic color utilities (after baseline stable)

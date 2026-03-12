# Web App — CSS & Styling Rules

Rules for anyone writing or modifying CSS in `web/src/styles.css` or adding new UI controls to the web (AppRun) frontend.

---

## Critical: `body` Always Has Class `doodle`

`index.html` sets `<body class="doodle">`. This means **every element on the page is a descendant of `.doodle`** and is subject to doodle.css rules at all times — not just in a "doodle theme" mode.

### What doodle.css does automatically

| Selector | Property | Value | Effect |
|---|---|---|---|
| `body` (via our `styles.css`) | `font-family` | `'Short Stack', cursive` | All text is handwritten unless overridden |
| `body` (via our `styles.css`) | `font-size` | `2em` | Base font is 2× browser default (≈32px) |
| `.doodle button, .doodle input, .doodle select` (doodle.css) | `font-size` | `0.5em` | Controls shrink to 0.5×body = ≈0.95rem |
| `.doodle button, .doodle input, .doodle select` (doodle.css) | `font-family` | `'Short Stack', cursive` | Controls inherit handwritten font |
| `.doodle button, .doodle input, .doodle select` (doodle.css) | `border-style/width/image` | `url(button.svg)` | Adds a hand-drawn border frame to every form control |
| `.doodle select` (doodle.css) | `appearance: none` | — | Removes native OS select chrome |
| `.doodle select` (doodle.css) | `background` | `url(caret.svg)` | Replaces native arrow with its own hand-drawn caret |
| `.doodle select` (doodle.css) | `background-position-x` | `calc(100% - 10px)` | Positions the caret 10px from the right |

---

## Overriding Doodle for Composer Controls

Composer toolbar controls (textarea, buttons, select) live in `.composer-toolbar` and need to look clean (no hand-drawn border, consistent font). All overrides must use `!important` because doodle.css specificity matches or exceeds single-class selectors.

### Established override pattern

```css
/* Step 1: Kill border-image for all composer controls */
.doodle .my-control {
  border: none !important;
  border-image: none !important;
}

/* Step 2: For <select> elements — also kill caret.svg and reset font */
.doodle .my-select-control {
  border-style: none !important;
  border-width: 0 !important;
  border-image: none !important;
  /* Replace doodle's caret.svg with a custom inline SVG arrow */
  background: transparent url("data:image/svg+xml,...") no-repeat right 0.5rem center !important;
  /* Match font to sibling button controls (Short Stack wins via .doodle button specificity) */
  font-family: 'Short Stack', cursive !important;
  font-size: var(--interactive-control-font-size, 0.95rem) !important;
  color: <your-token> !important;
  /* Ensure enough right padding so text doesn't overlap the arrow */
  padding-right: 1.6rem !important;
}
```

> **Why `'Short Stack'` not `'Inter'`?**
> `.doodle button` (specificity 0,1,1) beats `.composer-project-button` (0,1,0), so buttons
> actually render in Short Stack. A `<select>` in the same toolbar must use the same font
> to visually match — even though the base `.composer-tool-permission-select` rule says Inter.

### Do NOT use `background-position-x: unset !important`

Doodle sets `background-position-x: calc(100% - 10px)` on `.doodle select`. Overriding it with
`unset` resolves to `0%` (left edge), which moves the arrow to the left side of the control.
Instead, override the entire `background` shorthand with `!important` — the shorthand already
encodes `right 0.5rem center`.

---

## CSS Custom Properties for Interactive Controls

All composer toolbar controls use these CSS variables for sizing consistency:

| Variable | Default | Used by |
|---|---|---|
| `--interactive-control-height` | `2rem` | composer textarea, project button, permission select |
| `--interactive-control-font-size` | `0.95rem` | all toolbar controls and their doodle overrides |
| `--interactive-submit-button-size` | `2.05rem` | submit/stop button |

To resize controls globally, override these variables on `.composer-toolbar` or a parent.

---

## Adding a New `<select>` to the Composer Toolbar

Checklist:
1. Add base CSS class (e.g., `.composer-my-select`) with `appearance: none`, `border: none`, custom SVG arrow via `background` shorthand, and `padding-right` to clear the arrow.
2. Add a `.doodle .composer-my-select` override block with **all** doodle-clobbered properties as `!important` (see pattern above).
3. Add the class to the existing border-reset group:
   ```css
   .doodle .composer-textarea,
   ...
   .doodle .composer-my-select {
     border: none !important;
     border-image: none !important;
   }
   ```
4. Verify font matches `.composer-project-button` (Short Stack wins in doodle context).

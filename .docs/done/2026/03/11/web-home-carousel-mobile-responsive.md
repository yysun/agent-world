# Web Home Carousel Mobile Responsive

## Summary

- Replaced the duplicate home `Enter ...` action with a search-first flow while keeping the centered carousel card as the open action.
- Reworked the home action layout so create/delete controls share a centered row above the full-width search input.
- Ensured search always recenters the first matched world in the carousel and updated smoke helpers to target the centered card explicitly.
- Added mobile-specific hint text, restored visible outline-only inactive dots, and tightened dot sizing so long indicator rows fit on phone widths.
- Added responsive sizing tokens for world chat and chat-history controls so mobile inputs and action buttons stay readable and touch-friendly.

## Verification

- `npm run check --workspace=web`
- `npx vitest run tests/web-domain/swipe-carousel-search.test.ts`
- `npx vitest run tests/web-domain/responsive-ui.test.ts`
- `npm run test:web:e2e:run -- tests/web-e2e/app-shell.spec.ts`
- `npm run test:web:e2e:run -- tests/web-e2e/world-smoke.spec.ts`
- `npm run test:web:e2e:run -- tests/web-e2e/responsive.spec.ts`

## Code Review

- No remaining review findings after fixes.
- During CR, the app-shell smoke test selector was ambiguous after the dot-based carousel changes because the centered card and active dot shared the same accessible name. That was fixed by routing the test through the shared centered-card helper.

## Notes

- The responsive E2E home assertion now checks the dot row width directly so future style changes cannot silently reintroduce mobile overflow.
- The inactive-dot styling includes a `doodle.css` override because the default doodle button border image was inflating each dot beyond its intended inline size.

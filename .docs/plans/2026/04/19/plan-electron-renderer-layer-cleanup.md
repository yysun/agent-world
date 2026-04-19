# AP: Electron Renderer Layer Cleanup

## Scope

Implement the renderer architecture cleanup required by the four review findings without changing user-facing behavior.

## Architecture Notes

- Keep `App.tsx` as the entry/root boundary.
- Move the existing large renderer orchestration component into an app-owned module under `electron/renderer/src/app/`.
- Keep right-panel routing in `app/shell`, but split panel bodies by owner:
  - shell-owned logs panel
  - settings feature panel
  - worlds feature panel
  - agents feature panel
- Keep `LeftSidebarPanel` in `app/shell`, but extract its domain-heavy sections into feature-owned sidebar modules.
- Remove the stale legacy `components/MainContentArea.tsx` instead of continuing to carry dead migration residue.

## Plan

- [ ] Move renderer workspace orchestration out of `App.tsx` into an app-layer module and leave `App.tsx` as thin assembly.
- [ ] Split right-panel content into feature/shell modules and route them through an app-shell `RightPanelContent`.
- [ ] Extract left-sidebar world/session/import sections into feature modules and keep `LeftSidebarPanel` as composition.
- [ ] Delete the stale legacy `components/MainContentArea.tsx` and remove any leftover references.
- [ ] Update targeted renderer unit tests and boundary assertions.
- [ ] Run focused renderer tests for the new boundaries and panel/sidebar composition.

## AR Notes

- No major architecture blocker found.
- Tradeoff accepted: some prop surfaces remain large in the first extraction pass, but ownership moves to the correct layer now so later reductions are localized.

# AT: Electron Renderer Layer Cleanup

## Scenarios

1. App root composition
   - Given the renderer app root loads successfully
   - When the root component is imported
   - Then the heavy renderer workspace orchestration is delegated to an app-layer module instead of living in `App.tsx`

2. Right-panel ownership
   - Given the right panel renders different modes
   - When settings, logs, world, and agent modes are selected
   - Then `app/shell` routes to distinct shell- or feature-owned panel modules

3. Left-sidebar ownership
   - Given the left sidebar renders in normal and import modes
   - When the user opens the import flow or browses worlds/sessions
   - Then the shell composes feature-owned sidebar sections instead of owning all world/session workflow markup directly

4. Transitional boundary cleanup
   - Given the renderer layer-boundary tests run
   - When they inspect the allowed transitional seam
   - Then stale legacy components are not referenced and the shell seam only exposes intentional compatibility surfaces

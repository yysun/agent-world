# Requirement: Remove React App

**Date**: 2026-02-09  
**Type**: Cleanup / Refactoring  
**Status**: Requirements Definition

## Overview

Remove the React app workspace (`react/`) and all related documentation from the project. The project currently has two frontends - a React app (using Vite) and an AppRun app (in `web/`). The React app is being removed while keeping the AppRun-based web frontend.

## Goals

- Remove the `react/` workspace directory completely
- Remove all React-specific documentation from `docs/` and `.docs/` folders
- Remove React-related references from project documentation
- Preserve the root `package.json` unchanged (as requested)
- Keep the AppRun-based `web/` workspace intact
- Maintain all non-React documentation

## Scope

### In Scope

1. **Delete React Workspace**
   - Remove entire `/react/` directory

2. **Remove React Documentation from /docs**
   - No React-specific files found in `/docs/` (verified)

3. **Remove React Documentation from /.docs**
   - Remove `.docs/reqs/2025-11-01/req-vite-react-frontend.md`
   - Remove `.docs/reqs/2025-11-04/req-chat-design-system.md`
   - Remove `.docs/reqs/2026-02-08/req-world-page-right-settings-panel.md`
   - Remove `.docs/done/2025-11-04/ui-redesign-shadcn.md`
   - Remove `.docs/done/2026-02-08/world-page-responsive-settings-panel.md`
   - Update any other docs that reference React (but are not React-specific)

4. **Update Project Documentation**
   - Update `README.md` to remove React references
   - Update `CHANGELOG.md` to remove React references (if any recent ones)
   - Update any other root-level docs mentioning the React app

### Out of Scope

- `web/` workspace (AppRun frontend) remains unchanged
- All non-React documentation remains unchanged

### Critical Constraint Note

**User Request**: Keep root `package.json` unchanged

**Issue Identified**: The root `package.json` contains essential references to the React workspace:
- `workspaces` array includes `"react"`
- `check` script references `--workspace=react`
- `build` script references `--workspace=react`
- `react:dev:direct` script

**Impact**: If React workspace is removed but `package.json` is not updated, the project will break:
- `npm install` will fail (workspace not found)
- `npm run check` will fail
- `npm run build` will fail

**Recommendation**: Two options available:
1. **Option A**: Update `package.json` minimally (remove React references only)
2. **Option B**: Keep entire React workspace (don't remove it)

**Decision**: User selected Option A - Update package.json to remove workspace references and scripts, but keep npm package dependencies unchanged.

## Files to Remove

### 1. React Workspace (1 directory)
```
/react/
  ├── src/
  ├── index.html
  ├── package.json
  ├── postcss.config.js
  ├── tsconfig.json
  ├── vite.config.ts
  └── .env.example
```

### 2. React-Specific Documentation in .docs (5 files minimum)
```
.docs/reqs/2025-11-01/req-vite-react-frontend.md
.docs/reqs/2025-11-04/req-chat-design-system.md
.docs/reqs/2026-02-08/req-world-page-right-settings-panel.md
.docs/done/2025-11-04/ui-redesign-shadcn.md
.docs/done/2026-02-08/world-page-responsive-settings-panel.md
```

### 3. Files to Update (Remove React References)
```
README.md - Remove React/Next.js mentions, keep AppRun web UI
CHANGELOG.md - Remove React changelog entries if present
package.json - (DECISION PENDING) Remove React workspace references if removal approved
```

**Note**: `package.json` updates are technically required for project functionality, but user requested not to change it. Awaiting clarification.

**Required package.json changes** (if approved):
```json
// Remove from workspaces array:
- "react"

// Remove these scripts:
- "react:dev:direct": "npm run dev --workspace=react"

// Update check script from:
"check": "... && npm run check --workspace=react"
// To:
"check": "... && npm run check --workspace=web"

// Update build script from:
"build": "... && npm run build --workspace=react"
// To:
"build": "... && npm run build --workspace=web"
```

## Files to Preserve

- `web/` - AppRun-based web frontend (keep completely)
- `docs/apprun-frontend/` - AppRun documentation (keep)
- Root `package.json` - User requested to keep unchanged, but contains React references (see constraint note above)
- `package-lock.json` - Should be regenerated after package.json changes (if approved)
- `.docs/done/2025-10-27/framework-agnostic-domain-refactoring.md` - Keep (discusses framework agnosticism, not React-specific)
- All other documentation not listed in removal list

## Acceptance Criteria

**Pending Decision on package.json Update**

If package.json update is approved:
- [ ] `/react/` directory is completely removed
- [ ] No files remain in `/react/`
- [ ] All React-specific requirement documents are removed from `.docs/reqs/`
- [ ] All React-specific done documents are removed from `.docs/done/`
- [ ] `README.md` no longer mentions React or Next.js frontend
- [ ] `CHANGELOG.md` React entries are removed (if any)
- [ ] Root `package.json` has React workspace reference removed
- [ ] Root `package.json` has React-related scripts removed
- [ ] `web/` (AppRun) workspace is intact and functional
- [ ] No broken links or references to removed React files
- [ ] Project builds successfully: `npm run build` completes
- [ ] Project type-checks successfully: `npm run check` completes
- [ ] `npm install` completes without errors

If package.json must remain unchanged:
- [ ] No changes made (React workspace must be preserved)

## Impact Analysis

### Positive Impacts
- Reduced maintenance burden (one frontend instead of two)
- Clearer project focus on AppRun-based frontend
- Smaller repository size
- Less documentation to maintain

### Risks
- None - React app appears to be experimental/alternative frontend
- AppRun `web/` frontend is the primary/production frontend

## Dependencies

None - this is a cleanup operation.

## Non-Functional Requirements

- All changes should be completed in a single commit
- No impact on existing functionality in `web/`, `server/`, `cli/`, or `core/`
- Documentation should accurately reflect remaining web frontend options

## Notes

- The project has two web frontends: React (Vite) and AppRun
- The AppRun frontend in `web/` is the primary frontend
- React frontend was created as alternative but is being removed
- User explicitly requested to NOT change root `package.json`

# Plan: Remove Dashboard Page

**Status:** Draft  
**Date:** 2026-04-15

---

## Goal

Remove the `/demo/chart` dashboard page (Chart Demo) and all associated code — including the route file, navigation item, `PlotlyChart` component, Plotly dependency, and the post-login redirect — leaving the rest of the application intact.

## Background

The dashboard is a frontend-only chart demo (`/demo/chart`) that was added as a placeholder visualizer. It has no backend, no real data, and serves no production purpose. Removing it simplifies the navigation and eliminates the Plotly.js dependency, which is a large bundle.

---

## Phases

### Phase 1 — Remove the Route File

- [ ] Delete `frontend/src/routes/demo.chart.tsx`
- [ ] Regenerate the TanStack Router route tree: `cd frontend && npm run generate-routes` (or the equivalent build step triggers this automatically)
- [ ] Confirm `frontend/src/routeTree.gen.ts` no longer contains `/demo/chart`

### Phase 2 — Remove the Navigation Item

- [ ] In `frontend/src/components/layout/navItems.ts`, remove the `Dashboard` entry (`{ label: "Dashboard", to: "/demo/chart", icon: BarChart2 }`)
- [ ] Remove the `BarChart2` import from `lucide-react` if it is no longer used elsewhere in that file

### Phase 3 — Fix the Post-Login Redirect

- [ ] In `frontend/src/routes/index.tsx`, change the redirect target from `/demo/chart` to a suitable landing page (e.g. `/rag/documents` or `/chat`)
- [ ] Verify unauthenticated users are still shown the landing/login page

### Phase 4 — Remove the PlotlyChart Component

- [ ] Check whether `PlotlyChart` (`frontend/src/components/charts/PlotlyChart.tsx`) is used anywhere else in the codebase:
  ```
  grep -r "PlotlyChart" frontend/src --include="*.tsx" --include="*.ts"
  ```
- [ ] If not used elsewhere, delete `frontend/src/components/charts/PlotlyChart.tsx` and the `frontend/src/components/charts/` directory if it becomes empty
- [ ] Remove the corresponding test file if one exists

### Phase 5 — Remove the Plotly.js Dependency

- [ ] Check `package.json` for Plotly-related packages (`plotly.js`, `plotly.js-dist-min`, `@types/plotly.js`, etc.):
  ```
  grep -i plotly frontend/package.json
  ```
- [ ] Uninstall any packages that are no longer needed:
  ```
  cd frontend && npm uninstall plotly.js-dist-min @types/plotly.js
  ```
- [ ] Confirm there are no remaining Plotly imports:
  ```
  grep -r "plotly" frontend/src --include="*.ts" --include="*.tsx"
  ```

### Phase 6 — Update / Remove Tests

- [ ] In `frontend/src/components/layout/Sidebar.test.tsx`, remove or update any test cases that assert the Dashboard nav item is rendered
- [ ] Run the full frontend test suite and confirm all tests pass:
  ```
  just fe-test
  ```

### Phase 7 — Build Verification

- [ ] Run `just fe-build` and confirm the build succeeds with no TypeScript errors
- [ ] Spot-check the running app: log in and confirm the redirect goes to the new destination, and the sidebar no longer shows "Dashboard"

---

## Testing

- **Unit tests:** Update `Sidebar.test.tsx` to remove Dashboard-specific assertions; add an assertion that Dashboard is *not* present in the nav
- **Integration:** Log in → confirm redirect lands on the new page, not `/demo/chart`
- **Manual:**
  - Navigate directly to `/demo/chart` — expect a 404 / not-found route
  - Check sidebar: Dashboard item must be absent
  - Run `just fe-build` — no errors or warnings related to removed files
  - Verify bundle size has decreased (Plotly.js is ~3MB gzipped)

---

## Risks & Notes

- **Route tree:** TanStack Router auto-generates `routeTree.gen.ts`. After deleting the route file, the generated tree must be refreshed (via build or `tsc`) before TypeScript will stop referencing the old route.
- **Redirect destination:** Agree on where authenticated users land after login before implementing Phase 3. `/rag/documents` is the suggested default.
- **PlotlyChart reuse:** If any other feature is planned to use `PlotlyChart` in the near future, defer Phase 4 and Phase 5 until that decision is made.
- **No backend changes required:** The dashboard has no backend counterpart; this is a purely frontend change.

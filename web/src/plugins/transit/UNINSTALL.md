# Uninstalling the Transit Plugin

The plugin is designed to be dropped with zero residue. Everything it adds
lives in exactly two directories, and it touches exactly one file of the
classic app (`web/src/App.tsx`) through clearly marked blocks.

## Steps

1. Delete the plugin's code and data:

   ```bash
   git rm -r web/src/plugins/transit
   ```

2. Delete the data pipeline (only produces the plugin's `transit-data.json`):

   ```bash
   git rm -r pipeline
   ```

3. In `web/src/App.tsx`, remove the three blocks marked
   `===== TRANSIT PLUGIN =====`:

   - the lazy `TransitApp` import + `ModeToggle` import near the other
     page imports (inside the `TRANSIT PLUGIN` comment block),
   - the `<Route path="/transit/*" … />` line inside `<Routes>`,
   - the `<ModeToggle />` line just inside `<BrowserRouter>`.

4. Done. Type-check and build to confirm:

   ```bash
   npm --prefix web run typecheck && npm --prefix web run build
   ```

## What the plugin never touches

- Any file under `web/src/pages`, `web/src/components`, `web/src/lib`,
  `web/src/hooks`, `web/src/data`, `web/src/styles` — the classic app.
- The root Expo app (`src/`, `App.tsx`) — the plugin is web-only.
- `vercel.json`, `package.json`, build scripts — no new deps, no build
  steps; the generated `transit-data.json` is committed, so the Vercel
  build is unchanged.

## Notes

- The `visitkla:mode` localStorage key the toggle writes is harmless once
  the plugin is gone; no cleanup needed (browsers evict it with site data).
- If this file and the plugin are both present, these steps are canonical —
  they are kept up to date with every plugin change.

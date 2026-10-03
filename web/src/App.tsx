import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

// Route-level code splitting: the whole app was shipping as one ~1MB JS
// bundle (MapLibre GL + every page + the cinematic ride, all bundled
// together) that had to download and parse before ANY page could render —
// on a slow connection that's exactly what "takes very long to load" looks
// like. Each page now only fetches its own code the first time it's
// actually visited.
const WorldPage = lazy(() =>
  import("./pages/WorldPage").then((m) => ({ default: m.WorldPage }))
);
const RouteChoicePage = lazy(() =>
  import("./pages/RouteChoicePage").then((m) => ({ default: m.RouteChoicePage }))
);
const RoutePreviewPage = lazy(() =>
  import("./pages/RoutePreviewPage").then((m) => ({ default: m.RoutePreviewPage }))
);
const NavigationPage = lazy(() =>
  import("./pages/NavigationPage").then((m) => ({ default: m.NavigationPage }))
);
const RidePage = lazy(() =>
  import("./pages/RidePage").then((m) => ({ default: m.RidePage }))
);

// ===== TRANSIT PLUGIN (to uninstall: delete web/src/plugins/ + pipeline/, then
// remove this marked block — step-by-step in plugins/transit/UNINSTALL.md) =====
const TransitApp = lazy(() =>
  import("./plugins/transit/TransitApp").then((m) => ({ default: m.TransitApp }))
);
import { ModeToggle } from "./plugins/transit/ModeToggle";
// ==============================================================================

function RouteFallback() {
  return (
    <div className="app-route-loading">
      <span className="app-route-loading__spinner" />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<WorldPage />} />
          <Route path="/plan" element={<RouteChoicePage />} />
          <Route path="/route/:routeId" element={<RoutePreviewPage />} />
          <Route path="/route/:routeId/ride" element={<RidePage />} />
          <Route path="/route/:routeId/ride/:mode" element={<RidePage />} />
          <Route
            path="/route/:routeId/navigate/:mode"
            element={<NavigationPage />}
          />
          {/* ===== TRANSIT PLUGIN (see block above) ===== */}
          <Route path="/transit/*" element={<TransitApp />} />
          {/* ============================================= */}
        </Routes>
      </Suspense>
      {/* ===== TRANSIT PLUGIN (see block above) ===== */}
      <ModeToggle />
      {/* ============================================= */}
    </BrowserRouter>
  );
}

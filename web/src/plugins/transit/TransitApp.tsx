import { Routes, Route, Link, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { TransitHome } from "./pages/TransitHome";
import "./styles/plugin.css";

const JourneyPage = lazy(() =>
  import("./pages/JourneyPage").then((m) => ({ default: m.JourneyPage }))
);

/**
 * Transit plugin root — mounted at /transit/* and lazily loaded, so the
 * classic app never downloads a byte of this tree unless it's visited.
 * The shell (header/footer) is shared by the network explorer (/transit)
 * and the journey planner (/transit/journey).
 */
export function TransitApp() {
  const location = useLocation();
  const onJourney = location.pathname.endsWith("/journey");

  return (
    <div className="tk-app">
      <header className="tk-header">
        <div className="tk-header__brand">
          <h1 className="tk-header__title">
            VisitKla Transit{" "}
            <span className="tk-header__vintage" title="Field data vintage">
              2019/20 data
            </span>
          </h1>
          <p className="tk-header__subtitle">
            Kampala's real matatu network — every line, every stage
          </p>
        </div>
        {!onJourney && (
          <Link to="journey" className="tk-header__cta">
            Plan a journey
          </Link>
        )}
      </header>

      <main className="tk-main">
        <Routes>
          <Route index element={<TransitHome />} />
          <Route
            path="journey"
            element={
              <Suspense
                fallback={
                  <div className="app-route-loading">
                    <span className="app-route-loading__spinner" />
                  </div>
                }
              >
                <JourneyPage />
              </Suspense>
            }
          />
        </Routes>
      </main>

      <footer className="tk-footer">
        <p>
          Transit data © MapUganda &amp; Transport for Cairo (
          <a
            href="https://gitlab.com/digitaltransport/data/africa/kampala"
            target="_blank"
            rel="noreferrer"
          >
            DT4A Kampala
          </a>
          ), CC BY 3.0 · Map data © OpenStreetMap contributors
        </p>
      </footer>
    </div>
  );
}

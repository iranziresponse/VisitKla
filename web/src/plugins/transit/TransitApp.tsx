import { Routes, Route } from "react-router-dom";
import { TransitHome } from "./pages/TransitHome";
import { JourneyPage } from "./pages/JourneyPage";
import "./styles/plugin.css";

/**
 * Transit plugin root — mounted at /transit/* and lazily loaded, so the
 * classic app never downloads a byte of this tree unless it's visited.
 *
 * The journey planner IS the product surface: enter where you are and
 * where you're going, get a route. Lines are an internal planning
 * concept and never appear in this UI — /transit/network (the raw
 * lines-and-stages explorer) stays mounted as an internal inspector for
 * development and support, reachable by URL only, with no links here.
 */
export function TransitApp() {
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
            Tell us where you're going — we'll find the stages, fares and
            walks
          </p>
        </div>
      </header>

      <main className="tk-main">
        <Routes>
          <Route index element={<JourneyPage />} />
          <Route path="network" element={<TransitHome />} />
          <Route path="journey" element={<JourneyPage />} />
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

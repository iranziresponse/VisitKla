import { Routes, Route, Link, useLocation } from "react-router-dom";
import { TransitHome } from "./pages/TransitHome";
import { JourneyPage } from "./pages/JourneyPage";
import "./styles/plugin.css";

/**
 * Transit plugin root — mounted at /transit/* and lazily loaded, so the
 * classic app never downloads a byte of this tree unless it's visited.
 *
 * The journey planner is the front door (/transit): enter where you are
 * and where you're going, get a route. The whole-network explorer lives
 * one tap away at /transit/network.
 */
export function TransitApp() {
  const location = useLocation();
  const onPlanner = !location.pathname.includes("/network");

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
            {onPlanner
              ? "Matatu routes across Kampala — enter where you're going"
              : "Kampala's real matatu network — every line, every stage"}
          </p>
        </div>
        <Link
          to={onPlanner ? "network" : "journey"}
          className="tk-header__cta"
        >
          {onPlanner ? "Explore lines" : "Plan a journey"}
        </Link>
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

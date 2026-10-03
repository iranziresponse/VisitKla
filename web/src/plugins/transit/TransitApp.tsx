import { Routes, Route } from "react-router-dom";
import { TransitHome } from "./pages/TransitHome";
import { JourneyPage } from "./pages/JourneyPage";
import "./styles/plugin.css";

/**
 * Transit plugin root — mounted at /transit/* and lazily loaded, so the
 * classic app never downloads a byte of this tree unless it's visited.
 *
 * The satellite map IS the interface: no header, no footer — search,
 * routes and steps float over the imagery as glass cards, and the only
 * chrome is the mode pill (rendered by the classic app's router seam).
 * Data attributions ship through the map's attribution control; the
 * data-vintage honesty notes live on the estimates themselves.
 *
 * The journey planner is the product surface: enter where you are and
 * where you're going, get a route. Lines are an internal planning
 * concept and never appear in this UI — /transit/network (the raw
 * lines-and-stages explorer) stays mounted as an internal inspector for
 * development and support, reachable by URL only, with no links here.
 */
export function TransitApp() {
  return (
    <div className="tk-app">
      <main className="tk-main">
        <Routes>
          <Route index element={<JourneyPage />} />
          <Route path="network" element={<TransitHome />} />
          <Route path="journey" element={<JourneyPage />} />
        </Routes>
      </main>
    </div>
  );
}

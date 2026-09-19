import "./styles/plugin.css";

/**
 * Transit plugin root — mounted at /transit/* and lazily loaded, so the
 * classic app never downloads a byte of this tree unless it's visited.
 * Phase 0 scaffold: the network map, journey planner and line browser
 * slot into the layout below as they land.
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
            Kampala's real matatu network — every line, every stage
          </p>
        </div>
      </header>

      <main className="tk-main">
        <div className="tk-map-slot">
          <div className="tk-map-slot__inner">
            <p className="tk-map-slot__headline">The network is arriving</p>
            <p className="tk-map-slot__note">
              All 397 taxi &amp; bus lines with real stage stops load here in the
              next build — journey planner, line browser and stage departures
              follow right after.
            </p>
          </div>
        </div>
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

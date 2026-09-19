import { useCallback, useState } from "react";
import { NetworkMap } from "./components/NetworkMap";
import { LineCard } from "./components/LineCard";
import { StopCard } from "./components/StopCard";
import { getLine, stopByIndex } from "./lib/network";
import "./styles/plugin.css";

/**
 * Transit plugin root — mounted at /transit/* and lazily loaded, so the
 * classic app never downloads a byte of this tree unless it's visited.
 */
export function TransitApp() {
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedStopIdx, setSelectedStopIdx] = useState<number | null>(null);

  const handleSelectLine = useCallback((id: string | null) => {
    setSelectedLineId(id);
    setSelectedStopIdx(null);
  }, []);

  const handleSelectStop = useCallback((idx: number | null) => {
    setSelectedStopIdx(idx);
    if (idx !== null) setSelectedLineId(null);
  }, []);

  const selectedLine = selectedLineId ? getLine(selectedLineId) : null;
  const selectedStop = selectedStopIdx !== null ? stopByIndex(selectedStopIdx) : null;

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
        <NetworkMap
          selectedLineId={selectedLineId}
          onSelectLine={handleSelectLine}
          onSelectStop={handleSelectStop}
        />

        {selectedLine && (
          <LineCard line={selectedLine} onClose={() => handleSelectLine(null)} />
        )}
        {selectedStop && (
          <StopCard
            stop={selectedStop}
            onPickLine={(id) => handleSelectLine(id)}
            onClose={() => handleSelectStop(null)}
          />
        )}
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

import { useMemo, useState } from "react";
import {
  searchLines,
  searchStopIndices,
  stopByIndex,
} from "../lib/network";

interface SearchPanelProps {
  onPickLine: (id: string) => void;
  onPickStop: (idx: number) => void;
}

/**
 * Search over the whole network: line codes/names and stage names, merged
 * into one ranked list. Picking a result selects it on the map and flies
 * the camera there.
 */
export function SearchPanel({ onPickLine, onPickStop }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const lines = useMemo(() => searchLines(query), [query]);
  const stops = useMemo(
    () => searchStopIndices(query).map((idx) => ({ idx, stop: stopByIndex(idx) })),
    [query]
  );
  const empty = query.trim().length > 0 && lines.length === 0 && stops.length === 0;

  function pickLine(id: string) {
    setQuery("");
    setOpen(false);
    onPickLine(id);
  }

  function pickStop(idx: number) {
    setQuery("");
    setOpen(false);
    onPickStop(idx);
  }

  return (
    <div className="tk-search">
      <input
        className="tk-search__input"
        placeholder="Search lines (KA021) or stages (Bukoto)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        aria-label="Search lines or stages"
        autoComplete="off"
      />
      {open && query.trim() && (
        <div className="tk-search__results">
          {lines.length > 0 && (
            <>
              <p className="tk-search__section">Lines</p>
              {lines.map((l) => (
                <button
                  key={l.id}
                  className="tk-search__item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickLine(l.id)}
                >
                  <span className="tk-search__code">{l.code}</span>
                  <span className="tk-search__label">{l.name}</span>
                </button>
              ))}
            </>
          )}
          {stops.length > 0 && (
            <>
              <p className="tk-search__section">Stages</p>
              {stops.map(({ idx, stop }) => (
                <button
                  key={stop.i}
                  className="tk-search__item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickStop(idx)}
                >
                  <span className="tk-search__dot" aria-hidden="true" />
                  <span className="tk-search__label">{stop.n}</span>
                  <span className="tk-search__meta">{stop.ln.length} lines</span>
                </button>
              ))}
            </>
          )}
          {empty && <p className="tk-search__empty">Nothing matches “{query}”.</p>}
        </div>
      )}
    </div>
  );
}

import { getLine, type Stop } from "../lib/network";

interface StopCardProps {
  stop: Stop;
  onPickLine: (id: string) => void;
  onClose: () => void;
}

const MAX_CHIPS = 12;

/** Detail card for a tapped stage: which lines serve it. */
export function StopCard({ stop, onPickLine, onClose }: StopCardProps) {
  const lines = stop.ln.map(getLine).filter((l) => l !== undefined);
  const shown = lines.slice(0, MAX_CHIPS);
  const rest = lines.length - shown.length;

  return (
    <section className="tk-card" aria-label="Stage details">
      <button className="tk-card__close" onClick={onClose} aria-label="Close stage details">
        ✕
      </button>
      <p className="tk-card__eyebrow">Stage / stop</p>
      <h2 className="tk-card__title">{stop.n}</h2>
      <p className="tk-card__sub">
        {lines.length === 0
          ? "No lines on file stop here."
          : `${lines.length} line${lines.length === 1 ? "" : "s"} stop${lines.length === 1 ? "s" : ""} here — tap one:`}
      </p>
      <div className="tk-card__chips">
        {shown.map((l) => (
          <button key={l.id} className="tk-chip tk-chip--line" onClick={() => onPickLine(l.id)}>
            <span
              className="tk-chip__swatch"
              style={{ background: l.agency === "bus" ? "#38bdf8" : "#ff6b00" }}
              aria-hidden="true"
            />
            {l.code}
          </button>
        ))}
        {rest > 0 && <span className="tk-chip">+{rest} more</span>}
      </div>
    </section>
  );
}

import {
  bandFor,
  bandLabel,
  formatHeadway,
  getLine,
  headwayNow,
  type Stop,
} from "../lib/network";

interface StopCardProps {
  stop: Stop;
  onPickLine: (id: string) => void;
  onClose: () => void;
}

const MAX_CHIPS = 12;

/** Detail card for a tapped stage: which lines serve it, and how often. */
export function StopCard({ stop, onPickLine, onClose }: StopCardProps) {
  const lines = stop.ln.map(getLine).filter((l) => l !== undefined);
  const shown = lines.slice(0, MAX_CHIPS);
  const rest = lines.length - shown.length;
  const when = new Date();
  const band = bandFor(when);

  const departures = lines
    .map((line) => ({
      line,
      headway: Math.min(...line.v.map((v) => headwayNow(v, when))),
    }))
    .filter((d) => Number.isFinite(d.headway))
    .sort((a, b) => a.headway - b.headway)
    .slice(0, 6);

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

      {departures.length > 0 && (
        <div className="tk-card__departures">
          <p className="tk-card__departures-title">
            Typical departures — {bandLabel(band)}
          </p>
          {departures.map(({ line, headway }) => (
            <p key={line.id} className="tk-card__departure">
              <span className="tk-card__departure-code">{line.code}</span>
              every {formatHeadway(headway)}
            </p>
          ))}
          <p className="tk-card__note">
            Matatus leave when full — these are typical gaps, not a timetable.
          </p>
        </div>
      )}
    </section>
  );
}

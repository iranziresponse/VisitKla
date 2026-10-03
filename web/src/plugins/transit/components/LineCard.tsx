import {
  AGENCY_LABEL,
  bandLabel,
  formatHeadway,
  formatKm,
  formatUgx,
  variantEndpoints,
  type TransitLine,
} from "../lib/network";

interface LineCardProps {
  line: TransitLine;
  onClose: () => void;
}

const HEAD_ORDER = ["am", "mid", "pm", "eve", "night"];

/** Detail card for a tapped line: what it is, what it costs, how often it runs. */
export function LineCard({ line, onClose }: LineCardProps) {
  const best = line.v.reduce(
    (acc, v) => (v.lenM > acc.lenM ? v : acc),
    line.v[0]
  );
  const fare = Math.max(...line.v.map((v) => v.fare));
  const length = best.lenM;
  const stageCount = best.stops.length;
  const bands = HEAD_ORDER.filter((b) => best.head[b]).slice(0, 3);

  return (
    <section className="tk-card" aria-label="Line details">
      <button className="tk-card__close" onClick={onClose} aria-label="Close line details">
        ✕
      </button>
      <p className="tk-card__eyebrow">{AGENCY_LABEL[line.agency] ?? "Line"}</p>
      <h2 className="tk-card__title">
        <span className="tk-code-badge">{line.code}</span> {line.name}
      </h2>

      <div className="tk-card__stats">
        <div className="tk-stat">
          <span className="tk-stat__value">{formatUgx(fare)}</span>
          <span className="tk-stat__label">stage fare*</span>
        </div>
        <div className="tk-stat">
          <span className="tk-stat__value">{formatKm(length)}</span>
          <span className="tk-stat__label">route length</span>
        </div>
        <div className="tk-stat">
          <span className="tk-stat__value">{stageCount}</span>
          <span className="tk-stat__label">stages</span>
        </div>
      </div>

      <div className="tk-card__headways">
        {bands.length > 0 ? (
          bands.map((b) => (
            <span key={b} className="tk-chip tk-chip--headway">
              {bandLabel(b)} · every {formatHeadway(best.head[b])}
            </span>
          ))
        ) : (
          <span className="tk-chip">no schedule bands on file</span>
        )}
      </div>

      <div className="tk-card__dirs">
        {line.v.map((v) => {
          const [a, b] = variantEndpoints(v);
          return (
            <p key={v.dir} className="tk-card__dir">
              <span className="tk-card__dir-dot" aria-hidden="true" />
              {a} <span className="tk-card__dir-arrow">→</span> {b}
            </p>
          );
        })}
      </div>

      <p className="tk-card__note">*estimated fare, validate on the ground</p>
    </section>
  );
}

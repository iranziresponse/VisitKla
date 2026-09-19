import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlaceInput } from "../components/PlaceInput";
import { JourneyMap } from "../components/JourneyMap";
import {
  AGENCY_LABEL,
  formatHeadway,
  formatUgx,
  stopByIndex,
} from "../lib/network";
import { BODA_SUGGEST_M, estimateBoda } from "../lib/boda";
import {
  planJourney,
  type Journey,
  type Place,
} from "../lib/planner";

const REPORT_WHATSAPP = import.meta.env.VITE_REPORT_WHATSAPP_NUMBER as
  | string
  | undefined;

/**
 * /transit/journey — from/to → ranked journeys (direct + 1 transfer),
 * with a leg-by-leg detail view on its own map. Planning runs client-side
 * over the bundled network (worst case ~1s, hence the pending state).
 */
export function JourneyPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{
    journeys: Journey[];
    stretchedOrigin: boolean;
    stretchedDestination: boolean;
  } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const canSearch = from !== null && to !== null;

  function search() {
    if (!from || !to) return;
    setPending(true);
    setSelected(null);
    // let the pending state paint before the synchronous compute
    window.setTimeout(() => {
      const r = planJourney(from, to, { when: new Date() });
      setResult({ journeys: r.journeys, stretchedOrigin: r.stretchedOrigin, stretchedDestination: r.stretchedDestination });
      setPending(false);
    }, 30);
  }

  const journey = selected !== null && result ? result.journeys[selected] : null;
  const stretchNote =
    result && (result.stretchedOrigin || result.stretchedDestination)
      ? "Includes a longer walk than usual — the nearest surveyed stage is far away."
      : null;

  return (
    <div className="tk-journey">
      <div className="tk-journey__panel">
        <button className="tk-back" onClick={() => navigate("/transit")}>
          ← Network
        </button>
        <h2 className="tk-journey__title">Plan a matatu journey</h2>

        <div className="tk-journey__form">
          <PlaceInput
            placeholder="From — stage, place or your location"
            value={from}
            onPick={setFrom}
            onClear={() => setFrom(null)}
            allowLocation
          />
          <PlaceInput
            placeholder="To — stage or any place"
            value={to}
            onPick={setTo}
            onClear={() => setTo(null)}
          />
          <button className="tk-go" onClick={search} disabled={!canSearch || pending}>
            {pending ? "Finding journeys…" : "Find journeys"}
          </button>
        </div>

        {result && result.journeys.length === 0 && !pending && (
          <p className="tk-journey__empty">
            No matatu combination found for this trip yet — try moving the
            start or end closer to a stage, or boda part of the way.
          </p>
        )}
        {stretchNote && result && result.journeys.length > 0 && (
          <p className="tk-journey__stretch">{stretchNote}</p>
        )}

        {result && result.journeys.length > 0 && selected === null && !pending && (
          <div className="tk-results">
            {result.journeys.map((j, i) => (
              <JourneyOptionCard key={i} journey={j} onOpen={() => setSelected(i)} />
            ))}
          </div>
        )}

        {journey && (
          <div className="tk-journey__detail">
            <button className="tk-back" onClick={() => setSelected(null)}>
              ← All journeys
            </button>
            <p className="tk-journey__summary">
              {journey.totalMinutes} min · {formatUgx(journey.fare)} ·{" "}
              {journey.transfers === 0
                ? "direct"
                : `${journey.transfers} transfer`}
            </p>
            <ol className="tk-legs">
              {journey.legs.map((leg, i) =>
                leg.kind === "walk" ? (
                  <li key={i} className="tk-leg tk-leg--walk">
                    Walk {Math.round(leg.meters)} m (~
                    {Math.max(1, Math.round(leg.minutes))} min) to{" "}
                    <strong>{leg.to.name}</strong>
                    {leg.meters > BODA_SUGGEST_M && (() => {
                      const boda = estimateBoda(leg.meters);
                      return (
                        <div className="tk-leg__boda">
                          Too far to walk? A boda is ≈ {formatUgx(boda.min)}–
                          {formatUgx(boda.max)} (~
                          {Math.max(2, Math.round(leg.meters / 250))} min).
                        </div>
                      );
                    })()}
                  </li>
                ) : (
                  <li key={i} className="tk-leg tk-leg--ride">
                    <div>
                      Board at <strong>{stopByIndex(leg.stopIdxs[0]).n}</strong>{" "}
                      — <span className="tk-leg__code">{leg.line.code}</span>{" "}
                      toward {stopByIndex(leg.stopIdxs[leg.stopIdxs.length - 1]).n}
                    </div>
                    <div className="tk-leg__meta">
                      {leg.stopIdxs.length} stages · ~
                      {Math.round(leg.minutes)} min ·{" "}
                      {formatUgx(leg.fare)} · every{" "}
                      {formatHeadway(leg.headwaySec)} (
                      {AGENCY_LABEL[leg.line.agency] ?? "line"})
                    </div>
                  </li>
                )
              )}
            </ol>
            <p className="tk-card__note">
              Times are typical estimates from 2019/20 fieldwork — matatus
              leave when full; verify fares on the ground.
              {REPORT_WHATSAPP && (
                <>
                  {" "}
                  <a
                    className="tk-journey__report"
                    href={`https://wa.me/${REPORT_WHATSAPP.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Something wrong? Report it.
                  </a>
                </>
              )}
            </p>
          </div>
        )}
      </div>

      <div className="tk-journey__map">
        {journey ? (
          <JourneyMap journey={journey} />
        ) : (
          <div className="tk-journey__map-hint">
            {result && result.journeys.length > 0
              ? "Tap a journey to see it on the map"
              : "Your journey appears here"}
          </div>
        )}
      </div>
    </div>
  );
}

function JourneyOptionCard({
  journey,
  onOpen,
}: {
  journey: Journey;
  onOpen: () => void;
}) {
  const chain = useMemo(
    () =>
      journey.legs.map((leg, i) => {
        if (leg.kind === "walk") {
          return (
            <span key={i} className="tk-chain__walk">
              {Math.round(leg.meters)} m walk
            </span>
          );
        }
        return (
          <span key={i} className="tk-chain__ride">
            {leg.line.code}
          </span>
        );
      }),
    [journey]
  );

  return (
    <button className="tk-option" onClick={onOpen}>
      <span className="tk-option__time">{journey.totalMinutes} min</span>
      <span className="tk-option__chain">{chain}</span>
      <span className="tk-option__meta">
        {formatUgx(journey.fare)} ·{" "}
        {journey.transfers === 0 ? "direct" : `${journey.transfers} transfer`} ·
        walk {Math.round(journey.walkMeters)} m
        {journey.walkMeters > BODA_SUGGEST_M &&
          ` · boda ≈ ${formatUgx(estimateBoda(journey.walkMeters).min)}+`}
      </span>
    </button>
  );
}

import { useState, type ReactNode } from "react";
import { PlaceInput } from "../components/PlaceInput";
import { JourneyMap } from "../components/JourneyMap";
import {
  formatHeadway,
  formatUgx,
  stopByIndex,
  variantEndpoints,
} from "../lib/network";
import { BODA_SUGGEST_M, estimateBoda } from "../lib/boda";
import {
  planJourney,
  type Journey,
  type Leg,
  type Place,
} from "../lib/planner";

const REPORT_WHATSAPP = import.meta.env.VITE_REPORT_WHATSAPP_NUMBER as
  | string
  | undefined;

/** Riders think in vehicles, not line codes — the feed's agencies only. */
const MODE_LABEL: Record<string, string> = { taxi: "matatu", bus: "bus" };

/**
 * /transit — the front door. Enter where you are and where you're going,
 * get ranked journeys (direct + 1 transfer) and a step-by-step route:
 * which stage to walk to, which vehicle to board and in which direction,
 * where to alight. The map sits alongside the whole time (persistent
 * JourneyMap). Lines exist only inside the planner — the UI never shows
 * them.
 */
export function JourneyPage() {
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
      setResult({
        journeys: r.journeys,
        stretchedOrigin: r.stretchedOrigin,
        stretchedDestination: r.stretchedDestination,
      });
      setPending(false);
    }, 30);
  }

  const journey = selected !== null && result ? result.journeys[selected] : null;
  // A "0 m walk" step is pure noise when the stage sits on the spot.
  const legs = journey ? journey.legs.filter((l) => !(l.kind === "walk" && l.meters < 30)) : [];
  const stretchNote =
    result && (result.stretchedOrigin || result.stretchedDestination)
      ? "Includes a longer walk than usual. The nearest surveyed stage is far away."
      : null;

  return (
    <div className="tk-journey">
      <div className="tk-journey__panel">
        <div className="tk-journey__form">
          <PlaceInput
            placeholder="Your location, or type a place"
            value={from}
            onPick={setFrom}
            onClear={() => setFrom(null)}
            allowLocation
          />
          <PlaceInput
            placeholder="Where are you going?"
            value={to}
            onPick={setTo}
            onClear={() => setTo(null)}
          />
          <button className="tk-go" onClick={search} disabled={!canSearch || pending}>
            {pending ? "Finding routes…" : "Show me the route"}
          </button>
        </div>

        {result && result.journeys.length === 0 && !pending && (
          <p className="tk-journey__empty">
            No matatu combination found for this trip yet. Try moving the
            start or end closer to a stage, or boda part of the way.
          </p>
        )}
        {stretchNote && result && result.journeys.length > 0 && (
          <p className="tk-journey__stretch">{stretchNote}</p>
        )}

        {result && result.journeys.length > 0 && selected === null && !pending && (
          <div className="tk-results">
            <p className="tk-results__label">Pick a route:</p>
            {result.journeys.map((j, i) => (
              <JourneyOptionCard key={i} journey={j} onOpen={() => setSelected(i)} />
            ))}
          </div>
        )}

        {journey && (
          <div className="tk-journey__detail">
            <button className="tk-back" onClick={() => setSelected(null)}>
              ← All routes
            </button>
            <p className="tk-journey__summary">
              {journey.totalMinutes} min · {formatUgx(journey.fare)} ·{" "}
              {journey.transfers === 0
                ? "direct"
                : `${journey.transfers} transfer`}
            </p>
            <ol className="tk-steps">
              {legs.map((leg, i) => (
                <Step key={i} leg={leg} />
              ))}
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
        <JourneyMap journey={journey} />
      </div>
    </div>
  );
}

function Step({ leg }: { leg: Leg }) {
  if (leg.kind === "walk") {
    const boda =
      leg.meters > BODA_SUGGEST_M ? estimateBoda(leg.meters) : null;
    return (
      <li className="tk-step tk-step--walk">
        <span className="tk-step__badge tk-step__badge--walk">walk</span>
        <div className="tk-step__body">
          Walk {Math.round(leg.meters)} m (~
          {Math.max(1, Math.round(leg.minutes))} min) to{" "}
          <strong>{leg.to.name}</strong>
          {boda && (
            <div className="tk-step__boda">
              Too far to walk? A boda is ≈ {formatUgx(boda.min)}–
              {formatUgx(boda.max)} (~{Math.max(2, Math.round(leg.meters / 250))}{" "}
              min).
            </div>
          )}
        </div>
      </li>
    );
  }

  const board = stopByIndex(leg.stopIdxs[0]);
  const alight = stopByIndex(leg.stopIdxs[leg.stopIdxs.length - 1]);
  const terminus = variantEndpoints(leg.variant)[1];
  const mode = MODE_LABEL[leg.line.agency] ?? "matatu";
  return (
    <li className="tk-step tk-step--ride">
      <span className="tk-step__badge">{mode}</span>
      <div className="tk-step__body">
        <div className="tk-step__head">
          Board at <strong>{board.n}</strong>, a {mode} heading to{" "}
          <strong>{terminus}</strong>
        </div>
        <div className="tk-step__meta">
          {leg.stopIdxs.length} stages · ~{Math.round(leg.minutes)} min ·{" "}
          {formatUgx(leg.fare)} · every {formatHeadway(leg.headwaySec)}
        </div>
        <div className="tk-step__alight">
          Alight at <strong>{alight.n}</strong>
        </div>
      </div>
    </li>
  );
}

function JourneyOptionCard({
  journey,
  onOpen,
}: {
  journey: Journey;
  onOpen: () => void;
}) {
  const kept = journey.legs.filter(
    (leg) => !(leg.kind === "walk" && leg.meters < 30)
  );
  const chain: ReactNode[] = [];
  let last = "";
  kept.forEach((leg, i) => {
    if (leg.kind === "walk") {
      chain.push(
        <span key={i} className="tk-chain__walk">
          {Math.round(leg.meters)} m walk
        </span>
      );
      last = "";
      return;
    }
    // "matatu → Kawala" — the direction a rider would ask for, no codes
    const mode = MODE_LABEL[leg.line.agency] ?? "matatu";
    const chip = `${mode} → ${variantEndpoints(leg.variant)[1]}`;
    if (chip !== last) {
      chain.push(
        <span key={i} className="tk-chain__ride">
          {chip}
        </span>
      );
      last = chip;
    }
  });

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

import { useState, type ReactNode } from "react";
import { PlaceInput } from "../components/PlaceInput";
import { JourneyMap } from "../components/JourneyMap";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BikeIcon,
  BusIcon,
  CarIcon,
  ClockIcon,
  CoinIcon,
  MotorbikeIcon,
  SwapIcon,
  TransfersIcon,
  WalkIcon,
} from "../components/icons";
import {
  formatHeadway,
  formatUgx,
  stopByIndex,
  variantEndpoints,
} from "../lib/network";
import { BODA_SUGGEST_M, estimateBoda } from "../lib/boda";
import { estimateAllSimple, type SimpleMode, type SimpleRoute } from "../lib/modes";
import {
  haversine,
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

function simpleIcon(mode: SimpleMode, size = 19): ReactNode {
  return mode === "boda" ? (
    <MotorbikeIcon size={size} />
  ) : mode === "drive" ? (
    <CarIcon size={size} />
  ) : mode === "cycle" ? (
    <BikeIcon size={size} />
  ) : (
    <WalkIcon size={size} />
  );
}

/** One comparable row in the routes list, whatever powers it. */
type RouteCard =
  | {
      key: string;
      kind: "taxi";
      journey: Journey;
      index: number;
      minutes: number;
      fare: number;
      transfers: number;
    }
  | { key: string; kind: "simple"; route: SimpleRoute; minutes: number; fare: number };

/** Keep the list scannable: the 3 best matatu combinations plus the four
 * point-to-point modes, all time-sorted, badges computed across all. */
function buildCards(
  journeys: Journey[],
  simple: SimpleRoute[],
  straightM: number
): RouteCard[] {
  const cards: RouteCard[] = [];
  let added = 0;
  journeys.forEach((journey, index) => {
    if (added >= 3) return;
    // a pure-walk "journey" would duplicate the walking card
    if (journey.legs.length === 1 && journey.legs[0].kind === "walk") return;
    cards.push({
      key: `taxi-${index}`,
      kind: "taxi",
      journey,
      index,
      minutes: journey.totalMinutes,
      fare: journey.fare,
      transfers: journey.transfers,
    });
    added += 1;
  });

  for (const route of simple) {
    if (route.mode === "walk") continue; // added last: always shown
    // boda/car/bike for a 200 m hop is noise
    if (straightM < 400) continue;
    cards.push({ key: `simple-${route.mode}`, kind: "simple", route, minutes: route.minutes, fare: route.fareMin });
  }
  const walk = simple.find((r) => r.mode === "walk");
  if (walk) {
    cards.push({ key: "simple-walk", kind: "simple", route: walk, minutes: walk.minutes, fare: 0 });
  }

  cards.sort((a, b) => a.minutes - b.minutes);
  return cards;
}

/** fastest = first in the time-sorted list; cheapest = min fare; fewest
 * transfers = the most direct matatu combination (only when it means
 * something, i.e. the taxi options differ). */
function badgeKeys(cards: RouteCard[]): { fastest?: string; cheapest?: string; transfers?: string } {
  if (cards.length === 0) return {};
  const badges: { fastest?: string; cheapest?: string; transfers?: string } = {};
  badges.fastest = cards[0].key;

  const cheapest = cards.reduce((best, c) => (c.fare < best.fare ? c : best), cards[0]);
  if (cheapest.key !== cards[0].key) badges.cheapest = cheapest.key;

  const taxi = cards.filter((c): c is Extract<RouteCard, { kind: "taxi" }> => c.kind === "taxi");
  if (taxi.length >= 2) {
    const min = Math.min(...taxi.map((t) => t.transfers));
    const max = Math.max(...taxi.map((t) => t.transfers));
    if (min < max) badges.transfers = taxi.find((t) => t.transfers === min)!.key;
  }
  return badges;
}

/**
 * /transit — the front door. Enter where you are and where you're going;
 * the routes view compares taxi, boda, car, bicycle and walking side by
 * side, each with its icon and badges for fastest / fewest transfers /
 * cheapest. Picking one expands the step-by-step guide. Lines exist only
 * inside the planner; the UI never shows them.
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
  const [simpleSelected, setSimpleSelected] = useState<SimpleMode | null>(null);
  const [buildings3d, setBuildings3d] = useState(false);

  const canSearch = from !== null && to !== null;

  // Clearing a field (the inputs do this on focus, inviting a re-pick)
  // invalidates everything computed from the old pair — keeping the
  // results around would render journeys for places that no longer apply.
  function clearFrom() {
    setFrom(null);
    setResult(null);
    setSelected(null);
    setSimpleSelected(null);
  }

  function clearTo() {
    setTo(null);
    setResult(null);
    setSelected(null);
    setSimpleSelected(null);
  }

  function search() {
    if (!from || !to) return;
    setPending(true);
    setSelected(null);
    setSimpleSelected(null);
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

  function swap() {
    setFrom(to);
    setTo(from);
  }

  const simpleRoutes = from && to ? estimateAllSimple(from, to) : [];
  const cards =
    result && from && to ? buildCards(result.journeys, simpleRoutes, haversine(from, to)) : [];
  const badges = badgeKeys(cards);

  const journey = selected !== null && result ? result.journeys[selected] : null;
  const simpleRoute = simpleSelected ? simpleRoutes.find((r) => r.mode === simpleSelected) ?? null : null;
  const detail = journey ? (
    <TaxiDetail journey={journey} onBack={() => setSelected(null)} />
  ) : simpleRoute && from && to ? (
    <SimpleDetail route={simpleRoute} from={from} to={to} onBack={() => setSimpleSelected(null)} />
  ) : null;

  const stretchNote =
    result && (result.stretchedOrigin || result.stretchedDestination)
      ? "Includes a longer walk than usual. The nearest surveyed stage is far away."
      : null;

  return (
    <div className="tk-journey">
      <button
        type="button"
        className={`tk-mode-pill tk-mode-pill--3d${buildings3d ? "" : " tk-mode-pill--transit"}`}
        onClick={() => setBuildings3d((v) => !v)}
        aria-pressed={buildings3d}
        title={buildings3d ? "Hide the 3D buildings" : "Show the 3D buildings"}
      >
        3D blocks
      </button>

      <div className="tk-journey__map">
        <JourneyMap
          journey={journey}
          direct={simpleRoute ? { from: from!, to: to!, mode: simpleRoute.mode } : null}
          buildings={buildings3d}
        />
      </div>

      <div className="tk-journey__panel">
        <div className="tk-journey__form">
          <PlaceInput
            placeholder="Your location, or type a place"
            value={from}
            onPick={setFrom}
            onClear={clearFrom}
            allowLocation
          />
          {from && to && (
            <button className="tk-swap" onClick={swap} aria-label="Swap start and destination" title="Swap">
              <SwapIcon size={15} />
            </button>
          )}
          <PlaceInput
            placeholder="Where are you going?"
            value={to}
            onPick={setTo}
            onClear={clearTo}
          />
          <button className="tk-go" onClick={search} disabled={!canSearch || pending}>
            {pending ? "Finding routes…" : "Show me the route"}
          </button>
        </div>

        {result && cards.length === 0 && !pending && (
          <p className="tk-journey__empty">
            No routes found for this trip yet. Try moving the start or end
            closer to a stage.
          </p>
        )}
        {stretchNote && cards.length > 0 && (
          <p className="tk-journey__stretch">{stretchNote}</p>
        )}

        {result && cards.length > 0 && !detail && !pending && (
          <div className="tk-results">
            <div className="tk-routes">
              {cards.map((card) => (
                <RouteCardButton
                  key={card.key}
                  card={card}
                  badges={badges}
                  onOpen={() => {
                    if (card.kind === "taxi") setSelected(card.index);
                    else setSimpleSelected(card.route.mode);
                  }}
                />
              ))}
            </div>
            {result.journeys.length === 0 && (
              <p className="tk-journey__stretch">
                No matatu combination found for this trip yet; the point-to-point
                options above are your best bets.
              </p>
            )}
          </div>
        )}

        {detail}
      </div>
    </div>
  );
}

function Badge({ kind, children }: { kind: "fastest" | "plain"; children: ReactNode }) {
  return <span className={`tk-badge${kind === "fastest" ? " tk-badge--accent" : ""}`}>{children}</span>;
}

function RouteCardButton({
  card,
  badges,
  onOpen,
}: {
  card: RouteCard;
  badges: ReturnType<typeof badgeKeys>;
  onOpen: () => void;
}) {
  const icon =
    card.kind === "taxi" ? <BusIcon size={19} /> : simpleIcon(card.route.mode);

  const meta: ReactNode[] = [];
  if (card.kind === "taxi") {
    meta.push(
      <span key="t" className="tk-route__meta-item">
        {card.transfers === 0 ? "direct" : `${card.transfers} transfer${card.transfers > 1 ? "s" : ""}`}
      </span>
    );
    // direction is what distinguishes same-priced combinations
    const firstRide = card.journey.legs.find((l): l is Extract<Leg, { kind: "ride" }> => l.kind === "ride");
    if (firstRide) {
      meta.push(
        <span key="dir" className="tk-route__meta-item">
          toward {variantEndpoints(firstRide.variant)[1]}
        </span>
      );
    }
    meta.push(
      <span key="f" className="tk-route__meta-item">
        {formatUgx(card.fare)}
      </span>
    );
    const walkM = card.journey.walkMeters;
    if (walkM >= 30) {
      meta.push(
        <span key="w" className="tk-route__meta-item">
          walk {Math.round(walkM)} m
        </span>
      );
    }
  } else {
    meta.push(
      <span key="d" className="tk-route__meta-item">
        {formatKmLabel(card.route.meters)}
      </span>,
      <span key="f" className="tk-route__meta-item">
        {card.route.fareMin === 0
          ? "free"
          : `≈ ${formatUgxRange(card.route.fareMin, card.route.fareMax)}`}
      </span>
    );
  }

  return (
    <button className="tk-route" onClick={onOpen}>
      <span className="tk-route__icon">{icon}</span>
      <span className="tk-route__main">
        <span className="tk-route__top">
          <span className="tk-route__time">{card.minutes} min</span>
          <span className="tk-route__name">
            {card.kind === "taxi" ? "Taxi" : card.route.label}
          </span>
          <span className="tk-route__badges">
            {badges.fastest === card.key && (
              <Badge kind="fastest">
                <ClockIcon size={11} /> Fastest
              </Badge>
            )}
            {badges.transfers === card.key && (
              <Badge kind="plain">
                <TransfersIcon size={11} /> Fewest transfers
              </Badge>
            )}
            {badges.cheapest === card.key && (
              <Badge kind="plain">
                <CoinIcon size={11} /> Cheapest
              </Badge>
            )}
          </span>
        </span>
        <span className="tk-route__meta">{meta}</span>
      </span>
    </button>
  );
}

function formatKmLabel(meters: number): string {
  return meters >= 950 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatUgxRange(min: number, max: number): string {
  return `UGX ${min.toLocaleString("en-UG")}-${max.toLocaleString("en-UG")}`;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="tk-back" onClick={onClick}>
      <ArrowLeftIcon size={15} />
      <span>All routes</span>
    </button>
  );
}

function TaxiDetail({ journey, onBack }: { journey: Journey; onBack: () => void }) {
  // A "0 m walk" step is pure noise when the stage sits on the spot.
  const legs = journey.legs.filter((l) => !(l.kind === "walk" && l.meters < 30));
  return (
    <div className="tk-journey__detail">
      <BackButton onClick={onBack} />
      <div className="tk-journey__summary">
        <span>{journey.totalMinutes} min</span>
        <span>{formatUgx(journey.fare)}</span>
        <span>
          {journey.transfers === 0 ? "direct" : `${journey.transfers} transfer`}
        </span>
      </div>
      <ol className="tk-steps">
        {legs.map((leg, i) => (
          <Step key={i} leg={leg} />
        ))}
      </ol>
      <p className="tk-card__note">
        Times are typical estimates from 2019/20 fieldwork; matatus leave
        when full, so verify fares on the ground.
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
  );
}

function SimpleDetail({
  route,
  from,
  to,
  onBack,
}: {
  route: SimpleRoute;
  from: Place;
  to: Place;
  onBack: () => void;
}) {
  const steps: ReactNode[] = [];
  if (route.mode === "boda") {
    steps.push(
      <>
        Find a boda near <strong>{from.name}</strong> and agree on about{" "}
        <strong>{formatUgxRange(route.fareMin, route.fareMax)}</strong> before
        riding
      </>
    );
  } else if (route.mode === "drive") {
    steps.push(
      <>
        Request a car to <strong>{from.name}</strong>; expect about{" "}
        <strong>{formatUgxRange(route.fareMin, route.fareMax)}</strong>
      </>
    );
  } else if (route.mode === "cycle") {
    steps.push(
      <>
        From <strong>{from.name}</strong>, ride toward <strong>{to.name}</strong>
      </>
    );
  } else {
    steps.push(
      <>
        From <strong>{from.name}</strong>, walk toward <strong>{to.name}</strong>
      </>
    );
  }

  return (
    <div className="tk-journey__detail">
      <BackButton onClick={onBack} />
      <div className="tk-simple__hero">
        <span className="tk-route__icon tk-route__icon--big">{simpleIcon(route.mode, 22)}</span>
        <div>
          <p className="tk-simple__title">{route.label}</p>
          <p className="tk-simple__facts">
            <span>~{route.minutes} min</span>
            <span>
              {route.fareMin === 0
                ? "free"
                : `≈ ${formatUgxRange(route.fareMin, route.fareMax)}`}
            </span>
            <span>{formatKmLabel(route.meters)}</span>
          </p>
        </div>
      </div>
      <ol className="tk-steps">
        <li className="tk-step tk-step--ride">
          <span className="tk-step__badge tk-step__badge--mode">{simpleIcon(route.mode, 13)}</span>
          <div className="tk-step__body">{steps[0]}</div>
        </li>
        <li className="tk-step tk-step--ride">
          <span className="tk-step__badge tk-step__badge--mode">
            <ArrowRightIcon size={13} />
          </span>
          <div className="tk-step__body">
            Ride {formatKmLabel(route.meters)} (~{route.minutes} min) to{" "}
            <strong>{to.name}</strong>
          </div>
        </li>
      </ol>
      <div className="tk-simple__notes">
        <p>{route.note}</p>
        {route.advice && <p>{route.advice}</p>}
      </div>
    </div>
  );
}

function Step({ leg }: { leg: Leg }) {
  if (leg.kind === "walk") {
    const boda = leg.meters > BODA_SUGGEST_M ? estimateBoda(leg.meters) : null;
    return (
      <li className="tk-step tk-step--walk">
        <span className="tk-step__badge tk-step__badge--walk">
          <WalkIcon size={12} /> walk
        </span>
        <div className="tk-step__body">
          Walk {Math.round(leg.meters)} m (~
          {Math.max(1, Math.round(leg.minutes))} min) to{" "}
          <strong>{leg.to.name}</strong>
          {boda && (
            <div className="tk-step__boda">
              Too far to walk? A boda is ≈ {formatUgxRange(boda.min, boda.max)}{" "}
              (~{Math.max(2, Math.round(leg.meters / 250))} min).
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
      <span className="tk-step__badge">
        <BusIcon size={12} /> {mode}
      </span>
      <div className="tk-step__body">
        <div className="tk-step__head">
          Board at <strong>{board.n}</strong>, a {mode} heading to{" "}
          <strong>{terminus}</strong>
        </div>
        <div className="tk-step__meta">
          <span>{leg.stopIdxs.length} stages</span>
          <span>~{Math.round(leg.minutes)} min</span>
          <span>{formatUgx(leg.fare)}</span>
          <span>every {formatHeadway(leg.headwaySec)}</span>
        </div>
        <div className="tk-step__alight">
          Alight at <strong>{alight.n}</strong>
        </div>
      </div>
    </li>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PlaceInput } from "../components/PlaceInput";
import { JourneyMap } from "../components/JourneyMap";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BikeIcon,
  BusIcon,
  CarIcon,
  ChevronDownIcon,
  ClockIcon,
  CoinIcon,
  CurrentLocationIcon,
  MotorbikeIcon,
  SearchIcon,
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
import {
  BODA_SWAP_M,
  bodaMinutes,
  estimateBoda,
  journeyWithBodaSwaps,
} from "../lib/boda";
import { estimateAllSimple, type SimpleMode, type SimpleRoute } from "../lib/modes";
import {
  NAV_ARRIVE_M,
  NAV_START_M,
  formatDistance,
  metersTo,
  navStepsForJourney,
  navStepsForSimple,
  type NavStep,
} from "../lib/nav";
import { useLocationWatch } from "../hooks/useLocationWatch";
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
  // Walk legs the rider chose to ride by boda instead, by leg index into
  // the selected journey. Resets with every new selection.
  const [bodaSwaps, setBodaSwaps] = useState<ReadonlySet<number>>(new Set());
  const [buildings3d, setBuildings3d] = useState(false);
  // Live guidance: on, the panel becomes a step-by-step card fed by GPS.
  const [navigating, setNavigating] = useState(false);
  const [navIndex, setNavIndex] = useState(0);
  const [navStarted, setNavStarted] = useState(false);
  const [navArrived, setNavArrived] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  // Bumped on exit so the map re-frames the whole route.
  const [navEpoch, setNavEpoch] = useState(0);
  // Mobile map-focus: with a route open, tapping the map collapses the
  // floating cards into two thin pills; tapping either restores them.
  const [mapFocus, setMapFocus] = useState(false);
  // On phones the search fields stay folded into a pill until tapped;
  // any interaction outside the form folds them back. Desktop always
  // shows the form.
  const [searchOpen, setSearchOpen] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 720px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Fold the search form away on any interaction outside it — a tap on the
  // map or the route cards, or Escape. Focusing the inputs is deliberately
  // NOT forced on expand: the fields clear on focus to invite a re-pick.
  useEffect(() => {
    if (!isMobile || !searchOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (formRef.current && e.target instanceof Node && !formRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMobile, searchOpen]);

  const canSearch = from !== null && to !== null;

  // Clearing a field (the inputs do this on focus, inviting a re-pick)
  // invalidates everything computed from the old pair — keeping the
  // results around would render journeys for places that no longer apply.
  function clearFrom() {
    setFrom(null);
    setResult(null);
    setSelected(null);
    setSimpleSelected(null);
    setBodaSwaps(new Set());
    setNavigating(false);
  }

  function clearTo() {
    setTo(null);
    setResult(null);
    setSelected(null);
    setSimpleSelected(null);
    setBodaSwaps(new Set());
    setNavigating(false);
  }

  function toggleBodaSwap(idx: number) {
    setBodaSwaps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function startNavigation() {
    setNavigating(true);
    setNavIndex(0);
    setNavStarted(false);
    setNavArrived(false);
    setFollowUser(true);
    setSearchOpen(false);
    setMapFocus(false);
  }

  function exitNavigation() {
    setNavigating(false);
    setNavIndex(0);
    setNavStarted(false);
    setNavArrived(false);
    setNavEpoch((v) => v + 1); // re-frame the whole route on the map
  }

  function search() {
    if (!from || !to) return;
    setPending(true);
    setSelected(null);
    setSimpleSelected(null);
    setBodaSwaps(new Set());
    setNavigating(false);
    setMapFocus(false);
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

  const collapsed =
    mapFocus && isMobile && !navigating && (journey !== null || simpleRoute !== null);
  // The form itself is the resting-folded element on phones; desktop never folds.
  const formOpen = !isMobile || searchOpen;
  // What the map and steps actually draw: the selected journey with any
  // chosen walk legs replaced by their boda rides.
  const displayJourney = journey ? journeyWithBodaSwaps(journey, bodaSwaps) : null;
  function openRoute(open: () => void) {
    open();
    setBodaSwaps(new Set());
    setNavigating(false);
    setMapFocus(false);
  }
  const detail =
    journey && displayJourney ? (
      <TaxiDetail
        journey={displayJourney}
        onToggleSwap={toggleBodaSwap}
        onStart={startNavigation}
        onBack={() => {
          setSelected(null);
          setBodaSwaps(new Set());
        }}
      />
    ) : simpleRoute && from && to ? (
      <SimpleDetail
        route={simpleRoute}
        from={from}
        to={to}
        onStart={startNavigation}
        onBack={() => setSimpleSelected(null)}
      />
    ) : null;

  // --- live guidance ---
  const { fix: userFix, status: locateStatus } = useLocationWatch(navigating);
  const navSteps = navigating
    ? displayJourney
      ? navStepsForJourney(displayJourney)
      : simpleRoute && from && to
        ? navStepsForSimple(simpleRoute, from, to)
        : []
    : [];
  const navAtEnd = navSteps.length > 0 && navIndex === navSteps.length - 1;
  const navDistance =
    navSteps.length > 0 ? metersTo(userFix, navSteps[navIndex].target) : null;

  // Guidance only ever moves forward — a momentary closeness to an earlier
  // stage (waiting at a junction) never snaps the checklist back. The trip
  // latches as started once GPS sees you near the first target, or plainly
  // closer to a later one (you're already under way).
  useEffect(() => {
    if (!navigating || !userFix || navSteps.length === 0) return;
    let nearest = 0;
    let nearestD = Infinity;
    navSteps.forEach((s, i) => {
      const d = haversine(userFix, s.target);
      if (d < nearestD) {
        nearestD = d;
        nearest = i;
      }
    });
    if (nearest > navIndex) setNavIndex(nearest);
    if (!navStarted && (nearest > 0 || haversine(userFix, navSteps[0].target) <= NAV_START_M)) {
      setNavStarted(true);
    }
  }, [navigating, userFix, navSteps, navIndex, navStarted]);

  const arrived =
    navSteps.length > 0 &&
    ((navStarted && navAtEnd && navDistance !== null && navDistance <= NAV_ARRIVE_M) ||
      navArrived);

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
          journey={displayJourney}
          direct={simpleRoute ? { from: from!, to: to!, mode: simpleRoute.mode } : null}
          buildings={buildings3d}
          onMapClick={() => {
            if (isMobile && !navigating && (journey !== null || simpleRoute !== null)) {
              setMapFocus(true);
              // re-expanding lands on the resting folded search pill
              setSearchOpen(false);
            }
          }}
          userFix={userFix}
          navActive={navigating}
          followUser={followUser}
          onUserPan={() => setFollowUser(false)}
          refitKey={navEpoch}
        />
        {navigating && !followUser && userFix !== null && (
          <button
            type="button"
            className="tk-pillbtn tk-recenter"
            onClick={() => setFollowUser(true)}
          >
            <CurrentLocationIcon size={15} />
            <span>Recenter</span>
          </button>
        )}
      </div>

      <div
        className={`tk-journey__panel${collapsed ? " tk-mapfocus" : ""}${
          navigating ? " tk-navmode" : ""
        }`}
      >
        {navigating ? (
          <NavCard
            steps={navSteps}
            index={navIndex}
            fix={userFix}
            status={locateStatus}
            started={navStarted}
            arrived={arrived}
            directMode={simpleRoute?.mode ?? null}
            onExit={exitNavigation}
            onNext={() => {
              if (!navStarted) {
                setNavStarted(true);
                return;
              }
              if (navAtEnd) setNavArrived(true);
              else setNavIndex((i) => Math.min(i + 1, navSteps.length - 1));
            }}
            onStartAnyway={() => setNavStarted(true)}
          />
        ) : collapsed ? (
          <>
            <button
              type="button"
              className="tk-pillbtn"
              onClick={() => setMapFocus(false)}
              aria-label="Expand search"
            >
              <SearchIcon size={16} />
              <span className="tk-pillbtn__label">
                {from!.name} to {to!.name}
              </span>
            </button>
            <button
              type="button"
              className="tk-pillbtn tk-pillbtn--route"
              onClick={() => setMapFocus(false)}
              aria-label="Expand the selected route"
            >
              {journey ? (
                <>
                  <BusIcon size={16} />
                  <span className="tk-pillbtn__label">
                    <span>{journey.totalMinutes} min</span>
                    <span>{formatUgx(journey.fare)}</span>
                    {journey.transfers > 0 && (
                      <span>{journey.transfers} transfer{journey.transfers > 1 ? "s" : ""}</span>
                    )}
                  </span>
                </>
              ) : simpleRoute ? (
                <>
                  {simpleIcon(simpleRoute.mode, 16)}
                  <span className="tk-pillbtn__label">
                    <span>{simpleRoute.label}</span>
                    <span>~{simpleRoute.minutes} min</span>
                  </span>
                </>
              ) : null}
              <ChevronDownIcon size={16} className="tk-pillbtn__chev" />
            </button>
          </>
        ) : (
          <>
            {/* Only the form/pill slot swaps on fold — the results below sit
               outside that ternary so a fold never remounts the route cards
               (a remount would swallow the tap that opened them). */}
            {formOpen ? (
              <div className="tk-journey__form" ref={formRef}>
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
            ) : (
              <button
                type="button"
                className="tk-pillbtn"
                onClick={() => setSearchOpen(true)}
                aria-label="Expand search"
              >
                <SearchIcon size={16} />
                <span className="tk-pillbtn__label">
                  {from && to ? `${from.name} to ${to.name}` : "Search routes"}
                </span>
              </button>
            )}

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
                    if (card.kind === "taxi") openRoute(() => setSelected(card.index));
                    else openRoute(() => setSimpleSelected(card.route.mode));
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

        {!navigating && detail}
          </>
        )}
      </div>

      {navigating && arrived && (
        <div className="tk-arrived">
          <div className="tk-arrived__card">
            <p className="tk-arrived__title">You have arrived</p>
            <p className="tk-arrived__sub">
              Welcome to{" "}
              {navSteps.length > 0 ? navSteps[navSteps.length - 1].target.name : to?.name}.
            </p>
            <button className="tk-go" onClick={exitNavigation}>
              Done
            </button>
          </div>
        </div>
      )}
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

function TaxiDetail({
  journey,
  onToggleSwap,
  onStart,
  onBack,
}: {
  journey: Journey;
  onToggleSwap: (legIndex: number) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  // A "0 m walk" step is pure noise when the stage sits on the spot — but
  // steps keep their original leg index so swaps target the right leg.
  const steps = journey.legs
    .map((leg, idx) => ({ leg, idx }))
    .filter(({ leg }) => !(leg.kind === "walk" && leg.meters < 30));
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
        {steps.map(({ leg, idx }) => (
          <Step
            key={idx}
            leg={leg}
            legIndex={idx}
            swappable={leg.kind === "walk" && leg.meters >= BODA_SWAP_M}
            onToggleSwap={onToggleSwap}
          />
        ))}
      </ol>
      <div className="tk-detail__actions">
        <button className="tk-go" onClick={onStart}>
          Start trip
        </button>
      </div>
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
  onStart,
  onBack,
}: {
  route: SimpleRoute;
  from: Place;
  to: Place;
  onStart: () => void;
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
      <div className="tk-detail__actions">
        <button className="tk-go" onClick={onStart}>
          Start trip
        </button>
      </div>
    </div>
  );
}

function Step({
  leg,
  legIndex,
  swappable,
  onToggleSwap,
}: {
  leg: Leg;
  legIndex: number;
  swappable: boolean;
  onToggleSwap: (legIndex: number) => void;
}) {
  if (leg.kind === "boda") {
    return (
      <li className="tk-step tk-step--boda">
        <span className="tk-step__badge tk-step__badge--boda">
          <MotorbikeIcon size={12} /> boda
        </span>
        <div className="tk-step__body">
          Ride a boda {Math.round(leg.meters)} m (~{leg.minutes} min) to{" "}
          <strong>{leg.to.name}</strong>
          <div className="tk-step__meta">
            <span>≈ {formatUgxRange(leg.fareMin, leg.fareMax)}</span>
            <span>agree before you set off</span>
          </div>
          <button
            type="button"
            className="tk-step__swap tk-step__swap--revert"
            onClick={() => onToggleSwap(legIndex)}
          >
            <WalkIcon size={13} /> Walk instead
          </button>
        </div>
      </li>
    );
  }

  if (leg.kind === "walk") {
    const boda = swappable ? estimateBoda(leg.meters) : null;
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
            <button
              type="button"
              className="tk-step__swap"
              onClick={() => onToggleSwap(legIndex)}
            >
              Too far to walk? A boda is ≈ {formatUgxRange(boda.min, boda.max)}{" "}
              (~{bodaMinutes(leg.meters)} min)
            </button>
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

function navBadgeIcon(step: NavStep, directMode: SimpleMode | null): ReactNode {
  switch (step.kind) {
    case "walk":
      return (
        <>
          <WalkIcon size={12} /> walk
        </>
      );
    case "boda":
      return (
        <>
          <MotorbikeIcon size={12} /> boda
        </>
      );
    case "board":
    case "ride":
      return (
        <>
          <BusIcon size={12} /> matatu
        </>
      );
    case "direct":
      return simpleIcon(directMode ?? "walk", 12);
  }
}

/**
 * The live-guidance card: one checkpoint at a time, the straight-line
 * distance to its target, and a hand "Next" for when GPS is off or
 * indecisive. Reads over the map with the same glass as the preview.
 */
function NavCard({
  steps,
  index,
  fix,
  status,
  started,
  arrived,
  directMode,
  onExit,
  onNext,
  onStartAnyway,
}: {
  steps: NavStep[];
  index: number;
  fix: { lat: number; lng: number } | null;
  status: "idle" | "watching" | "denied" | "unavailable";
  started: boolean;
  arrived: boolean;
  directMode: SimpleMode | null;
  onExit: () => void;
  onNext: () => void;
  onStartAnyway: () => void;
}) {
  if (steps.length === 0) {
    return (
      <div className="tk-journey__detail tk-nav">
        <BackButton onClick={onExit} />
        <p className="tk-card__note">Nothing to guide on this route yet.</p>
      </div>
    );
  }
  const step = steps[index];
  const last = index === steps.length - 1;
  const dist = metersTo(fix, step.target);
  const here = dist !== null && dist <= NAV_ARRIVE_M;
  const where =
    here && step.target.name
      ? "You are here"
      : dist !== null
        ? `${formatDistance(dist)} to ${step.target.name}`
        : status === "denied"
          ? "Location is off"
          : "Finding you…";

  return (
    <div className="tk-journey__detail tk-nav" aria-live="polite">
      <div className="tk-nav__top">
        <span className="tk-nav__progress">
          Step {index + 1} of {steps.length}
        </span>
        <button type="button" className="tk-back tk-nav__exit" onClick={onExit}>
          <ArrowLeftIcon size={14} />
          <span>Exit</span>
        </button>
      </div>

      {arrived ? (
        <p className="tk-nav__getthere">
          Welcome to <strong>{step.target.name}</strong>
        </p>
      ) : !started ? (
        <>
          <p className="tk-nav__getthere">
            Get to <strong>{steps[0].target.name}</strong> first
          </p>
          <p className="tk-nav__distance">
            {dist !== null
              ? `${formatDistance(dist)} away`
              : status === "denied"
                ? "Location is off"
                : "Finding you…"}
          </p>
          <p className="tk-nav__hint">
            {steps[0].title}.{" "}
            {status === "denied"
              ? "Location is off, so steps advance by hand."
              : "Guidance starts once you are close."}
          </p>
          <div className="tk-nav__row">
            <button className="tk-go" onClick={onStartAnyway}>
              Start anyway
            </button>
          </div>
        </>
      ) : (
        <>
          <span
            className={`tk-step__badge tk-step__badge--${
              step.kind === "direct" ? "mode" : step.kind
            } tk-nav__badge`}
          >
            {navBadgeIcon(step, directMode)}
          </span>
          <p className="tk-nav__title">{step.title}</p>
          {step.detail && <p className="tk-nav__detail">{step.detail}</p>}
          {step.meta.length > 0 && (
            <div className="tk-step__meta">
              {step.meta.map((m, i) => (
                <span key={i}>{m}</span>
              ))}
            </div>
          )}
          <p className="tk-nav__distance">{where}</p>
          {!last && steps[index + 1] && (
            <p className="tk-nav__nextline">Then: {steps[index + 1].title}</p>
          )}
          <div className="tk-nav__row">
            <button type="button" className="tk-back tk-nav__skip" onClick={onNext}>
              {last ? "Arrived" : "Next"}
            </button>
          </div>
        </>
      )}
      <p className="tk-nav__footnote">
        {status === "denied"
          ? "Location permission is off, so steps advance by hand."
          : "Distances are straight-line GPS estimates."}
      </p>
    </div>
  );
}

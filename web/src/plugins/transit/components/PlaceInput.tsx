import { useEffect, useMemo, useRef, useState } from "react";
import { searchStopIndices, stopByIndex } from "../lib/network";
import { geocodePlace } from "../lib/geocode";
import type { Place } from "../lib/planner";

interface PlaceInputProps {
  placeholder: string;
  value: Place | null;
  onPick: (p: Place) => void;
  onClear?: () => void;
  allowLocation?: boolean;
}

interface Option {
  place: Place;
  meta?: string;
}

/**
 * From/To field for the journey planner: searches the bundled stages and
 * live Nominatim results in one list, plus a "Your location" row when
 * allowed. Picking fills the field with a concrete Place.
 */
export function PlaceInput({
  placeholder,
  value,
  onPick,
  onClear,
  allowLocation,
}: PlaceInputProps) {
  const [text, setText] = useState(value?.name ?? "");
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setText(value?.name ?? "");
  }, [value]);

  const stageOptions = useMemo(() => {
    if (text.trim().length < 2) return [] as Option[];
    return searchStopIndices(text, 5).map((idx) => ({
      place: { name: stopByIndex(idx).n, lat: stopByIndex(idx).lat, lng: stopByIndex(idx).lng },
      meta: "stage",
    }));
  }, [text]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    const needle = text.trim();
    if (needle.length < 3) {
      setOptions([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    debounceRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      const places = await geocodePlace(needle, controller.signal);
      const known = new Set(stageOptions.map((o) => o.place.name.toLowerCase()));
      setOptions(
        places
          .filter((p) => !known.has(p.name.toLowerCase()))
          .map((p) => ({ place: p }))
      );
      setBusy(false);
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  function pick(place: Place) {
    setText(place.name);
    setOpen(false);
    setOptions([]);
    onPick(place);
  }

  function pickLocation() {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        pick({
          name: "Your location",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  const showList = open && !value && (stageOptions.length > 0 || options.length > 0 || allowLocation || busy);

  return (
    <div className="tk-place">
      <input
        className="tk-place__input"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (value && onClear) {
            onClear();
          }
          setOpen(true);
        }}
        aria-label={placeholder}
        autoComplete="off"
      />
      {showList && (
        <div className="tk-place__list">
          {allowLocation && (
            <button className="tk-place__item" onMouseDown={(e) => e.preventDefault()} onClick={pickLocation}>
              <span className="tk-search__dot" aria-hidden="true" />
              Your location
            </button>
          )}
          {stageOptions.map((o) => (
            <button
              key={`s-${o.place.name}`}
              className="tk-place__item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.place)}
            >
              <span className="tk-place__meta-badge">{o.meta}</span>
              {o.place.name}
            </button>
          ))}
          {options.map((o, i) => (
            <button
              key={`g-${o.place.name}-${i}`}
              className="tk-place__item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.place)}
            >
              {o.place.name}
            </button>
          ))}
          {busy && <p className="tk-place__hint">Searching…</p>}
        </div>
      )}
    </div>
  );
}

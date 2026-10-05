import { useEffect, useState } from "react";

export interface UserFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

export type LocateStatus = "idle" | "watching" | "denied" | "unavailable";

/**
 * Browser geolocation for live guidance — plugin-local so uninstalling
 * the plugin removes the watcher with it. High accuracy, throttled by the
 * platform; a denied permission is a normal state the UI handles (steps
 * advance by hand), not an error.
 */
export function useLocationWatch(active: boolean): {
  fix: UserFix | null;
  status: LocateStatus;
} {
  const [fix, setFix] = useState<UserFix | null>(null);
  const [status, setStatus] = useState<LocateStatus>("idle");

  useEffect(() => {
    if (!active) {
      setStatus("idle");
      setFix(null);
      return;
    }
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      return;
    }
    setStatus("watching");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [active]);

  return { fix, status };
}

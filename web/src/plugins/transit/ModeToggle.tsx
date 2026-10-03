import { useLocation, useNavigate } from "react-router-dom";
import "./styles/plugin.css";

const MODE_KEY = "visitkla:mode";

/**
 * Floating pill that switches between the two experiences:
 *  - classic (the story/boda app) — the default, unchanged
 *  - /transit (the GTFS-powered matatu network plugin)
 * Pure navigation: it never re-renders or wraps the other app, it just
 * deep-links between the two route trees. Last mode is remembered in
 * localStorage, but nothing ever auto-redirects — classic stays classic.
 */
export function ModeToggle() {
  const location = useLocation();
  const navigate = useNavigate();

  const inTransit = location.pathname.startsWith("/transit");
  const label = inTransit ? "Story Mode" : "Transit";

  function handleClick() {
    try {
      window.localStorage.setItem(MODE_KEY, inTransit ? "classic" : "transit");
    } catch {
      /* private mode etc. — the pill still works, we just forget the choice */
    }
    navigate(inTransit ? "/" : "/transit");
  }

  return (
    <button
      type="button"
      className={`tk-mode-pill ${inTransit ? "tk-mode-pill--transit" : ""}`}
      onClick={handleClick}
      aria-label={inTransit ? "Switch to story mode" : "Switch to transit mode"}
      title={inTransit ? "Back to landmark stories & boda" : "Try the matatu transit network"}
    >
      {label}
    </button>
  );
}

/**
 * Site favicon, installed at runtime.
 *
 * The plugin never edits the friend's index.html, so the mark rides the
 * one module the classic app always loads (ModeToggle imports this file):
 * every page — story or transit — gets the tab icon from first paint.
 * An inline SVG data URI keeps it dependency-free and self-contained;
 * deleting the plugin takes the favicon with it (see UNINSTALL.md).
 */

const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="14" fill="#ff6b00"/>' +
  '<path d="M32 53C26.5 45.5 19 37.5 19 31a13 13 0 1 1 26 0c0 6.5-7.5 14.5-13 22z" fill="#fff"/>' +
  '<circle cx="32" cy="31" r="5" fill="#ff6b00"/>' +
  "</svg>";

if (typeof document !== "undefined") {
  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/svg+xml";
  link.href = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}`;
  document.head.appendChild(link);
}

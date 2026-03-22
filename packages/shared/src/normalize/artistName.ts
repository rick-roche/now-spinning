/**
 * Strip Discogs artist name disambiguation suffixes.
 *
 * Discogs appends ` (N)` (where N ≥ 2) to artist names when multiple artists
 * share the same name — e.g. "John Smith (2)".  The suffix is metadata, not
 * part of the actual artist name, so we strip it for display and scrobbling.
 *
 * Only trailing numeric-only parenthetical tokens are removed.  Names that
 * contain meaningful parenthetical info like "(DJ)" or "(Remix)" are left
 * untouched.
 */
export function stripDiscogsDisambiguation(name: string): string {
  return name.replace(/\s+\(\d+\)$/, "");
}

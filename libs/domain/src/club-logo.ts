// The logo a club gets until an organiser uploads one: its initials on a
// colour picked from its id. None of the colours are close to the brand teal,
// so a club never looks like openRun itself.

/** Background colours for generated logos. Each takes white text. */
export const LOGO_COLOURS = [
  '#b91c1c', // red
  '#c2410c', // orange
  '#92400e', // amber
  '#3f6212', // lime
  '#1d4ed8', // blue
  '#4338ca', // indigo
  '#6d28d9', // violet
  '#a21caf', // fuchsia
  '#be185d', // pink
  '#475569', // slate
] as const;

const MINOR_WORDS = new Set(['the', 'of', 'and', 'a', 'an', '&']);

/**
 * Up to two initials: "Hackney Harriers" is "HH", "The Running Club of Leeds"
 * is "RC", and a one-word name gives its first two letters ("Parkrunners" is
 * "PA").
 */
export function clubInitials(name: string): string {
  const words = name
    .split(/[\s\-–—_/]+/)
    .map((w) => Array.from(w).filter((ch) => /[\p{L}\p{N}]/u.test(ch)))
    .filter((chars) => chars.length > 0);
  const major = words.filter(
    (chars) => !MINOR_WORDS.has(chars.join('').toLowerCase()),
  );
  const use = major.length ? major : words;
  const initials =
    use.length === 0
      ? []
      : use.length === 1
        ? use[0].slice(0, 2)
        : [use[0][0], use[1][0]];
  return initials.join('').toLocaleUpperCase() || '?';
}

/** The same colour for the same club every time (FNV-1a of its id). */
export function clubLogoColour(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return LOGO_COLOURS[(hash >>> 0) % LOGO_COLOURS.length];
}

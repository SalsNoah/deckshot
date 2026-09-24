/** Public-folder asset URLs that stay correct under GitHub Pages / nested bases. */

/** Absolute href for a file in `public/` (e.g. `bgs/bg-title.webp`). */
export function publicAsset(path: string): string {
  const clean = path.replace(/^\.\//, '').replace(/^\//, '');
  const base = import.meta.env.BASE_URL || './';
  try {
    return new URL(base + clean, window.location.href).href;
  } catch {
    return `${base}${clean}`;
  }
}

/** For CSS `url(...)` / custom properties (avoids relative-url + var() resolution bugs). */
export function cssUrl(path: string): string {
  return `url("${publicAsset(path)}")`;
}

import { normalizeFonbetTeamImageUrl } from './fonbet-team-logos';

// Exact public CDN hosts used by the configured athlete-photo providers. URLs
// returned by third-party searches and caller-provided URLs are both untrusted.
const ATHLETE_IMAGE_HOSTS = new Set([
  'a.espncdn.com',
  'a1.espncdn.com',
  'a2.espncdn.com',
  'a3.espncdn.com',
  'secure.espncdn.com',
  'www.thesportsdb.com',
  'thesportsdb.com',
  'r2.thesportsdb.com',
  'upload.wikimedia.org',
]);

export function normalizeAllowedLogoImageUrl(raw: unknown, requireFonbet = false): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  const fonbetUrl = normalizeFonbetTeamImageUrl(raw);
  if (fonbetUrl) return fonbetUrl;
  if (requireFonbet) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !ATHLETE_IMAGE_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

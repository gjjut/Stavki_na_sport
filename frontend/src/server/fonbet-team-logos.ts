const FONBET_STATIC_HOST = 'cdn-ec.bk6bba-resources.ru';
const FONBET_STATIC_HOSTS = new Set([
  'cdn-ec.bk6bba-resources.ru',
  'cdn-nx.bk6bba-resources.ru',
  'cdn-ya.bk6bba-resources.ru',
  'origin.bk6bba-resources.com',
]);

/**
 * Принимает только прямые изображения, которые сам Фонбет вложил в объект события.
 * Публичный events/listBase сейчас отдаёт team1Id/team2Id и названия, но не URL
 * эмблем команд; поэтому здесь намеренно нет выдуманных URL-шаблонов по ID.
 */
export function normalizeFonbetTeamImageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048 || !raw.trim()) return null;
  const value = raw.trim();
  const candidate = value.startsWith('//')
    ? `https:${value}`
    : value.startsWith('/')
      ? `https://${FONBET_STATIC_HOST}${value}`
      : value;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    // Do not trust arbitrary subdomains returned by a third-party response.
    const isFonbetStatic = FONBET_STATIC_HOSTS.has(host);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !isFonbetStatic) return null;
    if (!url.pathname.toLowerCase().startsWith('/contentcommon/')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isFonbetStaticImageUrl(raw: string): boolean {
  return normalizeFonbetTeamImageUrl(raw) !== null;
}

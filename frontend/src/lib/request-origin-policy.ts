/**
 * Browser mutations must originate from the exact site origin. Webhooks and
 * cron are authenticated separately. Forwarded protocol is trusted only
 * behind the documented reverse proxy, which overwrites that header.
 */
export function externalRequestOrigin(requestUrl: string, headers: Headers): string | null {
  try {
    const request = new URL(requestUrl);
    const host = headers.get('host') || request.host;
    const forwarded = headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    const protocol = forwarded || request.protocol.replace(/:$/, '').toLowerCase();
    if (!['http', 'https'].includes(protocol)) return null;
    const actual = new URL(`${protocol}://${host}`);
    if (actual.username || actual.password || actual.pathname !== '/' || actual.search || actual.hash) return null;
    return actual.origin;
  } catch {
    return null;
  }
}

export function isAllowedApiMutation(params: {
  method: string;
  pathname: string;
  requestUrl: string;
  headers: Headers;
}): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(params.method.toUpperCase())) return true;
  const path = params.pathname.replace(/\/+$/, '');
  if (path === '/api/v1/webhooks/yookassa' || path === '/api/v1/webhooks/telegram' ||
      path === '/api/v1/cron/autopilot') return true;

  const fetchSite = params.headers.get('sec-fetch-site')?.toLowerCase();
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return false;

  const origin = params.headers.get('origin');
  if (!origin) return fetchSite === 'same-origin';
  try {
    const actual = externalRequestOrigin(params.requestUrl, params.headers);
    const source = new URL(origin);
    if (!actual || source.username || source.password || source.pathname !== '/' || source.search || source.hash) return false;
    return source.origin === actual;
  } catch {
    return false;
  }
}

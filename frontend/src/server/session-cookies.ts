import type { NextResponse } from 'next/server';
import { EMBEDDED_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from './auth';
import { sessionCookieOptions } from './security-policy';

type CookieRequest = { nextUrl: { protocol: string }; headers: Headers };

/**
 * A normal first-party session stays SameSite=Lax. HTTPS responses additionally
 * set a host-only CHIPS cookie so Telegram Web can maintain a separate session
 * inside its cross-site iframe. Browsers may still block embedded storage.
 */
export function setSessionCookies(
  response: NextResponse,
  request: CookieRequest,
  token: string,
  clear = false,
): void {
  const normal = sessionCookieOptions(request);
  const maxAge = clear ? 0 : normal.maxAge;
  response.cookies.set(SESSION_COOKIE_NAME, token, { ...normal, maxAge });

  if (normal.secure) {
    response.cookies.set(EMBEDDED_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      partitioned: true,
      path: '/',
      maxAge,
    });
  }
}

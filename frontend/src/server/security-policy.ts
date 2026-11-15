import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getSessionSecret, isSessionSigningAvailable } from './session-secret-policy';

/** Telegram's secret_token is derived from the server secret, never exposed to a browser. */
export function telegramWebhookSecret(): string | null {
  if (!isSessionSigningAvailable()) return null;
  return createHmac('sha256', getSessionSecret())
    .update('valuex:telegram-webhook:v1')
    .digest('base64url');
}

export function secretsEqual(actual: string | null | undefined, expected: string | null): boolean {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newTelegramLinkCode(): string {
  return `vx_${randomBytes(16).toString('hex')}`;
}

/** Replace old predictable user-ID hashes without needing a write during a read. */
export function secureTelegramLinkCode(stored: string | null | undefined, userId: string): string {
  if (stored && /^vx_[a-f0-9]{32}$/.test(stored)) return stored;
  if (!isSessionSigningAvailable()) return '';
  const digest = createHmac('sha256', getSessionSecret())
    .update('valuex:legacy-telegram-link:v1\0')
    .update(userId)
    .digest('hex');
  return `vx_${digest.slice(0, 32)}`;
}

export function passwordResetDigest(userId: string, code: string): string {
  return `hmac-sha256:${createHmac('sha256', getSessionSecret())
    .update('valuex:password-reset:v1\0')
    .update(userId)
    .update('\0')
    .update(code)
    .digest('hex')}`;
}

/** Old plaintext reset codes are deliberately invalidated. */
export function verifyPasswordResetCode(userId: string, code: string, stored: string | null | undefined): boolean {
  return Boolean(stored?.startsWith('hmac-sha256:')) && secretsEqual(stored, passwordResetDigest(userId, code));
}

export function isSecureRequest(req: { nextUrl: { protocol: string }; headers: Headers }): boolean {
  try {
    if (process.env.NEXT_PUBLIC_SITE_URL && new URL(process.env.NEXT_PUBLIC_SITE_URL).protocol === 'https:') return true;
  } catch {
    // Fall back to the request scheme. Production should configure its canonical HTTPS URL.
  }
  return req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'https';
}

export function sessionCookieOptions(req: { nextUrl: { protocol: string }; headers: Headers }) {
  return {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 30 * 86400,
  };
}

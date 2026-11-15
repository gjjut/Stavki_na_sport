import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getSessionSecret, isSessionSigningAvailable } from './session-secret-policy';
import type { UserAccount } from './types';

export { isSessionSigningAvailable } from './session-secret-policy';

export const SESSION_COOKIE_NAME = 'valuex_session';
// __Host- requires Secure, path / and no Domain; it cannot be shadowed by a subdomain.
export const EMBEDDED_SESSION_COOKIE_NAME = '__Host-valuex_embed_session';
export const REF_COOKIE_NAME = 'valuex_ref';
export const EMBEDDED_REF_COOKIE_NAME = '__Host-valuex_embed_ref';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (typeof password !== 'string' || password.length > 256 || typeof storedHash !== 'string') return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return timingSafeEqual(keyBuf, derivedBuf);
}

interface SessionPayload {
  uid: string;
  exp: number;
  credentialTag: string;
}

function credentialTag(passwordHash: string): string {
  return createHmac('sha256', getSessionSecret())
    .update('valuex:session-credential:v1\0')
    .update(passwordHash)
    .digest('base64url');
}

/** A password reset/change invalidates every previously issued session. */
export function signSessionToken(user: Pick<UserAccount, 'id' | 'passwordHash'>, ttlDays = 30): string {
  const payload: SessionPayload = {
    uid: user.id,
    exp: Date.now() + ttlDays * 86400 * 1000,
    credentialTag: credentialTag(user.passwordHash),
  };
  const base64Payload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSessionSecret()).update(base64Payload).digest('base64url');
  return `${base64Payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || token.length > 4096 || !isSessionSigningAvailable()) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [base64Payload, sig] = parts;
  const expectedSig = createHmac('sha256', getSessionSecret()).update(base64Payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(base64Payload, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof parsed.uid !== 'string' || !parsed.uid || parsed.uid.length > 128 ||
        !Number.isFinite(parsed.exp) || parsed.exp < Date.now() ||
        typeof parsed.credentialTag !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(parsed.credentialTag)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sessionMatchesPassword(session: SessionPayload, passwordHash: string): boolean {
  const a = Buffer.from(session.credentialTag);
  const b = Buffer.from(credentialTag(passwordHash));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Keep both signed candidates until the guard has checked the current password. */
export function verifySessionCookieCandidates(primary?: string, embedded?: string): SessionPayload[] {
  const regular = verifySessionToken(primary);
  const partitioned = verifySessionToken(embedded);
  return [regular, partitioned].filter((session): session is SessionPayload => session !== null);
}

export function verifySessionCookieValues(primary?: string, embedded?: string): SessionPayload | null {
  return verifySessionCookieCandidates(primary, embedded)[0] ?? null;
}

export async function getSessionCandidatesFromCookies(): Promise<SessionPayload[]> {
  try {
    const cookieStore = await cookies();
    return verifySessionCookieCandidates(
      cookieStore.get(SESSION_COOKIE_NAME)?.value,
      cookieStore.get(EMBEDDED_SESSION_COOKIE_NAME)?.value,
    );
  } catch {
    return [];
  }
}

export async function getRefCodeFromCookies(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(REF_COOKIE_NAME)?.value?.trim() ||
      cookieStore.get(EMBEDDED_REF_COOKIE_NAME)?.value?.trim() || null;
  } catch {
    return null;
  }
}

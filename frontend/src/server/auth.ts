import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE_NAME = 'valuex_session';
export const REF_COOKIE_NAME = 'valuex_ref';

function getSessionSecret(): string {
  return (
    process.env.JWT_ACCESS_SECRET ||
    process.env.SESSION_SECRET ||
    'valuex-prod-default-hmac-secret-change-in-env-2026'
  );
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
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
}

export function signSessionToken(userId: string, ttlDays = 30): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: Date.now() + ttlDays * 86400 * 1000,
  };
  const base64Payload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', getSessionSecret())
    .update(base64Payload)
    .digest('base64url');
  return `${base64Payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token || !token.includes('.')) return null;
  const [base64Payload, sig] = token.split('.');
  if (!base64Payload || !sig) return null;

  const expectedSig = createHmac('sha256', getSessionSecret())
    .update(base64Payload)
    .digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(base64Payload, 'base64url').toString('utf8'),
    ) as SessionPayload;
    if (!parsed.uid || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed.uid;
  } catch {
    return null;
  }
}

export function getSessionUserIdFromCookies(): string | null {
  try {
    const cookieStore = cookies();
    const raw = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    return verifySessionToken(raw);
  } catch {
    return null;
  }
}

export function getRefCodeFromCookies(): string | null {
  try {
    return cookies().get(REF_COOKIE_NAME)?.value?.trim() || null;
  } catch {
    return null;
  }
}

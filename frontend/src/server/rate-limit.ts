import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

interface RateBucket {
  timestamps: number[];
}

const buckets = new Map<string, RateBucket>();

export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - params.windowMs;

  // Периодическая очистка старых записей, чтобы карта не разрасталась в памяти
  if (buckets.size > 2000) {
    for (const [k, b] of Array.from(buckets.entries())) {
      const fresh = b.timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) buckets.delete(k);
      else b.timestamps = fresh;
    }
  }

  const existing = buckets.get(params.key) ?? { timestamps: [] };
  existing.timestamps = existing.timestamps.filter((t) => t > cutoff);

  if (existing.timestamps.length >= params.limit) {
    const oldest = existing.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + params.windowMs - now) / 1000));
    buckets.set(params.key, existing);
    return { allowed: false, retryAfterSec };
  }

  existing.timestamps.push(now);
  buckets.set(params.key, existing);
  return { allowed: true, retryAfterSec: 0 };
}

export function extractClientIp(headers: Headers): string {
  // The supplied nginx configuration overwrites X-Real-IP with the connecting address.
  const real = headers.get('x-real-ip')?.trim() || '';
  if (isIP(real)) return real;
  // nginx appends the connecting address on the right; the first item may be spoofed.
  const forwarded = (headers.get('x-forwarded-for') || '').split(',').map((v) => v.trim());
  const lastValid = [...forwarded].reverse().find((value) => isIP(value));
  return lastValid || 'unknown';
}

export function accountRateKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

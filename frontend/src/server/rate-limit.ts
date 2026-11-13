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
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || '127.0.0.1';
}

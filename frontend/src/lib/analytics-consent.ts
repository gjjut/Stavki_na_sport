'use client';

export type AnalyticsChoice = 'loading' | 'ask' | 'allow' | 'deny';
export const ANALYTICS_STORAGE_KEY = 'valuex_analytics_consent_v1';
const SESSION_DENY_KEY = 'valuex_analytics_volatile_deny_v1';
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
export const ANALYTICS_CHOICE_EVENT = 'valuex:analytics-choice-changed';

/** Treat missing, expired, corrupt or read-only storage as no permission. */
export function readAnalyticsChoice(): AnalyticsChoice {
  if (typeof window === 'undefined') return 'ask';
  try {
    if (window.sessionStorage.getItem(SESSION_DENY_KEY) === 'deny') return 'deny';
  } catch { /* local storage still gets checked below */ }
  try {
    const raw = window.localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (!raw) return 'ask';
    const value = JSON.parse(raw) as { choice?: unknown; at?: unknown };
    if ((value.choice === 'allow' || value.choice === 'deny') && typeof value.at === 'number' &&
        value.at <= Date.now() && Date.now() - value.at < MAX_AGE_MS) {
      // A stale opt-in in read-only storage must not survive an attempted refusal.
      if (value.choice === 'allow') window.localStorage.setItem(ANALYTICS_STORAGE_KEY, raw);
      return value.choice;
    }
  } catch { /* fail closed if storage is unavailable or invalid */ }
  return 'ask';
}

/** True means the requested opt-in can actually be read back; refusal is always applied in memory. */
export function saveAnalyticsChoice(next: 'allow' | 'deny'): boolean {
  if (next === 'allow') {
    try { window.sessionStorage.removeItem(SESSION_DENY_KEY); } catch { /* verify below */ }
  }
  try {
    window.localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify({ choice: next, at: Date.now() }));
  } catch {
    if (next === 'deny') {
      try { window.localStorage.removeItem(ANALYTICS_STORAGE_KEY); } catch { /* may be read-only */ }
      try { window.sessionStorage.setItem(SESSION_DENY_KEY, 'deny'); } catch { /* may be unavailable */ }
    }
  }
  return next === 'deny' || readAnalyticsChoice() === 'allow';
}

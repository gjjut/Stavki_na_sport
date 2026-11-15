'use client';

import { readAnalyticsChoice } from './analytics-consent';

declare global {
  interface Window {
    ym?: (
      counterId: number,
      action: string,
      target?: string | Record<string, unknown>,
      params?: Record<string, unknown>,
    ) => void;
    __valuexMetrikaId?: number;
    __valuexMetrikaLoaded?: boolean;
  }
}

export function trackMetrikaGoal(
  goalName: string,
  params?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  const id = window.__valuexMetrikaId;
  if (!id || typeof window.ym !== 'function') return;
  // Do not send goals after consent has expired, been cleared, or become unreadable,
  // even if a React effect or a cross-tab event has not run yet.
  if (readAnalyticsChoice() !== 'allow') {
    delete window.__valuexMetrikaId;
    return;
  }
  try {
    window.ym(id, 'reachGoal', goalName, params);
  } catch {
    // ignore analytics errors
  }
}

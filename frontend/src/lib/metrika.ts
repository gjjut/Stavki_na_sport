'use client';

declare global {
  interface Window {
    ym?: (
      counterId: number,
      action: string,
      target?: string | Record<string, unknown>,
      params?: Record<string, unknown>,
    ) => void;
    __valuexMetrikaId?: number;
  }
}

export function trackMetrikaGoal(
  goalName: string,
  params?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return;
  const id = window.__valuexMetrikaId;
  if (!id || typeof window.ym !== 'function') return;
  try {
    window.ym(id, 'reachGoal', goalName, params);
  } catch {
    // ignore analytics errors
  }
}

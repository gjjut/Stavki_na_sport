'use client';

import React from 'react';

export function PublicLoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="mx-auto mt-4 flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="min-h-10 rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800">Повторить</button>
    </div>
  );
}

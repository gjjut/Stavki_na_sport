'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicBrandInfo } from '@/components/layout/SiteShell';
import type {
  EquityPoint,
  PublicPredictionDto,
  RecentWinFeedItem,
  SafeSessionUser,
  SportBreakdownItem,
  StatsSummary,
} from '@/server/types';

export interface PublicPlatformPayload {
  brand: PublicBrandInfo;
  viewer: SafeSessionUser | null;
  predictions: PublicPredictionDto[];
  statsByPeriod: Record<'WEEK' | 'MONTH' | 'ALL_TIME', StatsSummary>;
  equityCurve: EquityPoint[];
  sportBreakdown: SportBreakdownItem[];
  recentWinsFeed: RecentWinFeedItem[];
}

export function usePublicPlatform() {
  const [data, setData] = useState<PublicPlatformPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const ref = params?.get('ref');
      const url = ref ? `/api/v1/public?ref=${encodeURIComponent(ref)}` : '/api/v1/public';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Public data unavailable');
      const payload = (await res.json()) as PublicPlatformPayload;
      if (!payload || !payload.brand || !Array.isArray(payload.predictions) || !payload.statsByPeriod) {
        throw new Error('Invalid public data');
      }
      if (requestId === requestSequence.current) {
        setData(payload);
        setError(null);
      }
    } catch {
      if (requestId === requestSequence.current) {
        setError('Не удалось загрузить данные сайта. Проверьте соединение и попробуйте ещё раз.');
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => { requestSequence.current += 1; };
  }, [reload]);

  return { data, loading, error, reload, setData };
}

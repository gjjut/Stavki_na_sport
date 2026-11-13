'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PublicBrandInfo } from '@/components/layout/SiteShell';
import type {
  EquityPoint,
  PublicPredictionDto,
  RecentWinFeedItem,
  SafeSessionUser,
  SportBreakdownItem,
  StatsSummary,
  TariffPlan,
} from '@/server/types';

export interface PublicPlatformPayload {
  brand: PublicBrandInfo;
  viewer: SafeSessionUser | null;
  predictions: PublicPredictionDto[];
  tariffs: TariffPlan[];
  statsByPeriod: Record<'WEEK' | 'MONTH' | 'ALL_TIME', StatsSummary>;
  equityCurve: EquityPoint[];
  sportBreakdown: SportBreakdownItem[];
  recentWinsFeed: RecentWinFeedItem[];
}

export function usePublicPlatform() {
  const [data, setData] = useState<PublicPlatformPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const params =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const ref = params?.get('ref');
    const url = ref
      ? `/api/v1/public?ref=${encodeURIComponent(ref)}`
      : '/api/v1/public';
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as PublicPlatformPayload;
      setData(json);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, reload, setData };
}

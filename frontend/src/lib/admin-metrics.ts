import type { OrderTransaction, PredictionRecord } from '@/server/types';

export function isPaidPredictionSale(order: OrderTransaction): boolean {
  return order.status === 'SUCCEEDED' &&
    !(Array.isArray(order.externalRefundNotices) && order.externalRefundNotices.length > 0) &&
    (order.kind === 'SINGLE_PREDICTION' || order.kind === 'BUNDLE_PREDICTIONS');
}

export function paidAtMs(order: OrderTransaction): number {
  const date = Date.parse(order.paidAt || order.createdAt);
  return Number.isFinite(date) ? date : 0;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Calendar days are grouped in the administrator's local timezone, not UTC. */
export function buildPredictionSalesChart(orders: OrderTransaction[], now: Date, days = 14) {
  const buckets = new Map<string, { label: string; value: number; orders: number }>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.set(localDayKey(date), {
      label: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      value: 0,
      orders: 0,
    });
  }
  for (const order of orders) {
    if (!isPaidPredictionSale(order)) continue;
    const timestamp = paidAtMs(order);
    if (!timestamp) continue;
    const bucket = buckets.get(localDayKey(new Date(timestamp)));
    if (bucket) {
      bucket.value += order.amountRub;
      bucket.orders += 1;
    }
  }
  return [...buckets.values()];
}

export function aggregateSportStats(predictions: PredictionRecord[]) {
  const labels: Record<string, string> = {
    FOOTBALL: 'Футбол', HOCKEY: 'Хоккей', TENNIS: 'Теннис', ESPORTS: 'Киберспорт',
    BASKETBALL: 'Баскетбол', MMA: 'ММА',
  };
  const groups = new Map<string, { settled: number; wins: number; losses: number; profit: number; turnover: number }>();
  for (const prediction of predictions) {
    if (!prediction.settlementVerified || prediction.resultStatus === 'PENDING' ||
        prediction.profitUnits === null || !Number.isFinite(prediction.profitUnits) ||
        !Number.isFinite(prediction.stakeUnits) || prediction.stakeUnits <= 0) continue;
    const group = groups.get(prediction.sport) ?? { settled: 0, wins: 0, losses: 0, profit: 0, turnover: 0 };
    group.settled += 1;
    if (prediction.resultStatus === 'WIN') group.wins += 1;
    if (prediction.resultStatus === 'LOSS') group.losses += 1;
    group.profit += prediction.profitUnits;
    group.turnover += prediction.stakeUnits;
    groups.set(prediction.sport, group);
  }
  return [...groups.entries()].map(([sport, group]) => ({
    sport,
    label: labels[sport] ?? sport,
    settled: group.settled,
    wins: group.wins,
    losses: group.losses,
    winRatePct: group.wins + group.losses > 0 ? (group.wins / (group.wins + group.losses)) * 100 : 0,
    yieldPct: group.turnover > 0 ? (group.profit / group.turnover) * 100 : 0,
  })).sort((a, b) => b.settled - a.settled).slice(0, 6);
}

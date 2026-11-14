import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { buildPredictionSalesChart, aggregateSportStats, isPaidPredictionSale } = await loadTypeScriptModule(
  new URL('../src/lib/admin-metrics.ts', import.meta.url),
);
const { escapeCsvCell, nextSort } = await loadTypeScriptModule(
  new URL('../src/components/admin/admin-format.ts', import.meta.url),
);

test('sales exclude balance top-ups and refunds and use the local payment day', () => {
  const previousTz = process.env.TZ;
  process.env.TZ = 'Asia/Krasnoyarsk';
  try {
    const base = { kind: 'SINGLE_PREDICTION', status: 'SUCCEEDED', amountRub: 300, createdAt: '2026-11-11T06:00:00Z', paidAt: '2026-11-11T18:30:00Z' };
    const orders = [
      base,
      { ...base, kind: 'BALANCE_TOPUP', amountRub: 1000 },
      { ...base, status: 'REFUNDED', amountRub: 200 },
      { ...base, paymentMethod: 'internal_balance', amountRub: 500 },
      { ...base, amountRub: 700, externalRefundNotices: [{ id: 'refund', amountValue: '100.00', currency: 'RUB', verifiedAt: 'now' }] },
    ];
    assert.equal(isPaidPredictionSale(orders[1]), false);
    const points = buildPredictionSalesChart(orders, new Date('2026-11-12T01:00:00+07:00'), 2);
    assert.deepEqual(points.map((p) => p.value), [0, 800]);
    assert.deepEqual(points.map((p) => p.orders), [0, 2]);
  } finally {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  }
});

test('sport statistics use verified profits and actual stake turnover, not guessed odds', () => {
  const rows = [
    { sport: 'FOOTBALL', settlementVerified: true, resultStatus: 'WIN', profitUnits: 4, stakeUnits: 2 },
    { sport: 'FOOTBALL', settlementVerified: true, resultStatus: 'LOSS', profitUnits: -1, stakeUnits: 1 },
    { sport: 'FOOTBALL', settlementVerified: true, resultStatus: 'PUSH', profitUnits: 0, stakeUnits: 1 },
    { sport: 'FOOTBALL', settlementVerified: false, resultStatus: 'WIN', profitUnits: 100, stakeUnits: 1 },
  ];
  const [stat] = aggregateSportStats(rows);
  assert.equal(stat.settled, 3);
  assert.equal(stat.winRatePct, 50);
  assert.equal(stat.yieldPct, 75);
});

test('CSV values cannot be interpreted as spreadsheet formulas', () => {
  assert.equal(escapeCsvCell('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
  assert.equal(escapeCsvCell('  +malicious'), '"\'  +malicious"');
  assert.equal(escapeCsvCell('normal "text"'), '"normal ""text"""');
  assert.equal(escapeCsvCell(-120), '"-120"');
});

test('sort direction toggles and resets when a new column is selected', () => {
  assert.deepEqual(nextSort({ key: 'date', direction: 'desc' }, 'date'), { key: 'date', direction: 'asc' });
  assert.deepEqual(nextSort({ key: 'date', direction: 'asc' }, 'amount', 'desc'), { key: 'amount', direction: 'desc' });
});

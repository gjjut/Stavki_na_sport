import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const cwd = process.cwd();
const names = ['DATABASE_URL', 'NEXT_PUBLIC_SITE_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID', 'TELEGRAM_VIP_CHANNEL_ID'];
const env = Object.fromEntries(names.map((name) => [name, process.env[name]]));
for (const name of names) delete process.env[name];
process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.example.test';
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-legacy-private-'));
process.chdir(temp);
const db = require('../src/server/database.ts');
const autopilot = require('../src/server/ai-autopilot.ts');
autopilot.ensureInProcessAutopilotDaemon = () => {};
const guards = require('../src/server/guards.ts');
let viewer = null;
guards.getOptionalViewer = async () => viewer;
guards.requireAuthenticatedUser = async () => { if (!viewer) throw new Error('UNAUTHORIZED'); return viewer; };
const publicRoute = require('../src/app/api/v1/public/route.ts');
const healthRoute = require('../src/app/api/health/route.ts');
const cabinetRoute = require('../src/app/api/v1/cabinet/route.ts');
const promoRoute = require('../src/app/api/v1/billing/promo/route.ts');
const verifyRoute = require('../src/app/api/v1/predictions/verify/route.ts');
const page = require('../src/app/predictions/[slug]/page.tsx');
const og = require('../src/app/predictions/[slug]/opengraph-image/route.tsx');
const sitemap = require('../src/app/sitemap.ts').default;
const { assertNewAutopilotFixture } = require('../src/server/autopilot-commit-policy.ts');
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');
const { PredictionCard } = require('../src/components/predictions/PredictionCard.tsx');
const { NextRequest } = require('next/server');
const oldFetch = global.fetch;
let externalCalls = 0;
global.fetch = async () => { externalCalls++; throw new Error('unexpected external call in isolated test'); };

after(() => {
  global.fetch = oldFetch;
  process.chdir(cwd);
  for (const name of names) {
    if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
  }
  rmSync(temp, { recursive: true, force: true });
});

const jsonRequest = (url, body) => new NextRequest(url, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('retained starter examples are private, non-saleable and absent from public stats, SEO, digest and automation', async () => {
  const owner = await db.registerUserAccount({ email: 'owner@example.test', password: 'test-password', displayName: 'Owner' });
  const other = await db.registerUserAccount({ email: 'other@example.test', password: 'test-password', displayName: 'Other' });
  const real = await db.createPredictionByAdmin({
    sport: 'FOOTBALL', leagueName: 'Лига', homeTeam: 'Реальная команда', awayTeam: 'Соперник',
    matchStartsAt: '2099-01-01T12:00:00.000Z', selectionTitle: 'Победа 1', fixedOdds: 2,
    stakeUnits: 1, accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: true,
    analysisTeaser: 'Реальный анонс', analysisFull: 'Реальный разбор', pushToTelegram: false,
  });
  const demo = { ...real, id: 'pred_init_99', slug: 'private-demo-fixture', homeTeam: 'Демо команда',
    analysisFull: 'Сохранённый старый разбор', isFeatured: true };
  const verifiedDemo = { ...demo, id: 'pred_init_100', slug: 'verified-demo-fixture', homeTeam: 'Демо победитель',
    matchLifecycleStatus: 'FINISHED', matchStatus: 'FINISHED', matchStartsAt: '2026-11-12T10:00:00.000Z',
    finalScoreVerified: true, finalScoreVerifiedSources: ['Source A', 'Source B'], matchVerificationConflict: false,
    matchVerifiedAt: '2026-11-12T12:30:00.000Z', matchVerificationSource: 'Source A + Source B',
    liveHomeScore: 2, liveAwayScore: 1, finalScoreIsOvertime: false, resultStatus: 'WIN',
    settledAt: '2026-11-12T12:31:00.000Z', profitUnits: 1, profitPercent: 1, finalScore: '2:1' };
  const unverifiedDemo = { ...verifiedDemo, id: 'pred_init_101', slug: 'unverified-demo-fixture', finalScoreVerified: false };
  await db.mutateState((state) => {
    state.users.find((u) => u.id === owner.id).purchasedPredictionIds.push(demo.id);
    state.predictions.unshift(demo, verifiedDemo, unverifiedDemo);
    state.aiAutopilot.mode = 'OFF';
    state.aiAutopilot.autoSettleEnabled = false;
  });
  const state = await db.readState();
  viewer = state.users.find((u) => u.id === owner.id);
  const savedDemo = state.predictions.find((p) => p.id === demo.id);
  const savedVerified = state.predictions.find((p) => p.id === verifiedDemo.id);
  assert.equal(db.hasVerifiedSettledResult(savedVerified), true, 'fixture really would count without the demo filter');
  assert.equal(db.computePlatformAnalytics(state.predictions).statsByPeriod.ALL_TIME.wins, 0);
  const health = await (await healthRoute.GET()).json();
  assert.equal(health.activePredictions, 1);
  assert.equal(health.settledPredictions, 0);
  assert.equal(health.unverifiedSettlements, 0);

  for (const account of [null, viewer]) {
    const chosen = account;
    viewer = chosen;
    const response = await publicRoute.GET(new NextRequest('http://localhost/api/v1/public'));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.predictions.map((p) => p.id), [real.id]);
    assert.equal(body.statsByPeriod.ALL_TIME.wins, 0);
  }
  viewer = state.users.find((u) => u.id === owner.id);
  const cabinet = await (await cabinetRoute.GET()).json();
  assert.equal(cabinet.purchasedPredictions[0].id, demo.id);
  assert.equal(cabinet.purchasedPredictions[0].isLegacyDemo, true);
  assert.equal(cabinet.purchasedPredictions[0].salesClosed, true);
  assert.equal(cabinet.purchasedPredictions[0].analysisFull, 'Сохранённый старый разбор');
  const card = renderToStaticMarkup(React.createElement(PredictionCard, {
    prediction: cabinet.purchasedPredictions[0], defaultSinglePriceRub: 500, onBuySingle() {}, onVerifyHash() {},
  }));
  assert.match(card, /<article class="[^"]*\bmin-w-0\b/);
  assert.match(card, /Демо · архив/);
  assert.match(card, /не актуальный прогноз/);
  assert.match(card, /Открыть архивную запись/);
  assert.doesNotMatch(card, /Ваша покупка — что ставить|Как поставить и разбор/);
  assert.equal(db.toPublicPredictionDto({ ...savedDemo, accessTier: 'FREE' }, null).isLocked, true);

  const params = Promise.resolve({ slug: demo.slug });
  const meta = await page.generateMetadata({ params });
  assert.equal(meta.robots.index, false);
  assert.equal(meta.openGraph, undefined);
  const html = renderToStaticMarkup(await page.default({ params }));
  assert.match(html, /Старая демонстрационная запись/);
  assert.match(html, /Сохранённый старый разбор/);
  assert.doesNotMatch(html, /Оплатить|Как поставить/);
  assert.equal((await og.GET(new Request('http://localhost/'), { params })).status, 404);
  assert.ok(!(await sitemap()).some((entry) => entry.url.endsWith(demo.slug)));
  const digest = autopilot.buildDailyDigestHtml(state, Date.parse('2026-11-12T10:00:00.000Z'));
  assert.doesNotMatch(digest, /Демо команда|Демо победитель/);
  assert.match(digest, /Реальная команда/);
  assert.doesNotThrow(() => assertNewAutopilotFixture({ predictions: [demo], aiDrafts: [] }, demo));

  const verify = () => verifyRoute.POST(jsonRequest('http://localhost/api/v1/predictions/verify', { predictionId: demo.id }));
  assert.equal((await verify()).status, 200);
  viewer = other;
  await assert.rejects(page.default({ params }));
  assert.equal((await verify()).status, 404);
  viewer = null;
  await assert.rejects(page.default({ params }));
  assert.equal((await verify()).status, 404);
  const promo = await promoRoute.POST(jsonRequest('http://localhost/api/v1/billing/promo', { predictionIds: [demo.id], promoCode: 'START15' }));
  assert.equal(promo.status, 400);
  await assert.rejects(db.initiateOrderCheckout({ userId: other.id, kind: 'SINGLE_PREDICTION', predictionId: demo.id,
    paymentMethod: 'yookassa', expectedAmountRub: 500, expectedPaymentMode: 'TEST_INSTANT', originUrl: 'https://shop.example.test' }), /демонстрационная запись недоступна/i);
  assert.equal((await db.readState()).transactions.length, 0);

  await db.mutateState((current) => {
    current.predictions = [savedDemo, { ...savedVerified, resultStatus: 'PENDING' }];
  });
  const watch = await autopilot.runMatchStatusWatchCycle();
  const settlement = await autopilot.runAutoSettlementCycle();
  assert.equal(watch.checkedCount, 0);
  assert.equal(settlement.checkedCount, 0);
  assert.equal(settlement.settledCount, 0);
  assert.equal(externalCalls, 0);
});

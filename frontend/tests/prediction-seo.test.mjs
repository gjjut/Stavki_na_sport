import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const cwd = process.cwd(), oldDb = process.env.DATABASE_URL, oldUrl = process.env.NEXT_PUBLIC_SITE_URL;
const temp = mkdtempSync(path.join(tmpdir(), 'valuex-seo-'));
process.chdir(temp);
process.env.DATABASE_URL = '';
const db = require('../src/server/database.ts');
const predictionPage = require('../src/app/predictions/[slug]/page.tsx');
after(() => {
  process.chdir(cwd);
  if (oldDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDb;
  if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = oldUrl;
  rmSync(temp, { recursive: true, force: true });
});

test('prediction metadata emits no localhost image without an explicit origin, and uses a canonical URL when configured', async () => {
  const prediction = await db.createPredictionByAdmin({
    sport: 'FOOTBALL', leagueName: 'Тест', homeTeam: 'Север', awayTeam: 'Юг',
    matchStartsAt: '2035-01-01T12:00:00Z', selectionTitle: 'П1', fixedOdds: 2, stakeUnits: 1,
    accessTier: 'PAID_SINGLE', singlePriceRub: 500, insuredOnLoss: true,
    analysisTeaser: 'Пример', analysisFull: 'Разбор', pushToTelegram: false,
  });
  const params = Promise.resolve({ slug: prediction.slug });
  delete process.env.NEXT_PUBLIC_SITE_URL;
  const unconfigured = await predictionPage.generateMetadata({ params });
  assert.equal(unconfigured.alternates, undefined);
  assert.equal(unconfigured.openGraph.images, undefined);
  process.env.NEXT_PUBLIC_SITE_URL = 'https://shop.example.test';
  const configured = await predictionPage.generateMetadata({ params });
  assert.match(configured.title, /PredictLab/);
  assert.equal(configured.openGraph.siteName, 'PredictLab');
  const canonical = `https://shop.example.test/predictions/${prediction.slug}`;
  assert.equal(configured.alternates.canonical, canonical);
  assert.equal(configured.openGraph.images[0].url, `${canonical}/opengraph-image`);
  assert.ok((await predictionPage.default({ params })).props.slug);
  await assert.rejects(predictionPage.default({ params: Promise.resolve({ slug: 'unknown' }) }));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('./ui-test-utils.cjs');
const page = require('../src/app/leagues/[slug]/page.tsx');
const { SEO_LEAGUE_PAGES, getSeoLeagueBySlug, matchesSeoLeague } = require('../src/lib/seo-leagues.ts');

test('every league resolves asynchronous Next.js route params for both metadata and page', async () => {
  const slugs = page.generateStaticParams().map((item) => item.slug);
  assert.deepEqual(slugs, SEO_LEAGUE_PAGES.map((item) => item.slug));
  for (const cfg of SEO_LEAGUE_PAGES) {
    const params = Promise.resolve({ slug: cfg.slug });
    const metadata = await page.generateMetadata({ params });
    const element = await page.default({ params });
    assert.equal(metadata.title, cfg.metaTitle);
    assert.equal(element.props.children[1].props.leagueConfig.slug, cfg.slug);
  }
  assert.equal((await page.generateMetadata({ params: Promise.resolve({ slug: 'unknown' }) })).title, 'Раздел не найден');
  await assert.rejects(page.default({ params: Promise.resolve({ slug: 'unknown' }) }));
});

test('football landing pages distinguish Russian competitions from European ones', () => {
  const rpl = getSeoLeagueBySlug('rpl');
  const europe = getSeoLeagueBySlug('champions-league');
  const russian = { sport: 'FOOTBALL', leagueName: 'Российская Премьер-Лига' };
  const champions = { sport: 'FOOTBALL', leagueName: 'Лига чемпионов' };
  assert.equal(matchesSeoLeague(rpl, russian), true);
  assert.equal(matchesSeoLeague(europe, russian), false);
  assert.equal(matchesSeoLeague(europe, champions), true);
  assert.equal(matchesSeoLeague(rpl, champions), false);
  assert.equal(matchesSeoLeague(europe, { sport: 'HOCKEY', leagueName: 'Лига чемпионов' }), false);
  assert.equal(matchesSeoLeague(getSeoLeagueBySlug('khl'), { sport: 'HOCKEY', leagueName: 'Другой хоккейный турнир' }), true);
});

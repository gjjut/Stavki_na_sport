import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { toAdminAutopilotDto, toAdminSettingsDto } = await loadTypeScriptModule(
  new URL('../src/server/admin-secret-policy.ts', import.meta.url),
);

test('admin settings DTOs never return stored payment, Telegram, or AI API secrets', () => {
  const settings = toAdminSettingsDto({
    brandName: 'VALUEX',
    supportTelegram: '',
    freeTelegramUrl: '',
    legalSellerName: '',
    legalInn: '',
    supportEmail: '',
    paymentMode: 'YOOKASSA_LIVE',
    yookassaShopId: 'shop-id',
    yookassaSecretKey: 'yookassa-sensitive-token',
    yookassaVatCode: 1,
    defaultSinglePriceRub: 790,
    bundle2DiscountPct: 15,
    bundle3DiscountPct: 25,
    telegramBotToken: 'telegram-sensitive-token',
    telegramChannelId: '@channel',
    yandexMetrikaId: '',
  });

  assert.equal(settings.yookassaSecretKey, '');
  assert.equal(settings.telegramBotToken, '');
  assert.equal(settings.yookassaSecretKeyConfigured, true);
  assert.equal(settings.telegramBotTokenConfigured, true);
  assert.equal(JSON.stringify(settings).includes('sensitive-token'), false);
});

test('AI config DTO hides stored keys and legacy cron secrets while exposing only configured status', () => {
  const config = toAdminAutopilotDto({
    mode: 'MODERATION',
    llmProvider: 'PLUSVIBE',
    llmBaseUrl: 'https://plusvibeapi.ru/v1',
    llmApiKey: 'sk-pv-sensitive-token',
    llmModel: 'model-name',
    sportsEnabled: ['FOOTBALL'],
    morningHourMsk: 9,
    eveningHourMsk: 18,
    maxPicksPerRun: 3,
    minActiveOnStorefront: 6,
    minValueEdgePct: 3.5,
    defaultAiPriceRub: 790,
    freeEveryNthPick: 4,
    insureAiPicks: true,
    autoSettleEnabled: true,
    totalGeneratedCount: 0,
    lastFeedSource: null,
    lastMorningRunDate: null,
    lastEveningRunDate: null,
    lastScanAt: null,
    lastSettleAt: null,
    cronSecret: 'legacy-cron-sensitive-token',
  });

  assert.equal(config.llmApiKey, '');
  assert.equal(config.llmApiKeyConfigured, true);
  assert.equal(JSON.stringify(config).includes('sensitive-token'), false);
  assert.equal('cronSecret' in config, false);
});

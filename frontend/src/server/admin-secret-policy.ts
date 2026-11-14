import type { AiAutopilotConfig, PlatformSettings } from './types';

export function toAdminSettingsDto(settings: PlatformSettings): PlatformSettings {
  const {
    yookassaSecretKey,
    telegramBotToken,
    yookassaSecretKeyConfigured: _staleYooKassaFlag,
    telegramBotTokenConfigured: _staleTelegramFlag,
    ...publicSettings
  } = settings;
  return {
    ...publicSettings,
    yookassaSecretKey: '',
    telegramBotToken: '',
    yookassaSecretKeyConfigured: Boolean(yookassaSecretKey.trim()),
    telegramBotTokenConfigured: Boolean(telegramBotToken.trim()),
  };
}

export function toAdminAutopilotDto(
  config: AiAutopilotConfig,
): AiAutopilotConfig {
  const {
    llmApiKey,
    llmApiKeyConfigured: _staleApiKeyFlag,
    cronSecret: _legacyCronSecret,
    ...safeConfig
  } = config as AiAutopilotConfig & { cronSecret?: unknown };
  return {
    ...safeConfig,
    llmApiKey: '',
    llmApiKeyConfigured: Boolean(llmApiKey.trim()),
  };
}

'use client';

import React from 'react';
import { Activity, Cpu, Loader2 } from 'lucide-react';
import type {
  AiAutopilotConfig,
  AiLlmProvider,
  SportType,
} from '@/server/types';

const SPORT_OPTIONS: Array<{ id: SportType; label: string }> = [
  { id: 'FOOTBALL', label: 'Футбол' },
  { id: 'HOCKEY', label: 'Хоккей' },
  { id: 'TENNIS', label: 'Теннис' },
  { id: 'ESPORTS', label: 'Киберспорт' },
  { id: 'BASKETBALL', label: 'Баскетбол' },
  { id: 'MMA', label: 'ММА / UFC' },
];

interface AiAutopilotConfigFormProps {
  draftConfig: AiAutopilotConfig;
  setDraftConfig: React.Dispatch<React.SetStateAction<AiAutopilotConfig>>;
  busyAction: string | null;
  availableModels: string[];
  llmCheckStatus: { ok: boolean; message: string } | null;
  onApplyProviderPreset: (provider: AiLlmProvider) => void;
  onTestLlm: () => void;
  onToggleSport: (sport: SportType) => void;
  onSaveConfig: (e: React.FormEvent) => void;
}

export const AiAutopilotConfigForm: React.FC<AiAutopilotConfigFormProps> = ({
  draftConfig,
  setDraftConfig,
  busyAction,
  availableModels,
  llmCheckStatus,
  onApplyProviderPreset,
  onTestLlm,
  onToggleSport,
  onSaveConfig,
}) => {
  return (
    <form
      onSubmit={onSaveConfig}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-7"
    >
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-blue-600" />
        <h3 className="text-base font-extrabold text-slate-950">
          Нейросеть-аналитик и расписание выпусков
        </h3>
      </div>

      <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3 text-xs text-emerald-900">
        <strong>Сбор линии и результатов (0 ₽/мес):</strong> каскад прямых российских шлюзов{' '}
        <strong>Фонбет РФ → Леон РФ → Резервный Матч-центр</strong> встроен в ядро и работает автоматически без внешних ключей.
      </div>

      {/* Пресеты провайдеров ИИ */}
      <div>
        <label className="text-[11px] font-bold text-slate-500">
          Мозг написания аналитики:
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(
            [
              ['PLUSVIBE', 'PlusVibeAPI.ru (Платный РФ · ₽ без VPN)'],
              ['OLLAMA', 'Ollama Cloud (deepseek-v4.1-flash)'],
              ['ORCAROUTER', 'OrcaRouter.ai'],
              ['DEEPSEEK', 'DeepSeek API'],
              ['OPENROUTER', 'OpenRouter'],
              ['RU_GATEWAY', 'ProxyAPI / AITunnel'],
              ['OPENAI', 'OpenAI'],
              ['BUILTIN_QUANT', 'Встроенный аналитик (0 ₽, без ключей)'],
            ] as const
          ).map(([prov, label]) => (
            <button
              key={prov}
              type="button"
              onClick={() => onApplyProviderPreset(prov)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                draftConfig.llmProvider === prov
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {draftConfig.llmProvider !== 'BUILTIN_QUANT' && (
        <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3.5">
          {draftConfig.llmProvider === 'PLUSVIBE' && (
            <div className="space-y-2">
              <p className="text-[11px] leading-relaxed text-slate-600">
                Российский платный шлюз <strong>PlusVibeAPI</strong> (<code className="font-mono font-bold text-slate-900">https://plusvibeapi.ru/v1</code> + автозеркало <code className="font-mono text-slate-700">gw.plusvibeapi.ru/v1</code>). Вставьте ваш ключ <code className="font-mono font-bold">sk-pv-...</code> ниже и нажмите <strong>«Проверить токен и загрузить модели»</strong> — отобразится живой баланс в ₽ и автоматически включится коммерческий русский веб-поиск для прогнозов!
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500">
                  Модели PlusVibe (₽/1М):
                </span>
                {[
                  ['deepseek-v4.1-flash-1017', 'DeepSeek V4.1 Flash (2/8₽)'],
                  ['gpt-6-luna', 'GPT-6 Luna (3/19₽)'],
                  ['gemini-3.8-flash', 'Gemini 3.8 Flash (4.7/24₽)'],
                  ['qwen3.8-max', 'Qwen 3.8 Max (5.3/16₽)'],
                  ['gpt-6.1-sol', 'GPT-6.1 Sol (14/71₽)'],
                  ['claude-sonnet-5.5', 'Claude Sonnet 5.5 (23/114₽)'],
                ].map(([mid, mlabel]) => (
                  <button
                    key={mid}
                    type="button"
                    onClick={() =>
                      setDraftConfig({ ...draftConfig, llmModel: mid })
                    }
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-bold transition ${
                      draftConfig.llmModel === mid
                        ? 'bg-slate-900 text-white'
                        : 'border border-blue-200 bg-white text-slate-700 hover:border-blue-400'
                    }`}
                  >
                    {mlabel}
                  </button>
                ))}
              </div>
            </div>
          )}

          {draftConfig.llmProvider === 'OLLAMA' && (
            <p className="text-[11px] leading-relaxed text-slate-600">
              Шлюз <strong>Ollama Cloud</strong> (<code className="font-mono font-bold text-slate-900">https://ollama.com/v1</code>, модель <code className="font-mono font-bold text-slate-900">deepseek-v4.1-flash</code>). Вставьте ваш ключ <code className="font-mono font-bold">OLLAMA_API_KEY</code> ниже и нажмите <strong>«Проверить токен и загрузить модели»</strong> (либо задайте его в <code className="font-mono">frontend/.env.local</code>).
            </p>
          )}

          {draftConfig.llmProvider === 'ORCAROUTER' && (
            <p className="text-[11px] leading-relaxed text-slate-600">
              В кабинете{' '}
              <span className="font-mono font-bold text-slate-900">
                orcarouter.ai/console/token
              </span>{' '}
              нажмите кнопку <strong>«Копировать / Copy»</strong> в строке с вашим ключом{' '}
              <strong>initial token</strong> (скопируется длинный секретный код на{' '}
              <span className="font-mono font-bold">sk-...</span>), вставьте его ниже и нажмите{' '}
              <strong>«Проверить токен и загрузить модели»</strong>.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-[11px] font-bold text-slate-500">
                API URL шлюза
              </label>
              <input
                value={draftConfig.llmBaseUrl}
                onChange={(e) =>
                  setDraftConfig({ ...draftConfig, llmBaseUrl: e.target.value })
                }
                placeholder="https://ollama.com/v1"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">
                Модель
              </label>
              {availableModels.length > 0 ? (
                <select
                  value={draftConfig.llmModel}
                  onChange={(e) =>
                    setDraftConfig({ ...draftConfig, llmModel: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-blue-300 bg-white px-2.5 py-2 font-mono text-xs font-bold text-slate-900"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={draftConfig.llmModel}
                  onChange={(e) =>
                    setDraftConfig({ ...draftConfig, llmModel: e.target.value })
                  }
                  placeholder="deepseek-v4.1-flash"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
                />
              )}
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500">
                API-ключ (sk-pv-... PlusVibe или токен Ollama)
              </label>
              <input
                type="password"
                placeholder={
                  draftConfig.llmApiKeyConfigured
                    ? 'Ключ сохранён на сервере; введите новый только для замены'
                    : 'sk-pv-... (PlusVibeAPI) или токен Ollama'
                }
                value={draftConfig.llmApiKey}
                onChange={(e) => {
                  const val = e.target.value;
                  if (
                    val.trim().startsWith('sk-pv-') &&
                    draftConfig.llmProvider !== 'PLUSVIBE'
                  ) {
                    setDraftConfig({
                      ...draftConfig,
                      llmProvider: 'PLUSVIBE',
                      llmBaseUrl: 'https://plusvibeapi.ru/v1',
                      llmApiKey: val,
                      llmModel:
                        !draftConfig.llmModel ||
                        draftConfig.llmModel.includes('free') ||
                        draftConfig.llmModel === 'deepseek-v4.1-flash'
                          ? 'deepseek-v4.1-flash-1017'
                          : draftConfig.llmModel,
                    });
                  } else {
                    setDraftConfig({ ...draftConfig, llmApiKey: val });
                  }
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={onTestLlm}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busyAction === 'TEST_LLM' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Activity className="h-3.5 w-3.5" />
              )}
              <span>Проверить токен и загрузить модели</span>
            </button>

            {availableModels.length > 0 && (
              <span className="text-[11px] font-semibold text-emerald-700">
                Загружено моделей с вашего токена: {availableModels.length} — выберите любую в списке и нажмите «Сохранить параметры ИИ»
              </span>
            )}
          </div>

          {llmCheckStatus && (
            <div
              className={`whitespace-pre-line rounded-xl border p-2.5 text-xs font-semibold ${
                llmCheckStatus.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              {llmCheckStatus.message}
            </div>
          )}
        </div>
      )}

      {/* Выбор видов спорта */}
      <div>
        <label className="text-[11px] font-bold text-slate-500">
          Дисциплины для автоотбора:
        </label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SPORT_OPTIONS.map((sp) => {
            const active = draftConfig.sportsEnabled.includes(sp.id);
            return (
              <button
                key={sp.id}
                type="button"
                onClick={() => onToggleSport(sp.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                {sp.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Расписание и коммерческие правила ИИ */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="text-[11px] font-bold text-slate-500">
            Утренний слот (МСК)
          </label>
          <input
            type="number"
            min={0}
            max={23}
            value={draftConfig.morningHourMsk}
            onChange={(e) =>
              setDraftConfig({
                ...draftConfig,
                morningHourMsk: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-500">
            Вечерний слот (МСК)
          </label>
          <input
            type="number"
            min={0}
            max={23}
            value={draftConfig.eveningHourMsk}
            onChange={(e) =>
              setDraftConfig({
                ...draftConfig,
                eveningHourMsk: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-500">
            Матчей за выпуск
          </label>
          <input
            type="number"
            min={1}
            max={8}
            value={draftConfig.maxPicksPerRun}
            onChange={(e) =>
              setDraftConfig({
                ...draftConfig,
                maxPicksPerRun: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-500">
            Мин. перевес EV%
          </label>
          <input
            type="number"
            step="0.5"
            min={1}
            max={20}
            value={draftConfig.minValueEdgePct}
            onChange={(e) =>
              setDraftConfig({
                ...draftConfig,
                minValueEdgePct: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-slate-500">
            Цена платного прогноза ИИ (₽)
          </label>
          <input
            type="number"
            min={50}
            value={draftConfig.defaultAiPriceRub}
            onChange={(e) =>
              setDraftConfig({
                ...draftConfig,
                defaultAiPriceRub: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-500">
            Бесплатный прогрев (каждый N-й, 0 = выкл)
          </label>
          <input
            type="number"
            min={0}
            max={20}
            value={draftConfig.freeEveryNthPick}
            onChange={(e) =>
              setDraftConfig({
                ...draftConfig,
                freeEveryNthPick: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-bold"
          />
        </div>
      </div>

      <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <label className="flex items-center gap-2 text-xs font-bold text-blue-800">
          <input
            type="checkbox"
            checked={draftConfig.openSourceResearchEnabled !== false}
            onChange={(e) =>
              setDraftConfig({
                ...draftConfig,
                openSourceResearchEnabled: e.target.checked,
              })
            }
          />
          <span>
            Искать новости, травмы и форму в открытых источниках (СМИ РФ, таблицы) и отсеивать рискованные игры через ИИ-комитет
          </span>
        </label>

        <label className="flex items-center gap-2 text-xs font-bold text-emerald-800">
          <input
            type="checkbox"
            checked={draftConfig.insureAiPicks}
            onChange={(e) =>
              setDraftConfig({ ...draftConfig, insureAiPicks: e.target.checked })
            }
          />
          <span>Включать «Страховку 100% на баланс» для всех платных прогнозов ИИ</span>
        </label>

        <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <input
            type="checkbox"
            checked={draftConfig.autoSettleEnabled}
            onChange={(e) =>
              setDraftConfig({
                ...draftConfig,
                autoSettleEnabled: e.target.checked,
              })
            }
          />
          <span>
            Автоматически сверять официальный счет после игр и выплачивать страховки
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={busyAction !== null}
        className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
      >
        Сохранить настройки Автопилота
      </button>
    </form>
  );
};

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AiLlmProvider } from '@/server/types';

const PLUSVIBE_QUICK_MODELS: Array<{ id: string; label: string }> = [
  { id: 'deepseek-v4.1-flash-1017', label: 'DeepSeek V4.1 Flash (2/8₽ · Эконом)' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna (3/19₽)' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (4.7/24₽)' },
  { id: 'qwen3.8-max', label: 'Qwen 3.8 Max (5.3/16₽)' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (14/71₽ · Топ)' },
  { id: 'claude-sonnet-5.5', label: 'Claude Sonnet 5.5 (23/114₽)' },
];

const PROVIDER_PRESETS: Array<{
  id: AiLlmProvider;
  label: string;
  baseUrl: string;
  defaultModel: string;
}> = [
  {
    id: 'PLUSVIBE',
    label: 'PlusVibeAPI.ru (Платный РФ · ₽)',
    baseUrl: 'https://plusvibeapi.ru/v1',
    defaultModel: 'deepseek-v4.1-flash-1017',
  },
  {
    id: 'OLLAMA',
    label: 'Ollama Cloud (deepseek-v4.1-flash)',
    baseUrl: 'https://ollama.com/v1',
    defaultModel: 'deepseek-v4.1-flash',
  },
  {
    id: 'ORCAROUTER',
    label: 'OrcaRouter.ai',
    baseUrl: 'https://www.orcarouter.ai/v1',
    defaultModel: 'deepseek/deepseek-v4.1-flash-free',
  },
  {
    id: 'DEEPSEEK',
    label: 'DeepSeek API',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  {
    id: 'OPENROUTER',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
  },
  {
    id: 'RU_GATEWAY',
    label: 'ProxyAPI РФ (в рублях)',
    baseUrl: 'https://api.proxyapi.ru/openai/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'OPENAI',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
];

interface AdminAiChatSetupProps {
  open: boolean;
  llmProvider: AiLlmProvider;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  hasApiKey: boolean;
  onRefresh: () => Promise<void>;
}

export function AdminAiChatSetup({ open, llmProvider, llmBaseUrl, llmApiKey, llmModel, hasApiKey, onRefresh }: AdminAiChatSetupProps) {
  const [providerDraft, setProviderDraft] = useState<AiLlmProvider>(
    llmProvider === 'BUILTIN_QUANT' ? 'PLUSVIBE' : llmProvider,
  );
  const [baseUrlDraft, setBaseUrlDraft] = useState<string>(
    llmProvider === 'BUILTIN_QUANT'
      ? 'https://plusvibeapi.ru/v1'
      : llmBaseUrl || 'https://plusvibeapi.ru/v1',
  );
  const [apiKeyDraft, setApiKeyDraft] = useState<string>(llmApiKey || '');
  const [modelDraft, setModelDraft] = useState<string>(
    llmModel || 'deepseek-v4.1-flash-1017',
  );
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [balanceRub, setBalanceRub] = useState<number | null>(null);
  const [testingKey, setTestingKey] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const operationInFlight = useRef(false);
  const [keyResult, setKeyResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (llmProvider !== 'BUILTIN_QUANT') setProviderDraft(llmProvider);
    if (llmBaseUrl) setBaseUrlDraft(llmBaseUrl);
    if (llmApiKey) setApiKeyDraft(llmApiKey);
    if (llmModel) setModelDraft(llmModel);
  }, [llmProvider, llmBaseUrl, llmApiKey, llmModel]);

  const applyPreset = (id: AiLlmProvider) => {
    const found = PROVIDER_PRESETS.find((p) => p.id === id);
    if (!found) return;
    setProviderDraft(found.id);
    setBaseUrlDraft(found.baseUrl);
    setModelDraft(found.defaultModel);
    setAvailableModels([]);
    setBalanceRub(null);
    setKeyResult(null);
  };

  const handleTestAndSaveKey = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setTestingKey(true);
    setKeyResult(null);
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TEST_LLM',
          llmProvider: providerDraft,
          llmBaseUrl: baseUrlDraft,
          llmApiKey: apiKeyDraft,
          llmModel: modelDraft,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        detectedProvider?: AiLlmProvider;
        resolvedBaseUrl?: string;
        testedModel?: string;
        availableModels?: string[];
        balanceRub?: number | null;
        keySaved?: boolean;
        keySavedNow?: boolean;
        keyConfigured?: boolean;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json.error || json.message || `Проверка вернула HTTP ${res.status}`);
      }
      if (typeof json.balanceRub === 'number') {
        setBalanceRub(json.balanceRub);
      }
      if (Array.isArray(json.availableModels) && json.availableModels.length > 0) {
        setAvailableModels(json.availableModels);
      }
      const nextProvider =
        json.detectedProvider ||
        (apiKeyDraft.trim().startsWith('sk-pv-') ? 'PLUSVIBE' : providerDraft);
      const nextUrl = json.resolvedBaseUrl || baseUrlDraft;
      const nextModel = json.testedModel || modelDraft;
      setProviderDraft(nextProvider);
      setBaseUrlDraft(nextUrl);
      setModelDraft(nextModel);

      const keySaved = json.keySaved === true;
      const keySavedNow = json.keySavedNow === true;
      const connectionNote = json.ok
        ? keySavedNow
          ? ' Тестовый API-запрос успешен; новый ключ отдельно сохранён на сервере.'
          : keySaved
            ? ' Тестовый API-запрос успешен; ранее сохранённый ключ оставлен на сервере.'
            : ' Тестовый API-запрос успешен, но ключ на сервере не сохранён.'
        : keySavedNow
          ? ' API-запрос не подтвердил доступ, но новый ключ сохранён на сервере.'
          : keySaved
            ? ' API-запрос не подтвердил доступ; ранее сохранённый ключ не изменён.'
            : ' Ключ на сервере не сохранён.';
      setKeyResult({
        ok: Boolean(json.ok),
        message: `${json.message || json.error || 'Проверка выполнена'}${connectionNote}`,
      });
      if (keySaved) setApiKeyDraft('');
      await onRefresh();
    } catch (err) {
      setKeyResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Ошибка проверки ключа',
      });
    } finally {
      operationInFlight.current = false;
      setTestingKey(false);
    }
  };

  const handleSelectModelFromDropdown = async (nextModel: string) => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setSavingModel(true);
    setKeyResult(null);
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            llmProvider: providerDraft,
            llmBaseUrl: baseUrlDraft,
            llmApiKey: apiKeyDraft.trim(),
            llmModel: nextModel,
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        keySavedNow?: boolean;
      };
      if (!res.ok) {
        throw new Error(json.error || `Не удалось сохранить модель (HTTP ${res.status})`);
      }
      setModelDraft(nextModel);
      setApiKeyDraft('');
      setKeyResult({
        ok: true,
        message: json.keySavedNow
          ? `Модель «${nextModel}» сохранена; новый API-ключ отдельно записан на сервер. Доступность API этим действием не проверялась.`
          : `Модель «${nextModel}» сохранена. Это не подтверждает доступность API — проверьте соединение отдельно или отправьте запрос в чат.`,
      });
      await onRefresh();
    } catch (err) {
      setKeyResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Не удалось сохранить модель',
      });
    } finally {
      operationInFlight.current = false;
      setSavingModel(false);
    }
  };

  if (!open) return null;

  return (
  <form
    onSubmit={handleTestAndSaveKey}
    className="border-b border-blue-200 bg-blue-50/70 px-5 py-4 text-xs"
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="font-extrabold text-slate-950">
        Быстрое подключение и проверка вашей нейросети (сохраняется сразу!)
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PROVIDER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.id)}
            disabled={testingKey || savingModel}
            aria-pressed={providerDraft === p.id}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
              providerDraft === p.id
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>

    <div className="mt-3 grid gap-2.5 sm:grid-cols-12">
      <div className="sm:col-span-4">
        <label htmlFor="admin-chat-base-url" className="text-[10px] font-bold text-slate-600">
          API Base URL
        </label>
        <input
          id="admin-chat-base-url"
          disabled={testingKey || savingModel}
          value={baseUrlDraft}
          onChange={(e) => setBaseUrlDraft(e.target.value)}
          placeholder="https://plusvibeapi.ru/v1"
          className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px]"
        />
      </div>

      <div className="sm:col-span-5">
        <label htmlFor="admin-chat-api-key" className="text-[10px] font-bold text-slate-600">
          Секретный API-ключ (sk-pv-... PlusVibe или токен Ollama)
        </label>
        <input
          id="admin-chat-api-key"
          type="password"
          autoComplete="new-password"
          disabled={testingKey || savingModel}
          value={apiKeyDraft}
          onChange={(e) => {
            const val = e.target.value;
            setApiKeyDraft(val);
            if (val.trim().startsWith('sk-pv-') && providerDraft !== 'PLUSVIBE') {
              setProviderDraft('PLUSVIBE');
              setBaseUrlDraft('https://plusvibeapi.ru/v1');
              setAvailableModels([]);
              setBalanceRub(null);
              if (!modelDraft || modelDraft.includes('free') || modelDraft === 'deepseek-v4.1-flash') {
                setModelDraft('deepseek-v4.1-flash-1017');
              }
            }
          }}
          placeholder={
            hasApiKey
              ? 'Ключ сохранён на сервере; введите новый только для замены'
              : 'sk-pv-... (PlusVibeAPI) или токен Ollama'
          }
          className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px]"
        />
      </div>

      <div className="sm:col-span-3">
        <label htmlFor="admin-chat-model" className="text-[10px] font-bold text-slate-600">
          Модель
        </label>
        {availableModels.length > 0 ? (
          <select
            id="admin-chat-model"
            disabled={testingKey || savingModel}
            value={modelDraft}
            onChange={(e) =>
              void handleSelectModelFromDropdown(e.target.value)
            }
            className="mt-0.5 w-full rounded-xl border border-blue-300 bg-white px-2.5 py-2 font-mono text-[11px] font-bold text-slate-900"
          >
            {!availableModels.includes(modelDraft) && <option value={modelDraft}>{modelDraft}</option>}
            {availableModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="admin-chat-model"
            disabled={testingKey || savingModel}
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            placeholder="deepseek-v4.1-flash-1017"
            className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px]"
          />
        )}
      </div>
    </div>

    {providerDraft === 'PLUSVIBE' && (
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold text-slate-500">
          Быстрый выбор модели PlusVibe (₽/1М):
        </span>
        {PLUSVIBE_QUICK_MODELS.map((qm) => (
          <button
            key={qm.id}
            type="button"
            onClick={() => void handleSelectModelFromDropdown(qm.id)}
            disabled={testingKey || savingModel}
            aria-pressed={modelDraft === qm.id}
            className={`rounded-lg px-2 py-0.5 text-[10px] font-bold transition ${
              modelDraft === qm.id
                ? 'bg-slate-900 text-white'
                : 'border border-blue-200 bg-white text-slate-700 hover:border-blue-400'
            }`}
          >
            {qm.label}
          </button>
        ))}
        {balanceRub !== null && (
          <span className="ml-auto rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 font-mono text-[11px] font-extrabold text-emerald-800">
            Баланс: {balanceRub.toFixed(2)} ₽
          </span>
        )}
      </div>
    )}

    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <span className="text-[11px] text-slate-600">
        {providerDraft === 'PLUSVIBE' ? (
          <>
            Вставьте ключ <code className="font-mono font-bold text-slate-900">sk-pv-...</code> из кабинета{' '}
            <a
              href="https://plusvibeapi.ru/dashboard"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-blue-700 underline"
            >
              plusvibeapi.ru/dashboard
            </a>. Результат проверки относится только к тестовому запросу; последующая доступность API не гарантируется.
          </>
        ) : (
          <>
            Укажите ключ выбранного шлюза и нажмите «Проверить связь и СОХРАНИТЬ».
          </>
        )}
      </span>

      <button
        type="submit"
        disabled={testingKey || savingModel}
        className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
      >
        {testingKey && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        <span>Проверить связь и СОХРАНИТЬ</span>
      </button>
    </div>

    {keyResult && (
      <div
        role={keyResult.ok ? 'status' : 'alert'}
        className={`mt-2.5 whitespace-pre-line rounded-xl border px-3.5 py-2.5 text-[11px] font-semibold ${
          keyResult.ok
            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
            : 'border-rose-300 bg-rose-50 text-rose-900'
        }`}
      >
        {keyResult.ok ? '✅ ' : '❌ '}
        {keyResult.message}
      </div>
    )}
  </form>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { AiChatMessage, AiLlmProvider } from '@/server/types';

interface AdminAiChatPanelProps {
  initialMessages: AiChatMessage[];
  llmProvider: AiLlmProvider;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  hasApiKey: boolean;
  onRefresh: () => Promise<void>;
}

const QUICK_PROMPTS = [
  'Привет! Какая ты модель и что ты сейчас видишь по моему сайту?',
  'Проверь открытые источники и выложи 3 самых надежных матча на витрину',
  'Проверь свежие спортивные новости, составы и травмы по матчам РПЛ и КХЛ',
  'Создай промокод VIP20 на скидку 20% на 150 активаций',
  'Поставь стандартную цену прогноза 790 ₽ и включи полный автопилот 24/7',
  'Опубликуй красивую сводку дня и статистики в наш Telegram-канал',
];

const PROVIDER_PRESETS: Array<{
  id: AiLlmProvider;
  label: string;
  baseUrl: string;
  defaultModel: string;
}> = [
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

export const AdminAiChatPanel: React.FC<AdminAiChatPanelProps> = ({
  initialMessages,
  llmProvider,
  llmBaseUrl,
  llmApiKey,
  llmModel,
  hasApiKey,
  onRefresh,
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Встроенная прямо в чат быстрая настройка и диагностика API-ключа!
  const [setupOpen, setSetupOpen] = useState<boolean>(!hasApiKey);
  const [providerDraft, setProviderDraft] = useState<AiLlmProvider>(
    llmProvider === 'BUILTIN_QUANT' ? 'ORCAROUTER' : llmProvider,
  );
  const [baseUrlDraft, setBaseUrlDraft] = useState<string>(
    llmProvider === 'BUILTIN_QUANT'
      ? 'https://www.orcarouter.ai/v1'
      : llmBaseUrl || 'https://www.orcarouter.ai/v1',
  );
  const [apiKeyDraft, setApiKeyDraft] = useState<string>(llmApiKey || '');
  const [modelDraft, setModelDraft] = useState<string>(
    llmModel || 'gemini-2.5-flash',
  );
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testingKey, setTestingKey] = useState(false);
  const [keyResult, setKeyResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    if (llmProvider !== 'BUILTIN_QUANT') setProviderDraft(llmProvider);
    if (llmBaseUrl) setBaseUrlDraft(llmBaseUrl);
    if (llmApiKey) setApiKeyDraft(llmApiKey);
    if (llmModel) setModelDraft(llmModel);
  }, [llmProvider, llmBaseUrl, llmApiKey, llmModel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const applyPreset = (id: AiLlmProvider) => {
    const found = PROVIDER_PRESETS.find((p) => p.id === id);
    if (!found) return;
    setProviderDraft(found.id);
    setBaseUrlDraft(found.baseUrl);
    setModelDraft(found.defaultModel);
    setKeyResult(null);
  };

  const handleTestAndSaveKey = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
        resolvedBaseUrl?: string;
        testedModel?: string;
        availableModels?: string[];
        message?: string;
        error?: string;
      };

      if (Array.isArray(json.availableModels) && json.availableModels.length > 0) {
        setAvailableModels(json.availableModels);
      }
      const nextUrl = json.resolvedBaseUrl || baseUrlDraft;
      const nextModel = json.testedModel || modelDraft;
      setBaseUrlDraft(nextUrl);
      setModelDraft(nextModel);

      // Принудительно сохраняем в базу даже если нужно выбрать другую модель вручную
      if (apiKeyDraft.trim().length > 8) {
        await fetch('/api/v1/admin/autopilot', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              llmProvider: providerDraft,
              llmBaseUrl: nextUrl,
              llmApiKey: apiKeyDraft.trim(),
              llmModel: nextModel,
            },
          }),
        });
      }

      setKeyResult({
        ok: Boolean(json.ok),
        message: json.message || json.error || 'Проверка выполнена',
      });
      await onRefresh();
    } catch (err) {
      setKeyResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Ошибка проверки ключа',
      });
    } finally {
      setTestingKey(false);
    }
  };

  const handleSelectModelFromDropdown = async (nextModel: string) => {
    setModelDraft(nextModel);
    await fetch('/api/v1/admin/autopilot', {
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
    setKeyResult({
      ok: true,
      message: `Модель переключена на «${nextModel}» и сохранена! Теперь напишите любое сообщение в чат ниже.`,
    });
    await onRefresh();
  };

  const sendMessage = async (textOverride?: string) => {
    const prompt = (textOverride ?? input).trim();
    if (!prompt || sending) return;

    const optimisticUser: AiChatMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: prompt,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUser]);
    if (!textOverride) setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/admin/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const json = (await res.json()) as {
        messages?: AiChatMessage[];
        assistantMessage?: AiChatMessage;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || 'Не удалось получить ответ нейросети');
      }
      if (Array.isArray(json.messages)) {
        setMessages(json.messages);
      } else if (json.assistantMessage) {
        setMessages((prev) => [...prev, json.assistantMessage!]);
      }
      if (json.assistantMessage?.executedActions?.length) {
        await onRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка соединения с ИИ');
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm('Очистить историю переписки с ИИ-управляющим?')) return;
    await fetch('/api/v1/admin/ai-chat', { method: 'DELETE' });
    setMessages([]);
  };

  const maskedKey =
    llmApiKey && llmApiKey.trim().length > 8
      ? `${llmApiKey.trim().slice(0, 6)}...${llmApiKey.trim().slice(-4)}`
      : 'не сохранен';

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-12">
      {/* Левая колонка: основной чат с ИИ-управляющим */}
      <div className="flex min-h-[700px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs lg:col-span-8">
        {/* Шапка чата */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#0B0F19] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-black">
                <span>ИИ-Управляющий и Главный аналитик сайта</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  <Globe className="h-3 w-3" />
                  <span>Поиск в сети + Управление БД</span>
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-300">
                {hasApiKey ? (
                  <span>
                    Активен ключ <code className="text-emerald-300">{maskedKey}</code> ·{' '}
                    <strong>{llmProvider}</strong> · модель{' '}
                    <strong className="text-blue-300">{llmModel}</strong>
                  </span>
                ) : (
                  <span className="text-amber-300">
                    ⚠️ API-ключ нейросети еще не сохранен на сервере — подключите его прямо ниже!
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSetupOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-extrabold transition ${
                hasApiKey
                  ? 'border border-white/15 bg-white/10 text-white hover:bg-white/20'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>
                {setupOpen
                  ? 'Скрыть настройку ключа'
                  : 'Подключить / Проверить ключ API'}
              </span>
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Очистить</span>
              </button>
            )}
          </div>
        </div>

        {/* Встроенная панель подключения ключа и диагностики прямо внутри чата */}
        {setupOpen && (
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
                <label className="text-[10px] font-bold text-slate-600">
                  API Base URL
                </label>
                <input
                  value={baseUrlDraft}
                  onChange={(e) => setBaseUrlDraft(e.target.value)}
                  placeholder="https://www.orcarouter.ai/v1"
                  className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px]"
                />
              </div>

              <div className="sm:col-span-5">
                <label className="text-[10px] font-bold text-slate-600">
                  Секретный API-ключ (начинается на sk-...)
                </label>
                <input
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => setApiKeyDraft(e.target.value)}
                  placeholder="sk-..."
                  className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px]"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="text-[10px] font-bold text-slate-600">
                  Модель
                </label>
                {availableModels.length > 0 ? (
                  <select
                    value={modelDraft}
                    onChange={(e) =>
                      void handleSelectModelFromDropdown(e.target.value)
                    }
                    className="mt-0.5 w-full rounded-xl border border-blue-300 bg-white px-2.5 py-2 font-mono text-[11px] font-bold text-slate-900"
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={modelDraft}
                    onChange={(e) => setModelDraft(e.target.value)}
                    placeholder="gemini-2.5-flash"
                    className="mt-0.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[11px]"
                  />
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-600">
                Нажмите «Копировать» рядом с вашим ключом на{' '}
                <a
                  href="https://www.orcarouter.ai/console/token"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-blue-700 underline"
                >
                  orcarouter.ai/console/token
                </a>{' '}
                и вставьте сюда.
              </span>

              <button
                type="submit"
                disabled={testingKey}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {testingKey && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Проверить связь и СОХРАНИТЬ</span>
              </button>
            </div>

            {keyResult && (
              <div
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
        )}

        {/* Лента сообщений */}
        <div className="max-h-[520px] flex-1 space-y-4 overflow-y-auto bg-[#F8FAFC] p-5">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-blue-200/70 bg-white p-5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Готов к диалогу и управлению сайтом</span>
              </div>
              <h3 className="mt-2.5 text-base font-extrabold text-slate-950">
                Поручите мне любую задачу по сайту, проверке новостей или Telegram-каналу
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Если вдруг при обращении к API нейросети возникнет любая ошибка (не сохранен ключ, закончился баланс токена, неверное имя модели или блокировка шлюза) — я сразу покажу <strong>точный код ошибки от сервера и пошаговое решение прямо в сообщении</strong>.
              </p>
            </div>
          )}

          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-3.5 text-xs leading-relaxed shadow-xs ${
                    isUser
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[10px] font-bold">
                    {isUser ? (
                      <span className="inline-flex items-center gap-1 opacity-85">
                        <User className="h-3 w-3" />
                        <span>Вы (Владелец)</span>
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 text-blue-700">
                          <Bot className="h-3 w-3 text-blue-600" />
                          <span>ИИ-Управляющий</span>
                        </span>
                        {msg.modelLabel && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-600">
                            {msg.modelLabel}
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* НАГЛЯДНАЯ ДИАГНОСТИКА ОШИБКИ СВЯЗИ С МОДЕЛЬЮ + ПУТИ РЕШЕНИЯ */}
                  {msg.diagnostic && (
                    <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-slate-900">
                      <div className="flex items-start gap-2 font-extrabold text-rose-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                        <span>Диагностика: {msg.diagnostic.title}</span>
                      </div>

                      <div className="mt-1.5 rounded-lg border border-amber-200/80 bg-white/80 px-2.5 py-1.5 font-mono text-[10px] text-slate-700">
                        {msg.diagnostic.technicalDetails}
                      </div>

                      <div className="mt-2.5 text-[11px] font-bold text-slate-900">
                        Как решить прямо сейчас:
                      </div>
                      <ol className="mt-1 list-decimal space-y-1 pl-4 text-[11px] text-slate-800">
                        {msg.diagnostic.solutions.map((step, idx) => (
                          <li key={idx}>{step}</li>
                        ))}
                      </ol>

                      {!setupOpen && (
                        <button
                          type="button"
                          onClick={() => setSetupOpen(true)}
                          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700"
                        >
                          <KeyRound className="h-3 w-3" />
                          <span>Открыть настройку ключа прямо здесь ↑</span>
                        </button>
                      )}
                    </div>
                  )}

                  {msg.executedActions && msg.executedActions.length > 0 && (
                    <div className="mb-2.5 space-y-1.5">
                      {msg.executedActions.map((act, i) => (
                        <div
                          key={`${msg.id}_act_${i}`}
                          className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold ${
                            act.ok
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                              : 'border-rose-200 bg-rose-50 text-rose-800'
                          }`}
                        >
                          {act.ok ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          ) : (
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                          )}
                          <div>
                            <span className="font-extrabold">
                              Действие на сайте:
                            </span>{' '}
                            {act.summary}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="whitespace-pre-line">{msg.content}</div>
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600 shadow-xs">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>
                  Обращаюсь к нейросети и проверяю открытые источники…
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
              Ошибка запроса: {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Форма ввода */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className="border-t border-slate-200 bg-white p-3.5"
        >
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Напишите вопрос или поручение (например: «Привет, что ты за модель?», «Проверь новости РПЛ», «Создай промокод VIP25 на 25%»)..."
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-blue-600 px-5 text-xs font-extrabold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-500 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>Отправить</span>
            </button>
          </div>
        </form>
      </div>

      {/* Правая колонка: быстрые команды */}
      <div className="space-y-4 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
            <Wrench className="h-4 w-4 text-blue-600" />
            <span>Быстрые команды в 1 клик</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Нажмите на любой запрос для проверки диалога и команд:
          </p>

          <div className="mt-3 space-y-2">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => void sendMessage(q)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

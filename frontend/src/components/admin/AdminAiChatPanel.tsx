'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Globe,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { AiChatMessage } from '@/server/types';

interface AdminAiChatPanelProps {
  initialMessages: AiChatMessage[];
  llmProvider: string;
  llmModel: string;
  hasApiKey: boolean;
  onRefresh: () => Promise<void>;
  onSwitchToAutopilotSettings: () => void;
}

const QUICK_PROMPTS = [
  'Проверь открытые источники и выложи 3 самых надежных матча на витрину',
  'Дай подробную сводку по выручке, заказам и активным прогнозам на сайте',
  'Найди свежие спортивные новости, составы и травмы по матчам РПЛ и КХЛ',
  'Создай промокод VIP20 на скидку 20% на 150 активаций',
  'Поставь стандартную цену прогноза 790 ₽ и включи полный автопилот 24/7',
  'Опубликуй красивую сводку дня и статистики в наш Telegram-канал',
];

export const AdminAiChatPanel: React.FC<AdminAiChatPanelProps> = ({
  initialMessages,
  llmProvider,
  llmModel,
  hasApiKey,
  onRefresh,
  onSwitchToAutopilotSettings,
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

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

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-12">
      {/* Левая колонка: основной чат с ИИ-управляющим */}
      <div className="flex h-[680px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs lg:col-span-8">
        {/* Шапка чата */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#0B0F19] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-black">
                <span>ИИ-Управляющий и Главный аналитик сайта</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  <Globe className="h-3 w-3" />
                  <span>Поиск в сети + Полный доступ к БД</span>
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                {hasApiKey
                  ? `Подключена модель: ${llmProvider} · ${llmModel}`
                  : 'Встроенный режим команд (подключите ключ OrcaRouter / Gemini для полного диалога)'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!hasApiKey && (
              <button
                type="button"
                onClick={onSwitchToAutopilotSettings}
                className="rounded-xl bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-500"
              >
                Подключить API-ключ →
              </button>
            )}
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

        {/* Лента сообщений */}
        <div className="flex-1 space-y-4 overflow-y-auto bg-[#F8FAFC] p-5">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-blue-200/70 bg-white p-5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Готов к работе с вашим сайтом</span>
              </div>
              <h3 className="mt-2.5 text-base font-extrabold text-slate-950">
                Поручите мне любую задачу по сайту, аналитике матчей или Telegram-каналу
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Я вижу всю живую базу сайта (выручку, клиентов, активные карточки, промокоды, настройки), умею искать свежие спортивные новости и травмы в открытых источниках и могу прямо из чата создавать прогнозы, менять цены, начислять баланс и публиковать посты в ваш Telegram.
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
                  className={`max-w-[88%] rounded-2xl px-4 py-3.5 text-xs leading-relaxed shadow-xs ${
                    isUser
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold opacity-75">
                    {isUser ? (
                      <>
                        <User className="h-3 w-3" />
                        <span>Вы (Владелец)</span>
                      </>
                    ) : (
                      <>
                        <Bot className="h-3 w-3 text-blue-600" />
                        <span className="text-blue-700">ИИ-Управляющий</span>
                      </>
                    )}
                  </div>

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
                  Проверяю данные сайта и открытые источники, выполняю поручение…
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
              {error}
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
              placeholder="Напишите поручение: например «Проверь новости по Спартаку и выложи прогноз», «Создай промокод LETO25 на 25%» или «Какая у нас выручка?»..."
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

      {/* Правая колонка: быстрые команды и справка возможностей */}
      <div className="space-y-4 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
            <Wrench className="h-4 w-4 text-blue-600" />
            <span>Быстрые команды в 1 клик</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Нажмите на любой готовый запрос — нейросеть сразу выполнит его:
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

        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/50 p-5 text-xs text-slate-700">
          <div className="font-extrabold text-slate-950">
            Что умеет ИИ-Управляющий прямо из этого чата:
          </div>
          <ul className="mt-2.5 space-y-1.5 leading-relaxed">
            <li>
              • <strong>Искать реальные новости, травмы и форму</strong> команд в открытых СМИ (Google News RU, превью, таблицы ESPN) перед выбором ставки.
            </li>
            <li>
              • <strong>Публиковать, редактировать, делать бесплатными и рассчитывать</strong> любые матчи на витрине.
            </li>
            <li>
              • <strong>Управлять ценами, скидками за наборы и промокодами</strong> (создать/удалить промокод за секунду).
            </li>
            <li>
              • <strong>Начислять баланс или дарить прогнозы</strong> клиентам по их E-mail.
            </li>
            <li>
              • <strong>Писать и сразу публиковать посты</strong> и сводки в ваш Telegram-канал.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

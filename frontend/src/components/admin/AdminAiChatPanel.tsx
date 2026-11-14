'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Globe,
  KeyRound,
  Send,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { AiChatMessage, AiLlmProvider } from '@/server/types';
import { AdminAiChatSetup } from './AdminAiChatSetup';
import { AdminAiChatMessages } from './AdminAiChatMessages';
import { ConfirmDialog } from './ui';

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

export const AdminAiChatPanel: React.FC<AdminAiChatPanelProps> = ({
  initialMessages,
  llmProvider,
  llmBaseUrl,
  llmApiKey,
  llmModel,
  hasApiKey,
  onRefresh,
}) => {
  const hasConfiguredExternalModel =
    hasApiKey && llmProvider !== 'BUILTIN_QUANT';
  const [messages, setMessages] = useState<AiChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const clearingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [setupOpen, setSetupOpen] = useState(!hasConfiguredExternalModel);

  useEffect(() => {
    if (!sendingRef.current && !clearingRef.current) setMessages(initialMessages);
  }, [initialMessages]);

  const sendMessage = async () => {
    const prompt = input.trim();
    if (!prompt || sendingRef.current || clearingRef.current) return;
    sendingRef.current = true;

    const optimisticUser: AiChatMessage = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: prompt,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUser]);
    setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/admin/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: AiChatMessage[];
        assistantMessage?: AiChatMessage;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Не удалось получить ответ (HTTP ${res.status})`);
      if (Array.isArray(json.messages)) {
        setMessages(json.messages);
      } else if (json.assistantMessage) {
        setMessages((prev) => [...prev, json.assistantMessage!]);
      } else {
        throw new Error('Сервер не вернул ответ чата');
      }
      if (json.assistantMessage?.executedActions?.length) {
        try {
          await onRefresh();
        } catch {
          setError('Ответ получен, но данные панели не обновились. Обновите страницу.');
        }
      }
    } catch (err) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticUser.id));
      setInput(prompt);
      const message = err instanceof Error ? err.message : 'Ошибка соединения с ИИ';
      setError(`${message}. Итог поручения не подтверждён: перед повтором проверьте историю и изменения на сайте.`);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const clearHistory = async () => {
    if (sendingRef.current || clearingRef.current) return;
    clearingRef.current = true;
    setClearing(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/ai-chat', { method: 'DELETE' });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Не удалось очистить историю (HTTP ${res.status})`);
      setMessages([]);
      setConfirmClear(false);
      try {
        await onRefresh();
      } catch {
        setError('История очищена, но данные панели не обновились. Обновите страницу.');
      }
    } catch (err) {
      setConfirmClear(false);
      setError(err instanceof Error ? err.message : 'Не удалось очистить историю диалога');
    } finally {
      clearingRef.current = false;
      setClearing(false);
    }
  };

  const maskedKey = hasApiKey
    ? 'сохранён на сервере, значение скрыто'
    : 'не сохранён';

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-12">
      {/* Левая колонка: основной чат с ИИ-управляющим */}
      <div className="flex h-[74dvh] min-h-[540px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs lg:col-span-8 lg:h-[740px]">
        {/* Шапка чата */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#0B0F19] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-black">
                <span>ИИ-Управляющий и Главный аналитик сайта</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                  <Globe className="h-3 w-3" />
                  <span>Инструменты сайта · поиск по доступности</span>
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-300">
                {hasConfiguredExternalModel ? (
                  <span>
                    В настройках сохранён ключ{' '}
                    <code className="text-slate-200">{maskedKey}</code> ·{' '}
                    <strong>{llmProvider}</strong> · модель{' '}
                    <strong className="text-blue-300">{llmModel}</strong> · связь отдельно не подтверждена
                  </span>
                ) : (
                  <span className="text-amber-300">
                    ⚠️ Внешняя модель не настроена: отвечает встроенный резервный модуль, не нейросеть.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSetupOpen((v) => !v)}
              aria-expanded={setupOpen}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-extrabold transition ${
                hasConfiguredExternalModel
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
                onClick={() => setConfirmClear(true)}
                disabled={sending || clearing}
                className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Очистить</span>
              </button>
            )}
          </div>
        </div>

        <AdminAiChatSetup
          open={setupOpen}
          llmProvider={llmProvider}
          llmBaseUrl={llmBaseUrl}
          llmApiKey={llmApiKey}
          llmModel={llmModel}
          hasApiKey={hasApiKey}
          onRefresh={onRefresh}
        />

        <AdminAiChatMessages
          messages={messages}
          sending={sending}
          error={error}
          setupOpen={setupOpen}
          onOpenSetup={() => setSetupOpen(true)}
        />

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
              ref={inputRef}
              rows={2}
              value={input}
              disabled={sending || clearing}
              aria-label="Сообщение ИИ-управляющему"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Напишите вопрос или поручение (например: «Привет, что ты за модель?», «Проверь новости РПЛ», «Создай промокод VIP25 на 25%»)..."
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || clearing || !input.trim()}
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
            <span>Примеры запросов</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Выберите запрос, проверьте его и отправьте из поля чата.
          </p>

          <div className="mt-3 space-y-2">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending || clearing}
                onClick={() => {
                  setInput(q);
                  inputRef.current?.focus();
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmClear}
        title="Очистить историю чата?"
        description="Все сообщения диалога будут удалены. Это действие нельзя отменить."
        confirmLabel="Очистить историю"
        busy={clearing}
        onCancel={() => { if (!clearing) setConfirmClear(false); }}
        onConfirm={() => void clearHistory()}
      />
    </div>
  );
};

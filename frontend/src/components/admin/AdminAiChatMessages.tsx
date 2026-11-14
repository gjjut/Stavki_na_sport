'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, Bot, CheckCircle2, KeyRound, Loader2, Sparkles, User, XCircle } from 'lucide-react';
import type { AiChatMessage } from '@/server/types';

interface AdminAiChatMessagesProps {
  messages: AiChatMessage[];
  sending: boolean;
  error: string | null;
  setupOpen: boolean;
  onOpenSetup: () => void;
}

export function AdminAiChatMessages({ messages, sending, error, setupOpen, onOpenSetup }: AdminAiChatMessagesProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const wasSending = useRef(false);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const area = scrollRef.current;
    if (!area) return;
    // A new outgoing message brings the user to the latest conversation, but an
    // incoming reply must not interrupt someone reading older messages.
    if (sending && !wasSending.current) stickToBottom.current = true;
    wasSending.current = sending;
    if (stickToBottom.current) {
      area.scrollTop = area.scrollHeight;
      setShowJump(false);
    } else {
      setShowJump(true);
    }
  }, [messages, sending, error]);

  const handleScroll = () => {
    const area = scrollRef.current;
    if (!area) return;
    const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
    stickToBottom.current = nearBottom;
    setShowJump(!nearBottom);
  };

  const jumpToBottom = () => {
    const area = scrollRef.current;
    if (!area) return;
    stickToBottom.current = true;
    area.scrollTop = area.scrollHeight;
    setShowJump(false);
  };

  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="История чата"
        aria-live="polite"
        aria-relevant="additions"
        className="max-h-[520px] w-full flex-1 space-y-4 overflow-y-auto bg-[#F8FAFC] p-5"
      >
          {messages.length === 0 && (
            <div className="rounded-2xl border border-blue-200/70 bg-white p-5">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Доступны поддерживаемые команды и диагностика</span>
              </div>
              <h3 className="mt-2.5 text-base font-extrabold text-slate-950">
                Попросите проверить источники, управлять настройками или запустить проверенный сбор
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Успешная проверка ключа не гарантирует, что каждый последующий запрос пройдет: фактический статус модели и каждого действия показывается в ответе. Без настроенной внешней модели некоторые команды выполняет только встроенный резервный модуль.
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

                      {!setupOpen &&
                        msg.diagnostic.code !== 'ACTION_FORMAT_RECOVERED' &&
                        msg.diagnostic.code !== 'INVALID_AGENT_ACTION' && (
                          <button
                            type="button"
                            onClick={onOpenSetup}
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
            <div className="flex justify-start" role="status" aria-live="polite">
              <div className="inline-flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600 shadow-xs">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span>
                    Обрабатываю запрос; фактический статус модели и действий появится в ответе…
                  </span>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-700">
              Ошибка запроса: {error}
            </div>
          )}

      </div>
      {showJump && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-3 right-4 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 shadow-md hover:bg-blue-50"
        >
          <ArrowDown className="h-3.5 w-3.5" /> К последним сообщениям
        </button>
      )}
    </div>
  );
}

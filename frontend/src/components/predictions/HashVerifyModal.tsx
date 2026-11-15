'use client';

import React, { useEffect, useState } from 'react';
import { Check, Copy, Lock, ShieldCheck, X } from 'lucide-react';
import type { PublicPredictionDto } from '@/server/types';

export interface VerifiedHashPayload {
  predictionId: string;
  matchLabel: string;
  oddsLockedAt: string;
  canonicalPayload: string;
  storedHash: string;
  recomputedHash: string;
  isAuthentic: boolean;
}

interface HashVerifyModalProps {
  prediction: PublicPredictionDto | null;
  onClose: () => void;
}

export const HashVerifyModal: React.FC<HashVerifyModalProps> = ({
  prediction,
  onClose,
}) => {
  const [verified, setVerified] = useState<VerifiedHashPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    setVerified(null);
    setVerifyError(null);
    setCopied(false);
    if (!prediction || prediction.isLocked) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/v1/predictions/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ predictionId: prediction.id }),
        });
        if (!res.ok) throw new Error('Не удалось выполнить проверку. Попробуйте позже.');
        const json = (await res.json()) as VerifiedHashPayload;
        if (!cancelled) setVerified(json);
      } catch {
        if (!cancelled) setVerifyError('Не удалось выполнить проверку. Попробуйте позже.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [prediction]);

  useEffect(() => {
    if (!prediction) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prediction, onClose]);

  if (!prediction) return null;

  const copyHash = async () => {
    await navigator.clipboard.writeText(prediction.verificationHash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Проверка контрольной суммы прогноза"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between bg-[#0B0F19] px-5 py-4 text-white sm:px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h3 className="text-sm font-bold">Проверка контрольной суммы</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть проверку"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs leading-relaxed text-slate-700">
            <strong className="text-slate-900">Как это работает:</strong> SHA-256 позволяет сравнить отпечаток с текущими временем матча, исходом, коэффициентом и долей банка. Текст разбора в отпечаток не входит. Хеш на сайте не доказывает время публикации и не исключает одновременную замену данных и хеша. Для независимой проверки сохраните отпечаток заранее вне сайта.
          </div>

          <div className="mt-4 space-y-2.5 text-xs">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-[11px] font-semibold text-slate-400">Матч</div>
              <div className="mt-0.5 font-extrabold text-slate-900">
                {prediction.homeTeam} — {prediction.awayTeam}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Указанное время фиксации:{' '}
                {new Date(prediction.oddsLockedAt).toLocaleString('ru-RU')}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-400">
                  Цифровой отпечаток прогноза (SHA-256)
                </span>
                <button
                  type="button"
                  onClick={copyHash}
                  className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Скопировать</span>
                    </>
                  )}
                </button>
              </div>
              <code className="mt-1 block break-all font-mono text-[11px] text-slate-800">
                {prediction.verificationHash}
              </code>
            </div>

            {prediction.isLocked ? (
              <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-slate-600">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  Пока прогноз закрыт, строка исхода скрыта. После открытия или завершения события можно сравнить текущие данные с опубликованным отпечатком и сохранённой заранее копией.
                </span>
              </div>
            ) : verified ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-[11px] font-semibold text-slate-400">
                    Данные для расчёта отпечатка
                  </div>
                  <code className="mt-1 block break-all font-mono text-[11px] text-blue-700">
                    {verified.canonicalPayload}
                  </code>
                </div>

                <div className={`rounded-2xl border p-3.5 font-bold ${verified.isAuthentic ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                  {verified.isAuthentic
                    ? 'Текущие данные совпадают с хешем, который хранится на сайте. Сравните его с копией, сохранённой вами до матча.'
                    : 'Внимание: обнаружено расхождение контрольной суммы.'}
                </div>
              </>
            ) : (
              <div role="status" className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-slate-500">
                {verifyError || 'Проверяем контрольную сумму...'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

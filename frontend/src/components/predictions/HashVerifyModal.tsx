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

  useEffect(() => {
    setVerified(null);
    setCopied(false);
    if (!prediction || prediction.isLocked) return;

    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/v1/predictions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionId: prediction.id }),
      });
      if (res.ok && !cancelled) {
        const json = (await res.json()) as VerifiedHashPayload;
        setVerified(json);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [prediction]);

  if (!prediction) return null;

  const copyHash = async () => {
    await navigator.clipboard.writeText(prediction.verificationHash);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#0B0F19] px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-400" />
            <h3 className="text-sm font-bold">Цифровая подпись честности SHA-256</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-xs leading-relaxed text-slate-500">
            В момент публикации события система формирует криптографический отпечаток SHA-256 из времени старта, исхода и коэффициента. Изменить исход или кэф задним числом невозможно.
          </p>

          <div className="mt-4 space-y-2.5 text-xs">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-[11px] font-semibold text-slate-400">Событие</div>
              <div className="mt-0.5 font-extrabold text-slate-900">
                {prediction.homeTeam} — {prediction.awayTeam}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">
                Кэф зафиксирован:{' '}
                {new Date(prediction.oddsLockedAt).toLocaleString('ru-RU')}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400">
                  Публичный слепок SHA-256 (до матча)
                </span>
                <button
                  type="button"
                  onClick={copyHash}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3" />
                      <span>Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Копировать</span>
                    </>
                  )}
                </button>
              </div>
              <code className="mt-1 block break-all font-mono text-slate-800">
                {prediction.verificationHash}
              </code>
            </div>

            {prediction.isLocked ? (
              <div className="flex items-start gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 text-slate-700">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                <span>
                  Исходная текстовая строка закрыта до покупки или окончания встречи, чтобы исключить перебор исхода. Сохраните SHA-256 выше и сверьте его после финального свистка.
                </span>
              </div>
            ) : verified ? (
              <>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-[11px] font-semibold text-slate-400">
                    Открытая каноническая строка для сверки
                  </div>
                  <code className="mt-1 block break-all font-mono text-blue-700">
                    {verified.canonicalPayload}
                  </code>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 font-bold text-emerald-700">
                  {verified.isAuthentic
                    ? 'Подлинность 100% подтверждена: исход и коэффициент не редактировались.'
                    : 'Внимание: обнаружено расхождение контрольной суммы.'}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-slate-500">
                Выполняется криптографическая сверка...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

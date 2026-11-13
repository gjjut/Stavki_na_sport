'use client';

import React from 'react';
import { ShieldCheck, X } from 'lucide-react';

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
  data: VerifiedHashPayload | null;
  onClose: () => void;
}

export const HashVerifyModal: React.FC<HashVerifyModalProps> = ({ data, onClose }) => {
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#0B0F19] px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-400" />
            <h3 className="text-sm font-bold">Проверка цифровой подписи SHA-256</h3>
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
            В момент публикации система формирует хеш SHA-256 из времени старта, исхода и коэффициента. Изменить исход или кэф задним числом невозможно — контрольная сумма мгновенно перестанет совпадать.
          </p>

          <div className="mt-4 space-y-2.5 text-xs">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-[11px] font-semibold text-slate-400">Событие</div>
              <div className="mt-0.5 font-extrabold text-slate-900">{data.matchLabel}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-[11px] font-semibold text-slate-400">
                Зафиксированная строка до начала матча
              </div>
              <code className="mt-1 block break-all font-mono text-blue-700">
                {data.canonicalPayload}
              </code>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-[11px] font-semibold text-slate-400">
                Контрольная сумма SHA-256
              </div>
              <code className="mt-1 block break-all font-mono text-slate-800">
                {data.recomputedHash}
              </code>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 font-bold text-emerald-700">
              {data.isAuthentic
                ? 'Подлинность подтверждена: исход и коэффициент не редактировались.'
                : 'Внимание: обнаружено несовпадение подписи.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

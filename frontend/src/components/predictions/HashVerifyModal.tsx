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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="text-base font-bold text-white">
              Криптографическая проверка прогноза
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          В момент публикации сервер формирует цифровую подпись SHA-256 из времени начала матча, выбранного исхода и зафиксированного коэффициента. Любая попытка изменить коэффициент или исход задним числом нарушит совпадение хеша.
        </p>

        <div className="mt-4 space-y-2.5 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-slate-400">Матч</div>
            <div className="mt-0.5 font-semibold text-white">{data.matchLabel}</div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-slate-400">Исходная строка до начала матча</div>
            <code className="mt-1 block break-all font-mono text-emerald-300">
              {data.canonicalPayload}
            </code>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-slate-400">Цифровая подпись SHA-256</div>
            <code className="mt-1 block break-all font-mono text-slate-200">
              {data.recomputedHash}
            </code>
          </div>

          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 font-semibold text-emerald-300">
            {data.isAuthentic
              ? 'Подлинность подтверждена: исход и коэффициент не изменялись с момента публикации.'
              : 'Внимание: обнаружено расхождение контрольной суммы.'}
          </div>
        </div>
      </div>
    </div>
  );
};

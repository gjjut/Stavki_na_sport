'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ShieldCheck, X } from 'lucide-react';

export interface HashVerificationProof {
  predictionId: string;
  matchLabel: string;
  oddsLockedAt: string;
  canonicalPayload: string;
  storedHash: string;
  recomputedHash: string;
  isAuthentic: boolean;
}

export interface Sha256VerifierModalProps {
  proof: HashVerificationProof | null;
  error: string | null;
  onClose: () => void;
}

export const Sha256VerifierModal: React.FC<Sha256VerifierModalProps> = ({
  proof,
  error,
  onClose,
}) => {
  if (!proof && !error) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="text-base font-bold text-white">
              Криптографическая верификация прогноза (SHA-256)
            </h3>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200">
              {error}
            </div>
          ) : (
            proof && (
              <div className="mt-4 space-y-3.5 text-xs">
                <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3.5 text-emerald-200">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>
                      {proof.isAuthentic
                        ? 'Подлинность подтверждена: коэффициент и исход не изменялись после публикации!'
                        : 'Внимание: обнаружено расхождение контрольной суммы!'}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-emerald-300/80">
                    Матч: {proof.matchLabel} · Зафиксировано:{' '}
                    {new Date(proof.oddsLockedAt).toLocaleString('ru-RU')}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">
                    Исходная строка прообраза (Время | Исход | Кэф | Юниты):
                  </div>
                  <pre className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-sky-300">
                    {proof.canonicalPayload}
                  </pre>
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">
                    Хеш до начала матча (в БД):
                  </div>
                  <div className="break-all rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-emerald-400">
                    {proof.storedHash}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">
                    Независимый пересчет SHA-256 (`node:crypto`):
                  </div>
                  <div className="break-all rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-emerald-400">
                    {proof.recomputedHash}
                  </div>
                </div>
              </div>
            )
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-white hover:bg-slate-700"
          >
            Закрыть окно проверки
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

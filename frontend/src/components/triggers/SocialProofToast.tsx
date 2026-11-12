'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';
import { SOCIAL_PROOF_FEED } from '@/data/mockPlatformData';

export const SocialProofToast: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    const initialTimer = window.setTimeout(() => setVisible(true), 2800);
    const cycleTimer = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % SOCIAL_PROOF_FEED.length);
        setVisible(true);
      }, 650);
    }, 9500);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(cycleTimer);
    };
  }, [dismissed]);

  if (dismissed) return null;
  const current = SOCIAL_PROOF_FEED[index];

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 max-w-sm">
      <AnimatePresence>
        {visible && current && (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1 text-xs leading-snug">
              <p className="font-semibold text-white">
                {current.name} из г. {current.city}{' '}
                <span className="font-normal text-slate-300">только что выиграл</span>{' '}
                <span className="font-mono font-bold text-emerald-400">
                  {current.wonRub.toLocaleString('ru-RU')} ₽
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Прогноз на {current.sportLabel} · {current.timeAgo}
              </p>
            </div>

            <button
              type="button"
              aria-label="Скрыть уведомления"
              onClick={() => setDismissed(true)}
              className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

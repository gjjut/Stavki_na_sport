'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';
import type { RecentWinFeedItem } from '@/server/types';

interface SocialProofToastProps {
  items: RecentWinFeedItem[];
}

export const SocialProofToast: React.FC<SocialProofToastProps> = ({ items }) => {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed || !items.length) return;
    const t1 = window.setTimeout(() => setVisible(true), 6000);
    const interval = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % items.length);
        setVisible(true);
      }, 600);
    }, 20000);

    return () => {
      window.clearTimeout(t1);
      window.clearInterval(interval);
    };
  }, [dismissed, items.length]);

  if (dismissed || !items.length) return null;
  const item = items[index % items.length];

  return (
    <AnimatePresence>
      {visible && item && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed bottom-4 left-4 z-40 hidden max-w-xs rounded-2xl border border-slate-800 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur sm:block"
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 rounded-lg bg-emerald-500/15 p-1.5 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="flex-1 text-xs leading-snug">
              <div className="font-semibold text-white">Зафиксирован плюсовой расчет</div>
              <div className="mt-0.5 text-slate-300">{item.matchTitle}</div>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-slate-500 hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

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
    }, 22000);

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
          className="fixed bottom-5 left-5 z-40 hidden max-w-xs rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl sm:block"
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="flex-1 text-xs leading-snug">
              <div className="font-bold text-slate-900">Плюсовой расчет в архиве</div>
              <div className="mt-0.5 text-slate-500">{item.matchTitle}</div>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

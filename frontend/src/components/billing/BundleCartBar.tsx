'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Layers, Sparkles, Trash2 } from 'lucide-react';
import type { PublicPredictionDto } from '@/server/types';

interface BundleCartBarProps {
  selectedItems: PublicPredictionDto[];
  defaultPriceRub: number;
  bundle2DiscountPct: number;
  bundle3DiscountPct: number;
  onClear: () => void;
  onCheckoutBundle: () => void;
}

export const BundleCartBar: React.FC<BundleCartBarProps> = ({
  selectedItems,
  defaultPriceRub,
  bundle2DiscountPct,
  bundle3DiscountPct,
  onClear,
  onCheckoutBundle,
}) => {
  if (selectedItems.length === 0) return null;

  const subtotal = selectedItems.reduce(
    (acc, p) => acc + (p.singlePriceRub ?? defaultPriceRub),
    0,
  );

  let discountPct = 0;
  if (selectedItems.length >= 3) discountPct = bundle3DiscountPct;
  else if (selectedItems.length === 2) discountPct = bundle2DiscountPct;

  const finalPrice = Math.max(
    50,
    Math.round((subtotal * (100 - discountPct)) / 100),
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        className="fixed bottom-[calc(4.35rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 rounded-2xl border border-white/15 bg-[#0B0F19]/95 px-3.5 py-3 text-white shadow-2xl backdrop-blur-md sm:px-5 md:bottom-5"
      >
        <div className="flex items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 sm:flex">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold">
                <span>Набор: {selectedItems.length} шт.</span>
                {discountPct > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    <Sparkles className="h-3 w-3" />
                    <span>−{discountPct}%</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-blue-300">
                    +1 матч для −{bundle2DiscountPct}%
                  </span>
                )}
              </div>
              <div className="mt-0.5 hidden max-w-xs truncate text-[11px] text-slate-400 sm:block">
                {selectedItems
                  .map((p) => `${p.homeTeam}—${p.awayTeam}`)
                  .join(' · ')}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="text-right leading-tight">
              {discountPct > 0 && (
                <div className="font-mono text-[10px] text-slate-400 line-through">
                  {subtotal.toLocaleString('ru-RU')} ₽
                </div>
              )}
              <div className="font-mono text-base font-black text-white sm:text-lg">
                {finalPrice.toLocaleString('ru-RU')} ₽
              </div>
            </div>

            <button
              type="button"
              onClick={onCheckoutBundle}
              className="rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-600/30 transition hover:bg-blue-500 sm:px-4"
            >
              Оформить
            </button>

            <button
              type="button"
              title="Очистить выбор"
              onClick={onClear}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

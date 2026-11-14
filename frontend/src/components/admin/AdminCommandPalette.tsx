'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import type { OrderTransaction, PredictionRecord } from '@/server/types';
import { searchAdminCommands, type AdminCommandTarget } from '@/lib/admin-command-search';
import type { AdminUser } from './admin-format';

export function AdminCommandPalette({ enabled, users, predictions, transactions, onNavigate }: {
  enabled: boolean;
  users: AdminUser[];
  predictions: PredictionRecord[];
  transactions: OrderTransaction[];
  onNavigate: (target: AdminCommandTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(true);
  const results = useMemo(() => searchAdminCommands(query, { users, predictions, transactions }), [query, users, predictions, transactions]);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (!enabled || event.isComposing || event.repeat || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || (event.key.toLowerCase() !== 'k' && event.code !== 'KeyK')) return;
      // Do not stack a search dialog over a confirmation or editing dialog.
      if (!open && document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      if (!open) {
        restoreFocus.current = true;
        setQuery('');
        setActive(0);
      }
      setOpen((current) => !current);
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [enabled, open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (restoreFocus.current && previous?.isConnected) previous.focus();
    };
  }, [open]);

  useEffect(() => {
    if (open && results.length > 0) {
      document.getElementById(`admin-command-option-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [open, activeIndex, results.length]);

  const show = () => {
    restoreFocus.current = true;
    setQuery('');
    setActive(0);
    setOpen(true);
  };
  const dismiss = () => {
    restoreFocus.current = true;
    setOpen(false);
  };
  const select = (index: number) => {
    const result = results[index];
    if (!result) return;
    restoreFocus.current = false;
    setOpen(false);
    onNavigate(result.target);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (event.key === 'Tab') {
      if (event.shiftKey && document.activeElement === inputRef.current) {
        event.preventDefault();
        closeRef.current?.focus();
      } else if (!event.shiftKey && document.activeElement === closeRef.current) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    } else if (document.activeElement === inputRef.current && !event.nativeEvent.isComposing) {
      if (event.key === 'ArrowDown' && results.length) {
        event.preventDefault();
        setActive((current) => (current + 1) % results.length);
      } else if (event.key === 'ArrowUp' && results.length) {
        event.preventDefault();
        setActive((current) => (current - 1 + results.length) % results.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        select(activeIndex);
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        disabled={!enabled}
        aria-label="Открыть поиск по админ-панели"
        aria-keyshortcuts="Control+K Meta+K"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-50"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Поиск</span>
        <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400 md:inline">Ctrl K / ⌘ K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/55 px-4 pt-[10vh] backdrop-blur-sm" onMouseDown={dismiss}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Поиск по админ-панели"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-blue-600" />
              <input
                ref={inputRef}
                role="combobox"
                aria-label="Поиск разделов, клиентов, событий и заказов"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls="admin-command-results"
                aria-activedescendant={results.length ? `admin-command-option-${activeIndex}` : undefined}
                value={query}
                onChange={(event) => { setQuery(event.target.value); setActive(0); }}
                placeholder="Раздел, клиент, событие или заказ…"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
              />
              <button ref={closeRef} type="button" onClick={dismiss} aria-label="Закрыть поиск" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div id="admin-command-results" role="listbox" aria-label="Результаты поиска" className="max-h-[55vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-slate-500">Ничего не найдено. Измените запрос.</p>
              ) : results.map((result, index) => (
                <button
                  key={result.key}
                  id={`admin-command-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(index)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${index === activeIndex ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold">{result.label}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{result.detail}</span></span>
                  <span className="shrink-0 text-[10px] font-bold text-slate-400">{result.group}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
            <div className="border-t border-slate-100 px-4 py-2.5 text-[10px] font-semibold text-slate-400" aria-live="polite">
              {results.length} результатов · ↑↓ выбор · Enter открыть · Esc закрыть
            </div>
          </div>
        </div>
      )}
    </>
  );
}

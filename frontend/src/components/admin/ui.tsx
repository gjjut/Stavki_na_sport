'use client';

import React, { useEffect, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  XCircle,
} from 'lucide-react';

/* ── Тосты ─────────────────────────────────────────────────────────────── */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md ${
            toast.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50/95 text-emerald-900'
              : toast.kind === 'error'
                ? 'border-rose-200 bg-rose-50/95 text-rose-900'
                : 'border-blue-200 bg-blue-50/95 text-blue-900'
          }`}
        >
          {toast.kind === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : toast.kind === 'error' ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          )}
          <p className="flex-1 text-xs font-semibold leading-relaxed">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 rounded-md p-0.5 opacity-60 hover:opacity-100"
            aria-label="Закрыть уведомление"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Модальное окно ────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    const dialog = dialogRef.current;
    const preferred = dialog?.querySelector<HTMLElement>('[autofocus]') ?? dialog?.querySelector<HTMLElement>(focusableSelector);
    (preferred ?? dialog)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'Tab' && dialog) {
        const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
        if (focusable.length === 0) {
          e.preventDefault();
          dialog.focus();
        } else if (e.shiftKey && (document.activeElement === focusable[0] || !dialog.contains(document.activeElement))) {
          e.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
          e.preventDefault();
          focusable[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      ref={dialogRef}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
    >
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${
          wide ? 'max-w-2xl' : 'max-w-md'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-950">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Подтверждение опасного действия ───────────────────────────────────── */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) onCancel(); }}
      title={title}
      description={description}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-xs leading-relaxed text-slate-600">{description}</p>
    </Modal>
  );
}

/* ── Поля форм ─────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}

export const inputCls =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20';

export const inputMonoCls = `${inputCls} font-mono font-bold`;

/* ── Карточка секции ───────────────────────────────────────────────────── */

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-extrabold text-slate-950">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── Бейджи ────────────────────────────────────────────────────────────── */

export function Badge({
  tone,
  children,
}: {
  tone: 'slate' | 'emerald' | 'amber' | 'rose' | 'blue' | 'indigo';
  children: React.ReactNode;
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    blue: 'bg-blue-50 text-blue-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/* ── Пустое состояние ──────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        {icon}
      </div>
      <p className="mt-3 text-sm font-bold text-slate-700">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>
      )}
    </div>
  );
}

/* ── График выручки (SVG, без зависимостей) ───────────────────────────── */

export interface RevenuePoint {
  label: string;
  value: number;
  orders: number;
}

export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  const width = 640;
  const height = 180;
  const paddingX = 8;
  const paddingTop = 16;
  const paddingBottom = 24;
  const maxValue = Math.max(1, ...points.map((p) => p.value));
  const innerW = width - paddingX * 2;
  const innerH = height - paddingTop - paddingBottom;

  const xFor = (i: number) =>
    points.length <= 1 ? paddingX + innerW / 2 : paddingX + (i / (points.length - 1)) * innerW;
  const yFor = (v: number) => paddingTop + innerH - (v / maxValue) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${xFor(points.length - 1).toFixed(1)},${(paddingTop + innerH).toFixed(1)} L${xFor(0).toFixed(1)},${(paddingTop + innerH).toFixed(1)} Z`;

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <div>
      <div className="flex items-baseline justify-between px-5 pt-4">
        <div className="text-xs font-bold text-slate-500">Продажи прогнозов по дням</div>
        {hovered ? (
          <div className="font-mono text-xs font-black text-slate-950">
            {hovered.label}: {hovered.value.toLocaleString('ru-RU')} ₽ · чеков {hovered.orders}
          </div>
        ) : (
          <div className="font-mono text-xs font-bold text-slate-400">
            Итого: {points.reduce((acc, p) => acc + p.value, 0).toLocaleString('ru-RU')} ₽
          </div>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-1 w-full"
        onMouseLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="График продаж прогнозов за последние дни"
      >
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={paddingX}
            x2={width - paddingX}
            y1={paddingTop + innerH * (1 - f)}
            y2={paddingTop + innerH * (1 - f)}
            stroke="#e2e8f0"
            strokeDasharray="3 4"
          />
        ))}
        <path d={areaPath} fill="url(#revenue-fill)" />
        <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={xFor(i)}
              cy={yFor(p.value)}
              r={hoverIdx === i ? 5 : 3}
              fill={hoverIdx === i ? '#1d4ed8' : '#2563eb'}
              stroke="#fff"
              strokeWidth="1.5"
            />
            <rect
              x={xFor(i) - innerW / points.length / 2}
              y={0}
              width={innerW / points.length}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          </g>
        ))}
        {points.map((p, i) =>
          i % Math.ceil(points.length / 7) === 0 || i === points.length - 1 ? (
            <text
              key={`t-${i}`}
              x={xFor(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-slate-400"
              fontSize="10"
            >
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/* ── Статистика по видам спорта ────────────────────────────────────────── */

export interface SportStatRow {
  sport: string;
  label: string;
  settled: number;
  wins: number;
  losses: number;
  winRatePct: number;
  yieldPct: number;
}

export function SportStats({ rows }: { rows: SportStatRow[] }) {
  const maxSettled = Math.max(1, ...rows.map((r) => r.settled));
  return (
    <div className="space-y-3 px-5 py-4">
      {rows.map((row) => (
        <div key={row.sport}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800">{row.label}</span>
            <span className="font-mono text-[11px] text-slate-500">
              {row.wins}W / {row.losses}L · {row.winRatePct.toFixed(0)}% · yield{' '}
              <span className={row.yieldPct >= 0 ? 'font-bold text-emerald-600' : 'font-bold text-rose-600'}>
                {row.yieldPct >= 0 ? '+' : ''}
                {row.yieldPct.toFixed(1)}%
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
              style={{ width: `${Math.max(3, (row.settled / maxSettled) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Скелетон загрузки ─────────────────────────────────────────────────── */

export function SkeletonLines({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-5 py-5" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-slate-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import type { OrderTransaction, SafeSessionUser } from '@/server/types';

export interface CheckoutModalTarget {
  kind: 'SINGLE_PREDICTION' | 'BALANCE_TOPUP';
  title: string;
  subtitle: string;
  priceRub: number;
  predictionId?: string;
}

interface YooKassaCheckoutModalProps {
  target: CheckoutModalTarget | null;
  viewer: SafeSessionUser | null;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export const YooKassaCheckoutModal: React.FC<YooKassaCheckoutModalProps> = ({
  target,
  viewer,
  onClose,
  onSuccess,
}) => {
  const [method, setMethod] = useState<'yookassa' | 'internal_balance'>('yookassa');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidOrder, setPaidOrder] = useState<OrderTransaction | null>(null);

  if (!target) return null;

  const canUseBalance =
    viewer !== null &&
    target.kind !== 'BALANCE_TOPUP' &&
    viewer.balanceRub >= target.priceRub;

  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: target.kind,
          predictionId: target.predictionId,
          topupAmountRub: target.kind === 'BALANCE_TOPUP' ? target.priceRub : undefined,
          paymentMethod: method,
        }),
      });
      const json = (await res.json()) as {
        order?: OrderTransaction;
        paidImmediately?: boolean;
        error?: string;
      };

      if (!res.ok || !json.order) {
        throw new Error(json.error || 'Не удалось создать заказ');
      }

      if (json.order.confirmationUrl) {
        window.location.href = json.order.confirmationUrl;
        return;
      }

      if (json.paidImmediately) {
        setPaidOrder(json.order);
        await onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка проведения оплаты');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {/* Контрастная шапка модального окна */}
        <div className="flex items-center justify-between bg-[#0B0F19] px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-bold">Разовая покупка события</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPaidOrder(null);
              setError(null);
              onClose();
            }}
            className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Карточка выбранного события */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {target.subtitle}
            </div>
            <div className="mt-0.5 text-base font-extrabold text-slate-950">
              {target.title}
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xs text-slate-500">К оплате без подписок:</span>
              <span className="font-mono text-2xl font-black text-blue-600">
                {target.priceRub.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          </div>

          {!viewer ? (
            <div className="mt-5 space-y-3.5">
              <p className="text-xs leading-relaxed text-slate-600">
                Войдите или создайте аккаунт за 15 секунд — купленный прогноз откроется мгновенно и навсегда сохранится в разделе «Мои покупки».
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <Link
                  href="/login"
                  className="rounded-xl border border-slate-200 bg-white py-3 text-center text-sm font-bold text-slate-800 transition hover:bg-slate-50"
                >
                  Войти
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl bg-blue-600 py-3 text-center text-sm font-bold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700"
                >
                  Регистрация
                </Link>
              </div>
            </div>
          ) : paidOrder ? (
            <div className="mt-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-lg font-extrabold text-slate-950">
                Доступ к событию открыт!
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                Исход, зафиксированный коэффициент и аналитический разбор уже разблокированы на карточке и в разделе «Мои покупки».
              </p>

              <button
                type="button"
                onClick={() => {
                  setPaidOrder(null);
                  onClose();
                }}
                className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                Смотреть открытый прогноз
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setMethod('yookassa')}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                    method === 'yookassa'
                      ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <CreditCard className="h-5 w-5 shrink-0 text-blue-600" />
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      Карта РФ / СБП (ЮKassa)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      МИР, СБП QR, SberPay, T-Pay · Чек 54-ФЗ на {viewer.email}
                    </div>
                  </div>
                </button>

                {target.kind !== 'BALANCE_TOPUP' && (
                  <button
                    type="button"
                    disabled={!canUseBalance}
                    onClick={() => setMethod('internal_balance')}
                    className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition ${
                      method === 'internal_balance'
                        ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                        : 'border-slate-200 bg-white'
                    } ${
                      !canUseBalance
                        ? 'cursor-not-allowed opacity-50'
                        : 'hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Wallet className="h-5 w-5 shrink-0 text-slate-700" />
                      <div>
                        <div className="text-sm font-bold text-slate-900">
                          Списать с кошелька кабинета
                        </div>
                        <div className="text-[11px] text-slate-500">
                          На балансе: {viewer.balanceRub.toLocaleString('ru-RU')} ₽
                        </div>
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-600">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={handlePay}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>
                  {loading
                    ? 'Переход к оплате...'
                    : `Оплатить ${target.priceRub.toLocaleString('ru-RU')} ₽`}
                </span>
              </button>

              <p className="text-center text-[11px] text-slate-400">
                Разовый платеж без автосписаний. Условия{' '}
                <Link href="/legal/offer" className="underline hover:text-slate-600">
                  публичной оферты
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

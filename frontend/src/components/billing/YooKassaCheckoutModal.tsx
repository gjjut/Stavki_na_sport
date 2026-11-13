'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import type { OrderTransaction, PlanCode, SafeSessionUser } from '@/server/types';

export interface CheckoutModalTarget {
  kind: 'SINGLE_PREDICTION' | 'VIP_SUBSCRIPTION' | 'BALANCE_TOPUP';
  title: string;
  subtitle: string;
  priceRub: number;
  predictionId?: string;
  planCode?: PlanCode;
  supportsAutoRenew?: boolean;
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
  const [autoRenew, setAutoRenew] = useState(true);
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
          planCode: target.planCode,
          topupAmountRub: target.kind === 'BALANCE_TOPUP' ? target.priceRub : undefined,
          paymentMethod: method,
          autoRenew: target.supportsAutoRenew ? autoRenew : false,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-bold text-white">Оформление заказа</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPaidOrder(null);
              setError(null);
              onClose();
            }}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Сводка заказа */}
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs text-slate-400">{target.subtitle}</div>
            <div className="mt-0.5 text-base font-bold text-white">{target.title}</div>
            <div className="mt-2 font-mono text-2xl font-extrabold text-emerald-400">
              {target.priceRub.toLocaleString('ru-RU')} ₽
            </div>
          </div>

          {!viewer ? (
            <div className="mt-5 space-y-3">
              <p className="text-sm leading-relaxed text-slate-300">
                Чтобы доступ к прогнозу и ссылка в закрытый VIP-канал сохранились за вами навсегда, войдите в аккаунт или зарегистрируйтесь.
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Link
                  href="/login"
                  className="rounded-xl border border-slate-700 bg-slate-950 py-3 text-center text-sm font-semibold text-white transition hover:border-slate-600"
                >
                  Войти
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl bg-emerald-500 py-3 text-center text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                >
                  Создать аккаунт
                </Link>
              </div>
            </div>
          ) : paidOrder ? (
            <div className="mt-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-lg font-bold text-white">Оплата успешно подтверждена</h4>
              <p className="mt-1 text-xs text-slate-400">
                Доступ открыт мгновенно и сохранен в вашем личном кабинете.
              </p>

              {paidOrder.vipInviteLink && (
                <a
                  href={paidOrder.vipInviteLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-400"
                >
                  <span>Вступить в закрытый VIP-канал Telegram</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}

              <button
                type="button"
                onClick={() => {
                  setPaidOrder(null);
                  onClose();
                }}
                className="mt-3 w-full rounded-xl bg-slate-800 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Перейти к материалам
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setMethod('yookassa')}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition ${
                    method === 'yookassa'
                      ? 'border-emerald-500/60 bg-emerald-500/10'
                      : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                  }`}
                >
                  <CreditCard className="h-5 w-5 text-emerald-400" />
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Банковская карта / СБП (ЮKassa)
                    </div>
                    <div className="text-xs text-slate-400">
                      МИР, СБП QR, SberPay, T-Pay · Чек 54-ФЗ на {viewer.email}
                    </div>
                  </div>
                </button>

                {target.kind !== 'BALANCE_TOPUP' && (
                  <button
                    type="button"
                    disabled={!canUseBalance}
                    onClick={() => setMethod('internal_balance')}
                    className={`flex items-center justify-between rounded-xl border p-3.5 text-left transition ${
                      method === 'internal_balance'
                        ? 'border-emerald-500/60 bg-emerald-500/10'
                        : 'border-slate-800 bg-slate-950'
                    } ${!canUseBalance ? 'cursor-not-allowed opacity-50' : 'hover:border-slate-700'}`}
                  >
                    <div className="flex items-center gap-3">
                      <Wallet className="h-5 w-5 text-amber-400" />
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Списать с баланса кабинета
                        </div>
                        <div className="text-xs text-slate-400">
                          Доступно: {viewer.balanceRub.toLocaleString('ru-RU')} ₽
                        </div>
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {target.supportsAutoRenew && method === 'yookassa' && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoRenew}
                    onChange={(e) => setAutoRenew(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500"
                  />
                  <span>
                    Автоматически продлевать подписку (отменить можно в любой момент в личном кабинете).
                  </span>
                </label>
              )}

              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={handlePay}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>
                  {loading
                    ? 'Подготовка оплаты...'
                    : `Оплатить ${target.priceRub.toLocaleString('ru-RU')} ₽`}
                </span>
              </button>

              <p className="text-center text-[11px] text-slate-500">
                Нажимая кнопку оплаты, вы соглашаетесь с условиями{' '}
                <Link href="/legal/offer" className="underline hover:text-slate-300">
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

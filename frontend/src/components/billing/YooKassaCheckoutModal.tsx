'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Lock,
  Mail,
  QrCode,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';

export interface CheckoutTarget {
  kind: 'SINGLE_PREDICTION' | 'VIP_SUBSCRIPTION';
  predictionId?: string;
  planCode?: 'VIP_7D' | 'VIP_30D' | 'VIP_LIFETIME';
  title: string;
  amountRub: number;
  supportsAutoRenew: boolean;
}

export interface YooKassaCheckoutModalProps {
  target: CheckoutTarget | null;
  viewerBalanceRub: number;
  defaultEmail: string;
  onClose: () => void;
  onServerStateSynced: (nextBootstrapState: unknown) => void;
}

export const YooKassaCheckoutModal: React.FC<YooKassaCheckoutModalProps> = ({
  target,
  viewerBalanceRub,
  defaultEmail,
  onClose,
  onServerStateSynced,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<'sbp' | 'bank_card' | 'internal_balance'>(
    'sbp',
  );
  const [receiptEmail, setReceiptEmail] = useState(defaultEmail || 'bettor@example.ru');
  const [autoRenew, setAutoRenew] = useState(true);
  const [step, setStep] = useState<'FORM' | 'PROCESSING' | 'SUCCESS'>('FORM');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [issuedVipInvite, setIssuedVipInvite] = useState<string | null>(null);
  const [yookassaId, setYookassaId] = useState<string | null>(null);

  if (!target) return null;

  const canUseBalance = viewerBalanceRub >= target.amountRub;

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText(null);
    setStep('PROCESSING');

    try {
      // 1. Создаем платеж через реальный серверный API (/api/v1/billing/checkout)
      const checkoutRes = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: target.kind,
          predictionId: target.predictionId,
          planCode: target.planCode,
          receiptEmail,
          paymentMethod,
          autoRenew: target.supportsAutoRenew ? autoRenew : false,
        }),
      });

      const checkoutData = await checkoutRes.json();
      if (!checkoutRes.ok) {
        throw new Error(checkoutData.error || 'Ошибка создания платежа');
      }

      const paymentId: string = checkoutData.transaction.yookassaPaymentId;
      setYookassaId(paymentId);

      // 2. Отправляем серверный Webhook `payment.succeeded` (/api/v1/webhooks/yookassa)
      const webhookRes = await fetch('/api/v1/webhooks/yookassa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'notification',
          event: 'payment.succeeded',
          object: { id: paymentId },
        }),
      });

      const webhookData = await webhookRes.json();
      if (!webhookRes.ok) {
        throw new Error(webhookData.error || 'Ошибка подтверждения Webhook ЮKassa');
      }

      setIssuedVipInvite(webhookData.transaction?.vipInviteLink ?? null);
      onServerStateSynced(webhookData.state);
      setStep('SUCCESS');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Ошибка проведения оплаты');
      setStep('FORM');
    }
  };

  const resetAndClose = () => {
    setStep('FORM');
    setErrorText(null);
    setIssuedVipInvite(null);
    setYookassaId(null);
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl"
        >
          <button
            type="button"
            onClick={resetAndClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>

          {step === 'FORM' && (
            <form onSubmit={handlePay} className="space-y-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
                  <Lock className="h-3 w-3" />
                  <span>Шлюз ЮKassa API v3 · Чеки 54-ФЗ</span>
                </div>
                <h3 className="mt-2 text-lg font-bold text-white">{target.title}</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Доступ и одноразовый TG-инвайт выдаются автоматически по Webhook `payment.succeeded`
                </p>
              </div>

              {errorText && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 p-3 text-xs text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{errorText}</span>
                </div>
              )}

              <div className="flex items-baseline justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <span className="text-xs text-slate-400">Сумма к оплате:</span>
                <span className="font-mono text-2xl font-extrabold text-emerald-400">
                  {target.amountRub.toLocaleString('ru-RU')} ₽
                </span>
              </div>

              {/* Способы оплаты: СБП, Карта РФ или Внутренний баланс */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('sbp')}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-[11px] font-semibold transition ${
                    paymentMethod === 'sbp'
                      ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                      : 'border-slate-800 bg-slate-950 text-slate-300'
                  }`}
                >
                  <QrCode className="h-4 w-4" />
                  <span>СБП (QR)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank_card')}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-[11px] font-semibold transition ${
                    paymentMethod === 'bank_card'
                      ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                      : 'border-slate-800 bg-slate-950 text-slate-300'
                  }`}
                >
                  <CreditCard className="h-4 w-4" />
                  <span>Карта РФ</span>
                </button>

                <button
                  type="button"
                  disabled={!canUseBalance}
                  onClick={() => setPaymentMethod('internal_balance')}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    paymentMethod === 'internal_balance'
                      ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200'
                      : 'border-slate-800 bg-slate-950 text-slate-300'
                  }`}
                >
                  <Wallet className="h-4 w-4" />
                  <span>Депозит ({viewerBalanceRub} ₽)</span>
                </button>
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span>E-mail для отправки фискального чека (54-ФЗ)</span>
                </label>
                <input
                  type="email"
                  required
                  value={receiptEmail}
                  onChange={(e) => setReceiptEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none"
                />
              </div>

              {target.supportsAutoRenew && paymentMethod !== 'internal_balance' && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoRenew}
                    onChange={(e) => setAutoRenew(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500"
                  />
                  <span>
                    Включить рекуррентное автопродление (`save_payment_method: true`). Отмена в 1 клик в личном кабинете.
                  </span>
                </label>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 py-3 text-sm font-extrabold text-slate-950 shadow-[0_0_24px_rgba(16,185,129,0.35)] transition hover:brightness-110"
              >
                Оплатить {target.amountRub.toLocaleString('ru-RU')} ₽
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Чек ОФД: «Доступ к информационно-аналитическому материалу»</span>
              </div>
            </form>
          )}

          {step === 'PROCESSING' && (
            <div className="py-10 text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
              <p className="mt-4 text-sm font-bold text-white">
                Проведение транзакции и обработка Webhook ЮKassa...
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Проверка идемпотентности · Регистрация чека 54-ФЗ · Разблокировка на сервере
              </p>
            </div>
          )}

          {step === 'SUCCESS' && (
            <div className="space-y-4 py-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Платеж успешно проведен!</h3>
                <p className="mt-1 text-xs text-slate-300">
                  Чек зарегистрирован для <span className="font-semibold">{receiptEmail}</span>
                  {yookassaId && (
                    <span className="block font-mono text-[10px] text-slate-500">
                      YooKassa ID: {yookassaId}
                    </span>
                  )}
                </p>
              </div>

              {issuedVipInvite && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-left text-xs">
                  <div className="font-bold text-sky-300">
                    Одноразовая ссылка в закрытый VIP Telegram (`member_limit = 1`):
                  </div>
                  <div className="mt-1.5 flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2 font-mono text-emerald-300">
                    <span className="truncate">{issuedVipInvite}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={resetAndClose}
                className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400"
              >
                Перейти к разблокированным прогнозам
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

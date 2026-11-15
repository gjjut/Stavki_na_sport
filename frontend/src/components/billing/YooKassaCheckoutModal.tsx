'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Tag,
  Wallet,
  X,
} from 'lucide-react';
import { trackMetrikaGoal } from '@/lib/metrika';
import { LEGAL_DOCUMENT_VERSION } from '@/lib/legal-version';
import { isBrowserSessionConfirmed } from '@/lib/client-session';
import { isEmbeddedBrowser, openTelegramExternalLink } from '@/lib/embedded-browser';
import type { CustomerOrder, SafeSessionUser } from '@/server/types';

export interface CheckoutModalTarget {
  kind: 'SINGLE_PREDICTION' | 'BUNDLE_PREDICTIONS' | 'BALANCE_TOPUP';
  title: string;
  subtitle: string;
  priceRub: number;
  originalPriceRub?: number;
  predictionId?: string;
  predictionIds?: string[];
}

interface YooKassaCheckoutModalProps {
  target: CheckoutModalTarget | null;
  viewer: SafeSessionUser | null;
  paymentMode?: 'TEST_INSTANT' | 'YOOKASSA_LIVE';
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export const YooKassaCheckoutModal: React.FC<YooKassaCheckoutModalProps> = ({
  target,
  viewer,
  paymentMode,
  onClose,
  onSuccess,
}) => {
  const [method, setMethod] = useState<'yookassa' | 'internal_balance'>('yookassa');
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    finalAmountRub: number;
    discountRub: number;
    subtotalRub: number;
  } | null>(null);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const promoRequest = useRef(0);

  const [guestEmail, setGuestEmail] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [guestPassword, setGuestPassword] = useState('');
  const [autoCreatedCreds, setAutoCreatedCreds] = useState<{
    email: string;
    generatedPassword: string;
  } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [credentialsWarning, setCredentialsWarning] = useState(false);
  const credentialsRef = useRef<HTMLDivElement | null>(null);
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [personalDataConsent, setPersonalDataConsent] = useState(false);

  const [loading, setLoading] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidOrder, setPaidOrder] = useState<CustomerOrder | null>(null);
  const [checkoutSessionUnconfirmed, setCheckoutSessionUnconfirmed] = useState(false);
  const [pendingConfirmationUrl, setPendingConfirmationUrl] = useState<string | null>(null);
  const [openPaymentOutside, setOpenPaymentOutside] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    promoRequest.current += 1;
    setMethod('yookassa');
    setPromoInput('');
    setAppliedPromo(null);
    setPromoMessage(null);
    setPromoBusy(false);
    setOutcomeUnknown(false);
    setError(null);
    setPaidOrder(null);
    setCheckoutSessionUnconfirmed(false);
    setPendingConfirmationUrl(null);
    setOpenPaymentOutside(false);
    setCopyError(false);
    setNeedPassword(false);
    setGuestPassword('');
    setAutoCreatedCreds(null);
    setCredentialsSaved(false);
    setCredentialsWarning(false);
    setCopiedPass(false);
    setOfferAccepted(false);
    setRulesAccepted(false);
    setPersonalDataConsent(false);
    if (target) {
      trackMetrikaGoal('open_checkout', { kind: target.kind, price: target.priceRub });
    }
  }, [target]);

  const confirmCredentialsSaved = useCallback(() => {
    if (autoCreatedCreds && !credentialsSaved) {
      setCredentialsWarning(true);
      credentialsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }, [autoCreatedCreds, credentialsSaved]);

  const requestClose = useCallback(() => {
    if (loading || !confirmCredentialsSaved()) return;
    // A cancelled live checkout must not leave this password in the tab. Do not
    // remove credentials belonging to a different in-progress checkout.
    if (autoCreatedCreds) {
      try {
        const raw = sessionStorage.getItem('valuex_new_credentials');
        const stored = raw ? JSON.parse(raw) : null;
        if (stored?.email === autoCreatedCreds.email && stored?.generatedPassword === autoCreatedCreds.generatedPassword) {
          sessionStorage.removeItem('valuex_new_credentials');
        }
      } catch { /* storage may be unavailable */ }
    }
    onClose();
  }, [loading, confirmCredentialsSaved, autoCreatedCreds, onClose]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, requestClose]);

  useEffect(() => {
    if (!target || !autoCreatedCreds || credentialsSaved) return;
    // Browsers may ignore this warning, especially on mobile; the visible
    // confirmation remains the primary protection against accidental loss.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [target, autoCreatedCreds, credentialsSaved]);

  if (!target) return null;

  const effectivePriceRub = appliedPromo ? appliedPromo.finalAmountRub : target.priceRub;
  const effectiveOldPriceRub = appliedPromo
    ? appliedPromo.subtotalRub
    : target.originalPriceRub;

  const canUseBalance =
    viewer !== null &&
    target.kind !== 'BALANCE_TOPUP' &&
    viewer.balanceRub >= effectivePriceRub;
  const promoNeedsConfirmation = target.kind !== 'BALANCE_TOPUP' && Boolean(promoInput.trim()) &&
    (!appliedPromo || promoInput.trim().toUpperCase() !== appliedPromo.code.toUpperCase());

  const handleApplyPromo = async () => {
    if (!promoInput.trim() || promoBusy || loading) return;
    const request = ++promoRequest.current;
    setPromoBusy(true);
    setPromoMessage(null);
    const ids =
      target.predictionIds && target.predictionIds.length
        ? target.predictionIds
        : target.predictionId
          ? [target.predictionId]
          : [];

    try {
      const res = await fetch('/api/v1/billing/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictionIds: ids, promoCode: promoInput.trim() }),
      });
      const json = await res.json();
      if (request !== promoRequest.current) return;
      if (!res.ok) throw new Error(json.error || 'Промокод не найден');
      setAppliedPromo({
        code: json.pricing.promoValidCode,
        finalAmountRub: json.pricing.finalAmountRub,
        discountRub: json.pricing.discountRub,
        subtotalRub: json.pricing.subtotalRub,
      });
      setPromoMessage(`Промокод ${json.pricing.promoValidCode} активирован!`);
    } catch (err) {
      if (request !== promoRequest.current) return;
      setAppliedPromo(null);
      setPromoMessage(err instanceof Error ? err.message : 'Не удалось проверить промокод. Попробуйте позже.');
    } finally {
      if (request === promoRequest.current) setPromoBusy(false);
    }
  };

  const handlePay = async () => {
    if (loading || promoBusy || outcomeUnknown || promoNeedsConfirmation || (method === 'internal_balance' && !canUseBalance)) return;
    if (!confirmCredentialsSaved()) return;
    if (!paymentMode) {
      setError('Не удалось получить режим оплаты. Обновите страницу и проверьте условия заказа.');
      return;
    }
    if (!viewer && (!guestEmail.trim() || !guestEmail.includes('@'))) {
      setError(
        'Введите действующий E-mail для кабинета и получения чека при реальной оплате',
      );
      return;
    }

    if (!offerAccepted || (!viewer && (!rulesAccepted || !personalDataConsent))) {
      setError('Подтвердите условия заказа и необходимые согласия.');
      return;
    }
    const outside = isEmbeddedBrowser();
    setOpenPaymentOutside(outside);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          kind: target.kind,
          predictionId: target.predictionId,
          predictionIds: target.predictionIds,
          promoCode: appliedPromo?.code || undefined,
          topupAmountRub: target.kind === 'BALANCE_TOPUP' ? target.priceRub : undefined,
          paymentMethod: viewer ? method : 'yookassa',
          expectedAmountRub: effectivePriceRub,
          expectedPaymentMode: paymentMode,
          guestEmail: !viewer ? guestEmail.trim() : undefined,
          guestPassword: !viewer && needPassword ? guestPassword : undefined,
          offerAccepted,
          rulesAccepted: !viewer ? rulesAccepted : undefined,
          personalDataConsent: !viewer ? personalDataConsent : undefined,
          legalVersion: LEGAL_DOCUMENT_VERSION,
        }),
      }).catch(() => {
        setOutcomeUnknown(true);
        throw new Error('Нет подтверждения от сервера. Не повторяйте оплату: сначала проверьте заказ в кабинете или обратитесь в поддержку.');
      });
      const json = (await res.json().catch(() => {
        setOutcomeUnknown(true);
        throw new Error('Ответ сервера неполный. Не повторяйте оплату до проверки заказа в кабинете или через поддержку.');
      })) as {
        order?: CustomerOrder;
        paidImmediately?: boolean;
        viewer?: { id?: string };
        autoCreatedAccount?: { email: string; generatedPassword: string } | null;
        code?: string;
        error?: string;
      };

      if (res.status === 409 && json.code === 'EMAIL_EXISTS_NEED_PASSWORD') {
        setNeedPassword(true);
        setError(json.error || 'Введите пароль от существующего кабинета');
        return;
      }

      if (json.autoCreatedAccount) {
        setAutoCreatedCreds(json.autoCreatedAccount);
        setCredentialsSaved(false);
        setCredentialsWarning(false);
      }
      if (!res.ok || !json.order) {
        if (res.status >= 500 || !json.error || /до повтор|перед повтор|ожидающий заказ/i.test(json.error)) {
          setOutcomeUnknown(true);
          throw new Error(`${json.error || 'Нет подтверждения заказа.'} Проверьте заказ в кабинете или обратитесь в поддержку до повторной оплаты.`);
        }
        throw new Error(json.error);
      }

      // An early webhook can already have completed an order; never send the
      // buyer back to a stale confirmation link in that case.
      if (json.paidImmediately === true) {
        // A guest order can succeed while an iframe blocks its session cookie.
        // Confirm the actual account before promising that the card is accessible here.
        if (!viewer) setCheckoutSessionUnconfirmed(!(await isBrowserSessionConfirmed(json.viewer?.id)));
        trackMetrikaGoal('purchase_success', {
          amount: json.order.amountRub,
          kind: json.order.kind,
        });
        setPaidOrder(json.order);
        try {
          await onSuccess();
        } catch {
          setError('Заказ выполнен, но данные страницы не обновились. Откройте кабинет или обновите страницу; не оплачивайте повторно.');
        }
        return;
      }

      if (json.paidImmediately === false && json.order.confirmationUrl) {
        const credentials = json.autoCreatedAccount || autoCreatedCreds;
        if (credentials) {
          try {
            // Only a live payment redirect needs a short-lived copy for the
            // return page. Instant or failed checkouts keep it in memory only.
            sessionStorage.setItem('valuex_new_credentials', JSON.stringify(credentials));
          } catch { /* the owner can still save it from this dialog */ }
        }
        if (credentials || outside) {
          // Preserve one-time credentials and require a fresh click for Telegram's
          // external browser; a payment provider may forbid iframe embedding.
          setOpenPaymentOutside(outside);
          setPendingConfirmationUrl(json.order.confirmationUrl);
        } else {
          window.location.href = json.order.confirmationUrl;
        }
        return;
      }

      setOutcomeUnknown(true);
      throw new Error('Заказ получен без подтверждения оплаты или ссылки. Проверьте его в кабинете или обратитесь в поддержку до повторной оплаты.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка проведения оплаты');
    } finally {
      setLoading(false);
    }
  };

  const credentialsCard = autoCreatedCreds && (
    <div ref={credentialsRef} className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 text-left text-xs">
      <div className="font-extrabold text-slate-900">Сохраните данные нового кабинета и никому не сообщайте пароль:</div>
      <p className="mt-1 leading-relaxed text-slate-700">Пароль показан один раз. После закрытия окна, обновления страницы или перехода в другой браузер данные могут стать недоступны.</p>
      <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2">
        <div className="min-w-0 break-all">
          <div className="text-[11px] text-slate-500">Логин: <strong className="text-slate-900">{autoCreatedCreds.email}</strong></div>
          <div className="text-[11px] text-slate-500">Пароль: <strong className="font-mono text-blue-700">{autoCreatedCreds.generatedPassword}</strong></div>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(`Логин: ${autoCreatedCreds.email}\nПароль: ${autoCreatedCreds.generatedPassword}`);
              setCopyError(false);
              setCopiedPass(true);
              window.setTimeout(() => setCopiedPass(false), 2000);
            } catch {
              setCopyError(true);
            }
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800"
        >
          {copiedPass ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copiedPass ? 'Скопировано' : 'Скопировать'}</span>
        </button>
      </div>
      {copyError && <p role="status" className="mt-2 text-slate-700">Не удалось скопировать. Выделите данные и сохраните их вручную.</p>}
      <label className="mt-3 flex items-start gap-2 font-semibold leading-relaxed text-slate-800">
        <input
          type="checkbox"
          checked={credentialsSaved}
          onChange={(event) => {
            setCredentialsSaved(event.target.checked);
            if (event.target.checked) setCredentialsWarning(false);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
        />
        <span>Я сохранил(а) логин и пароль для входа.</span>
      </label>
      {credentialsWarning && <p role="alert" className="mt-2 font-semibold text-rose-700">Сохраните данные и отметьте подтверждение, прежде чем закрыть окно или перейти дальше.</p>}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Оформление заказа"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between bg-[#0B0F19] px-5 py-4 text-white sm:px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-bold">
              {target.kind === 'BUNDLE_PREDICTIONS'
                ? 'Покупка набора со скидкой'
                : target.kind === 'BALANCE_TOPUP'
                  ? 'Пополнение кошелька'
                  : 'Быстрая покупка прогноза'}
            </span>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть окно оплаты"
            disabled={loading}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="line-clamp-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {target.subtitle}
            </div>
            <div className="mt-0.5 text-base font-extrabold text-slate-950">
              {target.title}
            </div>
            <div className="mt-2.5 flex items-baseline justify-between">
              <span className="text-xs text-slate-500">Сумма к оплате:</span>
              <div className="flex items-baseline gap-2">
                {effectiveOldPriceRub && effectiveOldPriceRub > effectivePriceRub && (
                  <span className="font-mono text-xs text-slate-400 line-through">
                    {effectiveOldPriceRub.toLocaleString('ru-RU')} ₽
                  </span>
                )}
                <span className="font-mono text-2xl font-black text-blue-600">
                  {effectivePriceRub.toLocaleString('ru-RU')} ₽
                </span>
              </div>
            </div>
          </div>

          {pendingConfirmationUrl ? (
            <div className="mt-5 text-center">
              <h4 className="text-lg font-extrabold text-slate-950">{autoCreatedCreds ? 'Кабинет создан' : 'Заказ создан'}</h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{autoCreatedCreds ? 'Сохраните данные входа до перехода к ЮKassa. ' : ''}Заказ ещё не оплачен; доступ откроется после подтверждения оплаты.</p>
              {credentialsCard}
              {openPaymentOutside && <p className="mt-3 text-xs text-slate-600">Оплата откроется вне приложения. После возврата может потребоваться войти в тот же кабинет.</p>}
              {autoCreatedCreds && !credentialsSaved ? (
                <button type="button" onClick={confirmCredentialsSaved} className="mt-5 w-full rounded-xl bg-slate-500 py-3 text-sm font-bold text-white">
                  Перейти к оплате
                </button>
              ) : (
                <a
                  href={pendingConfirmationUrl}
                  target={openPaymentOutside ? '_blank' : undefined}
                  rel={openPaymentOutside ? 'noopener noreferrer' : undefined}
                  onClick={(event) => {
                    if (openPaymentOutside && openTelegramExternalLink(pendingConfirmationUrl)) event.preventDefault();
                  }}
                  className="mt-5 inline-block w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700"
                >
                  Перейти к оплате
                </a>
              )}
            </div>
          ) : paidOrder ? (
            <div className="mt-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-lg font-extrabold text-slate-950">
                {checkoutSessionUnconfirmed ? 'Заказ выполнен в кабинете' : paidOrder.kind === 'BALANCE_TOPUP' ? 'Баланс пополнен' : 'Доступ успешно открыт'}
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                {checkoutSessionUnconfirmed
                  ? 'Заказ выполнен, но вход в этом окне не подтверждён. Не оплачивайте повторно: сохраните данные кабинета и войдите в него через обычный браузер.'
                  : paidOrder.kind === 'BALANCE_TOPUP' ? 'Начисление отображается в кабинете.' : 'Исход, коэффициент и опубликованный разбор доступны на карточке матча и в разделе «Мои прогнозы».'}
              </p>
              {paidOrder.paymentModeAtCreation === 'TEST_INSTANT' && paidOrder.paymentMethod === 'yookassa' && <p role="status" className="mt-2 text-xs font-semibold text-amber-800">Это тестовая операция: реального списания и чека нет.</p>}
              {error && <p role="status" className="mt-2 text-xs font-semibold text-amber-800">{error}</p>}
              {openPaymentOutside && !checkoutSessionUnconfirmed && <p className="mt-2 text-xs text-slate-600">Если кабинет не открывается в приложении, откройте сайт в браузере и войдите в тот же аккаунт.</p>}

              {credentialsCard}
              {checkoutSessionUnconfirmed && (
                <a href="/login" target="_blank" rel="noopener noreferrer"
                  onClick={(event) => {
                    if (!confirmCredentialsSaved() || openTelegramExternalLink('/login')) event.preventDefault();
                  }}
                  className="mt-4 inline-block text-xs font-bold text-blue-700 underline">
                  Открыть сайт для входа
                </a>
              )}

              <button
                type="button"
                onClick={requestClose}
                disabled={loading}
                className="mt-5 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {checkoutSessionUnconfirmed || paidOrder.kind === 'BALANCE_TOPUP' ? 'Закрыть' : 'Смотреть открытый прогноз'}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3.5">
              {!viewer && (
                <div className="space-y-2.5 rounded-2xl border border-blue-100 bg-blue-50/40 p-3.5">
                  <div>
                    <label htmlFor="checkout-email" className="block text-[11px] font-bold text-slate-700">
                      Ваш E-mail для кабинета и чека при реальной оплате:
                    </label>
                    <div className="relative mt-1">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        id="checkout-email"
                        autoComplete="email"
                        maxLength={254}
                        required
                        value={guestEmail}
                        onChange={(e) => {
                          setGuestEmail(e.target.value);
                          if (needPassword) setNeedPassword(false);
                        }}
                        placeholder="name@mail.ru"
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  {needPassword && (
                    <div>
                      <div className="flex items-center justify-between">
                        <label htmlFor="checkout-password" className="block text-[11px] font-bold text-slate-700">
                          Пароль от вашего кабинета:
                        </label>
                        <Link
                          href="/forgot-password"
                          className="text-[11px] font-bold text-blue-600 hover:underline"
                        >
                          Забыли пароль?
                        </Link>
                      </div>
                      <div className="relative mt-1">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="password"
                          id="checkout-password"
                          autoComplete="current-password"
                          maxLength={256}
                          required
                          value={guestPassword}
                          onChange={(e) => setGuestPassword(e.target.value)}
                          placeholder="Введите ваш пароль..."
                          className="w-full rounded-xl border border-blue-300 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {!needPassword && (
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Без анкет — прогноз откроется сразу</span>
                      <button
                        type="button"
                        onClick={() => setNeedPassword(true)}
                        className="font-bold text-blue-600 hover:underline"
                      >
                        Уже есть аккаунт?
                      </button>
                    </div>
                  )}
                </div>
              )}

              {target.kind !== 'BALANCE_TOPUP' && (
                <div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={promoInput}
                        onChange={(e) => {
                          promoRequest.current += 1;
                          setPromoInput(e.target.value.toUpperCase());
                          setAppliedPromo(null);
                          setPromoMessage(null);
                          setPromoBusy(false);
                        }}
                        maxLength={24}
                        placeholder="Промокод (напр. START15)"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 font-mono text-xs font-bold uppercase text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:normal-case placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyPromo}
                      disabled={promoBusy || loading || outcomeUnknown}
                      className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
                    >
                      {promoBusy ? 'Проверяем…' : 'Применить'}
                    </button>
                  </div>
                  {promoMessage && (
                    <div
                      className={`mt-1.5 text-[11px] font-semibold ${
                        appliedPromo ? 'text-emerald-600' : 'text-rose-500'
                      }`}
                    >
                      {promoMessage}
                    </div>
                  )}
                  {promoNeedsConfirmation && !promoBusy && <p className="mt-1 text-[11px] text-slate-600">Проверьте промокод кнопкой «Применить» или очистите поле.</p>}
                </div>
              )}

              {paymentMode === 'TEST_INSTANT' && (
                <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                  Включён тестовый режим: деньги не списываются, реальный платёж и кассовый чек не создаются.
                </div>
              )}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setMethod('yookassa')}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition ${
                    method === 'yookassa' || !viewer
                      ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <CreditCard className="h-5 w-5 shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900">
                      {paymentMode === 'TEST_INSTANT' ? 'Тестовая оплата' : 'Карта РФ / СБП (ЮKassa)'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {paymentMode === 'TEST_INSTANT' ? 'Без списания средств' : 'Доступные способы оплаты покажет ЮKassa'}
                    </div>
                  </div>
                </button>

                {viewer && target.kind !== 'BALANCE_TOPUP' && (
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
                          Доступно: {viewer.balanceRub.toLocaleString('ru-RU')} ₽
                        </div>
                      </div>
                    </div>
                  </button>
                )}
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                  <input type="checkbox" checked={offerAccepted} onChange={(e) => setOfferAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                  <span>Принимаю <Link href="/legal/offer" target="_blank" className="font-semibold text-blue-700 underline">условия оферты</Link> для этого заказа.</span>
                </label>
                {!viewer && <>
                  <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                    <input type="checkbox" checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                    <span>Мне исполнилось 18 лет, принимаю <Link href="/legal/rules" target="_blank" className="font-semibold text-blue-700 underline">правила сайта</Link>.</span>
                  </label>
                  <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                    <input type="checkbox" checked={personalDataConsent} onChange={(e) => setPersonalDataConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                    <span>Даю отдельное <Link href="/legal/consent" target="_blank" className="font-semibold text-blue-700 underline">согласие на обработку персональных данных</Link> для оформления заказа и кабинета.</span>
                  </label>
                </>}
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-600">
                  {error}
                </div>
              )}
              {error && autoCreatedCreds && (
                <div>
                  <p className="text-xs font-semibold text-slate-800">{outcomeUnknown ? 'Кабинет создан; статус заказа нужно проверить.' : 'Кабинет создан, хотя заказ не оформлен.'}</p>
                  {credentialsCard}
                </div>
              )}
              {outcomeUnknown && <Link href="/cabinet" onClick={(event) => { if (!confirmCredentialsSaved()) event.preventDefault(); }} className="block text-center text-xs font-bold text-blue-700 underline">Проверить заказы в кабинете</Link>}
              {!paymentMode && <p role="status" className="text-xs text-amber-800">Режим оплаты недоступен. Обновите страницу.</p>}
              {method === 'internal_balance' && !canUseBalance && <p role="status" className="text-xs text-amber-800">Для этой суммы недостаточно средств на балансе. Выберите другой способ оплаты.</p>}

              <button
                type="button"
                disabled={loading || promoBusy || outcomeUnknown || !paymentMode || promoNeedsConfirmation || (method === 'internal_balance' && !canUseBalance)}
                onClick={handlePay}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>
                  {loading
                    ? 'Переход к оплате...'
                    : `Оплатить ${effectivePriceRub.toLocaleString('ru-RU')} ₽`}
                </span>
              </button>

              <p className="pb-1 text-center text-[11px] text-slate-400">
                Разовый платеж без подписок и автосписаний. Условия{' '}
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

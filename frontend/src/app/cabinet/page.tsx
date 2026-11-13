'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRightLeft,
  Banknote,
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  PlusCircle,
  Receipt,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { PredictionCard } from '@/components/predictions/PredictionCard';
import { HashVerifyModal } from '@/components/predictions/HashVerifyModal';
import {
  YooKassaCheckoutModal,
  type CheckoutModalTarget,
} from '@/components/billing/YooKassaCheckoutModal';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type {
  AffiliateLinkRecord,
  OrderTransaction,
  PayoutRequestRecord,
  PublicPredictionDto,
  SafeSessionUser,
} from '@/server/types';

interface CabinetPayload {
  user: SafeSessionUser;
  telegramBotUsername?: string;
  telegramBotConfigured?: boolean;
  purchasedPredictions: PublicPredictionDto[];
  orders: OrderTransaction[];
  affiliateLinks: AffiliateLinkRecord[];
  payouts: PayoutRequestRecord[];
}

export default function CabinetPage() {
  const router = useRouter();
  const { data: pub, reload: reloadPublic } = usePublicPlatform();
  const [cabinet, setCabinet] = useState<CabinetPayload | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [hashItem, setHashItem] = useState<PublicPredictionDto | null>(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Модальное окно вывода партнерского дохода
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'SBP' | 'CARD'>('SBP');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutRequisites, setPayoutRequisites] = useState('');
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutBusy, setPayoutBusy] = useState(false);

  // Модальное окно настроек профиля и смены пароля
  const [profileOpen, setProfileOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTelegram, setEditTelegram] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);

  const handleTelegramAction = async (
    action: 'VERIFY_TELEGRAM_LINK' | 'UNLINK_TELEGRAM' | 'TEST_TELEGRAM_DM',
  ) => {
    setTgBusy(true);
    try {
      const res = await fetch('/api/v1/cabinet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(json.error || 'Не удалось выполнить операцию Telegram');
        return;
      }
      if (action === 'VERIFY_TELEGRAM_LINK') {
        showToast('Telegram успешно подключен! Проверьте личные сообщения в боте.');
      } else if (action === 'TEST_TELEGRAM_DM') {
        showToast('Тестовое уведомление отправлено в ваш Telegram!');
      } else {
        showToast('Уведомления в Telegram отключены');
      }
      await loadAll();
    } finally {
      setTgBusy(false);
    }
  };

  const showToast = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 3500);
  };

  const loadCabinet = useCallback(async () => {
    const cabRes = await fetch('/api/v1/cabinet', { cache: 'no-store' });
    if (cabRes.status === 401) {
      router.push('/login');
      return;
    }
    if (cabRes.ok) {
      const cabJson = (await cabRes.json()) as CabinetPayload;
      setCabinet(cabJson);
      setEditName(cabJson.user.displayName);
      setEditTelegram(cabJson.user.telegramUsername || '');
    }
  }, [router]);

  useEffect(() => {
    void loadCabinet();
  }, [loadCabinet]);

  const loadAll = async () => {
    await Promise.all([reloadPublic(), loadCabinet()]);
  };

  const purchasedPredictions = cabinet?.purchasedPredictions ?? [];
  const affBalance = cabinet?.user.affiliateBalanceRub ?? 0;
  const totalClicks = (cabinet?.affiliateLinks ?? []).reduce((a, l) => a + l.clicks, 0);
  const totalBuyers = (cabinet?.affiliateLinks ?? []).reduce((a, l) => a + l.buyers, 0);

  const copyPartnerLink = async () => {
    if (!cabinet?.user.referralCode) return;
    const url = `${window.location.origin}/?ref=${cabinet.user.referralCode}`;
    await navigator.clipboard.writeText(url);
    setCopiedRef(true);
    window.setTimeout(() => setCopiedRef(false), 2000);
  };

  const handleTransferPartnerToWallet = async () => {
    setPayoutBusy(true);
    try {
      const res = await fetch('/api/v1/affiliate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CONVERT_TO_BALANCE' }),
      });
      const json = (await res.json()) as { transferredRub?: number; error?: string };
      if (!res.ok) throw new Error(json.error || 'Не удалось выполнить перевод');
      showToast(
        `Переведено ${json.transferredRub?.toLocaleString('ru-RU')} ₽ на ваш основной баланс сайта!`,
      );
      await loadAll();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Ошибка перевода');
    } finally {
      setPayoutBusy(false);
    }
  };

  const handleSubmitPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayoutBusy(true);
    setPayoutError(null);
    try {
      const res = await fetch('/api/v1/affiliate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REQUEST_PAYOUT',
          amountRub: Number(payoutAmount),
          method: payoutMethod,
          requisites: payoutRequisites,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Ошибка создания заявки');
      setPayoutOpen(false);
      setPayoutAmount('');
      setPayoutRequisites('');
      showToast('Заявка на вывод создана! Выплата поступит после проверки реквизитов.');
      await loadAll();
    } catch (err) {
      setPayoutError(err instanceof Error ? err.message : 'Ошибка вывода');
    } finally {
      setPayoutBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError(null);
    try {
      const res = await fetch('/api/v1/cabinet', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editName,
          telegramUsername: editTelegram,
          currentPassword: currentPassword || undefined,
          newPassword: newPassword || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Не удалось сохранить изменения');
      setProfileOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      showToast('Данные профиля успешно сохранены!');
      await loadAll();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setProfileBusy(false);
    }
  };

  return (
    <SiteShell
      viewer={pub?.viewer ?? null}
      brand={pub?.brand ?? null}
      onViewerChange={() => router.push('/')}
    >
      {notice && (
        <div className="fixed right-4 top-20 z-50 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 shadow-lg">
          {notice}
        </div>
      )}

      <div className="hero-surface py-8 text-white sm:py-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              Мои прогнозы и баланс
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              Здесь хранятся все открытые вами матчи, баланс для покупок в 1 клик и возвраты по страховке
            </p>
          </div>
          <button
            type="button"
            onClick={() => setProfileOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/10"
          >
            <KeyRound className="h-3.5 w-3.5 text-blue-400" />
            <span>Настройки профиля и пароля</span>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Верхняя панель: профиль + баланс + приглашение друзей */}
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Ваш профиль
              </div>
              <div className="mt-1 text-xl font-black text-slate-950">
                {cabinet?.user.displayName ?? '...'}
              </div>
              <div className="text-xs text-slate-500">{cabinet?.user.email}</div>
              {cabinet?.user.telegramUsername && (
                <div className="mt-1 text-xs font-medium text-blue-600">
                  Telegram: {cabinet.user.telegramUsername}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Куплено прогнозов: {purchasedPredictions.length}</span>
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Баланс на сайте (и возвраты страховки)
                </div>
                <div className="mt-1 font-mono text-3xl font-black text-slate-950">
                  {(cabinet?.user.balanceRub ?? 0).toLocaleString('ru-RU')} ₽
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  С этого счета можно открывать любые прогнозы в 1 клик без ввода карты
                </p>
              </div>
              <Wallet className="h-6 w-6 shrink-0 text-blue-600" />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { amount: 1000, bonus: 0, badge: null },
                { amount: 2500, bonus: 250, badge: '+10% подарок' },
                { amount: 5000, bonus: 1000, badge: '+1 000 ₽ подарок' },
              ].map(({ amount, bonus, badge }) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() =>
                    setCheckoutTarget({
                      kind: 'BALANCE_TOPUP',
                      title:
                        bonus > 0
                          ? `Пополнение счета: +${(amount + bonus).toLocaleString('ru-RU')} ₽ на баланс`
                          : `Пополнение баланса на ${amount.toLocaleString('ru-RU')} ₽`,
                      subtitle:
                        bonus > 0
                          ? `К оплате ${amount.toLocaleString('ru-RU')} ₽ · Подарок +${bonus.toLocaleString('ru-RU')} ₽ зачисляется мгновенно (без подписок)`
                          : 'Разовое пополнение для быстрой оплаты прогнозов в 1 клик',
                      priceRub: amount,
                    })
                  }
                  className={`relative flex flex-col items-center justify-center rounded-xl border px-2 py-2.5 text-center transition ${
                    bonus >= 1000
                      ? 'border-blue-300 bg-blue-50/70 text-blue-950 hover:bg-blue-100/70'
                      : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-blue-300 hover:bg-blue-50'
                  }`}
                >
                  {badge && (
                    <span className="mb-0.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                      {badge}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-black">
                    <PlusCircle className="h-3 w-3 text-blue-600" />
                    <span>{amount.toLocaleString('ru-RU')} ₽</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6">
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Пригласите друга ({cabinet?.user.revsharePercent ?? 25}% вам)
                  </div>
                  <div className="mt-1 font-mono text-3xl font-black text-blue-600">
                    {affBalance.toLocaleString('ru-RU')} ₽
                  </div>
                </div>
                <Share2 className="h-6 w-6 shrink-0 text-slate-400" />
              </div>

              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500">
                <span>Переходов: {totalClicks}</span>
                <span>·</span>
                <span>Покупок друзей: {totalBuyers}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={copyPartnerLink}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:border-blue-300 hover:bg-white"
              >
                {copiedRef ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Ссылка скопирована — отправьте другу!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-blue-600" />
                    <span>Скопировать ссылку для друзей</span>
                  </>
                )}
              </button>

              {affBalance > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={payoutBusy || affBalance < 50}
                    onClick={handleTransferPartnerToWallet}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    <ArrowRightLeft className="h-3 w-3" />
                    <span>На баланс</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPayoutAmount(String(affBalance));
                      setPayoutOpen(true);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-900 px-2.5 py-2 text-[11px] font-bold text-white hover:bg-slate-800"
                  >
                    <Banknote className="h-3 w-3" />
                    <span>Вывести на СБП</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Личные уведомления покупателя в Telegram */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-extrabold text-slate-950">
                  Личные уведомления в Telegram
                </h2>
                {cabinet?.user.telegramChatId ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                    Подключено
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                    Не подключено
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {cabinet?.user.telegramChatId
                  ? 'Все купленные прогнозы, расчеты матчей и возвраты 100% по страховке мгновенно дублируются вам в личные сообщения.'
                  : 'Подключите нашего бота в 2 клика — купленные прогнозы и уведомления о возврате страховки на баланс будут приходить прямо в ваш Telegram (плюс мгновенный сброс пароля по коду).'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {cabinet?.user.telegramChatId ? (
              <>
                <button
                  type="button"
                  disabled={tgBusy}
                  onClick={() => handleTelegramAction('TEST_TELEGRAM_DM')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {tgBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>Проверить сообщение</span>
                </button>
                <button
                  type="button"
                  disabled={tgBusy}
                  onClick={() => handleTelegramAction('UNLINK_TELEGRAM')}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-rose-600"
                >
                  Отключить
                </button>
              </>
            ) : cabinet?.telegramBotConfigured ? (
              <>
                {cabinet.telegramBotUsername ? (
                  <a
                    href={`https://t.me/${cabinet.telegramBotUsername}?start=${cabinet.user.telegramLinkCode}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>1. Запустить бота в Telegram</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        `/start ${cabinet.user.telegramLinkCode}`,
                      );
                      showToast(
                        `Команда /start ${cabinet.user.telegramLinkCode} скопирована — отправьте её боту и нажмите «Подтвердить»`,
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-800 hover:bg-white"
                  >
                    <Copy className="h-3.5 w-3.5 text-blue-600" />
                    <span>Скопировать код /start {cabinet.user.telegramLinkCode}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={tgBusy}
                  onClick={() => handleTelegramAction('VERIFY_TELEGRAM_LINK')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {tgBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span>2. Подтвердить привязку</span>
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-400">
                Станет активно сразу после подключения Telegram-бота в настройках сайта
              </span>
            )}
          </div>
        </div>

        {/* Сетка купленных прогнозов */}
        <div className="mt-8">
          <h2 className="text-xl font-black text-slate-950">
            Открытые вами прогнозы
          </h2>
          {purchasedPredictions.length > 0 ? (
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {purchasedPredictions.map((prediction) => (
                <PredictionCard
                  key={prediction.id}
                  prediction={prediction}
                  defaultSinglePriceRub={pub?.brand.defaultSinglePriceRub ?? 790}
                  onBuySingle={() => {}}
                  onVerifyHash={setHashItem}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-600">
                У вас пока нет купленных прогнозов. Выберите интересующий матч на главной или посмотрите бесплатный прогноз дня.
              </p>
              <Link
                href="/predictions"
                className="mt-4 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-700"
              >
                Выбрать матч
              </Link>
            </div>
          )}
        </div>

        {/* История чеков */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
            <Receipt className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-extrabold text-slate-950">
              История покупок и возвратов по страховке
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {(cabinet?.orders ?? []).length === 0 ? (
              <div className="p-6 text-xs text-slate-500">Покупок пока не было.</div>
            ) : (
              (cabinet?.orders ?? []).map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-xs"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{order.title}</span>
                      {order.promoCode && (
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                          СКИДКА {order.promoCode}
                        </span>
                      )}
                      {order.insuranceCredited && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          <ShieldCheck className="h-3 w-3" />
                          <span>
                            Возвращено на баланс по страховке
                            {order.insuranceRefundedAmountRub
                              ? `: ${order.insuranceRefundedAmountRub.toLocaleString('ru-RU')} ₽`
                              : ''}
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-slate-400">
                      {new Date(order.createdAt).toLocaleString('ru-RU')}
                      {order.discountRub > 0
                        ? ` · Ваша выгода ${order.discountRub.toLocaleString('ru-RU')} ₽`
                        : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-slate-950">
                      {order.amountRub.toLocaleString('ru-RU')} ₽
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>
                        {order.status === 'SUCCEEDED'
                          ? 'Оплачено'
                          : order.status === 'REFUNDED'
                            ? 'Возврат'
                            : 'В обработке'}
                      </span>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Заявки на вывод партнерского дохода */}
        {(cabinet?.payouts ?? []).length > 0 && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-extrabold text-slate-950">
                Заявки на вывод партнерского вознаграждения
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {(cabinet?.payouts ?? []).map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">
                      {p.method === 'SBP' ? 'СБП по номеру телефона' : 'Карта МИР'} ·{' '}
                      {p.requisites}
                    </div>
                    <div className="text-slate-400">
                      {new Date(p.createdAt).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-slate-950">
                      {p.amountRub.toLocaleString('ru-RU')} ₽
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-bold ${
                        p.status === 'PAID'
                          ? 'bg-emerald-50 text-emerald-700'
                          : p.status === 'REJECTED'
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {p.status === 'PAID'
                        ? 'Выплачено'
                        : p.status === 'REJECTED'
                          ? 'Возвращено на счет'
                          : 'Ожидает выплаты'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно вывода партнерских средств на СБП / Карту МИР */}
      {payoutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPayoutOpen(false);
          }}
        >
          <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex shrink-0 items-center justify-between bg-[#0B0F19] px-6 py-4 text-white">
              <span className="text-sm font-bold">Вывод партнерского дохода</span>
              <button
                type="button"
                onClick={() => setPayoutOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={handleSubmitPayout}
              className="space-y-4 overflow-y-auto p-6"
            >
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPayoutMethod('SBP')}
                  className={`rounded-xl border py-2.5 text-xs font-bold ${
                    payoutMethod === 'SBP'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  По номеру СБП
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutMethod('CARD')}
                  className={`rounded-xl border py-2.5 text-xs font-bold ${
                    payoutMethod === 'CARD'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  На карту МИР
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Сумма вывода (от 500 ₽, доступно {affBalance} ₽)
                </label>
                <input
                  type="number"
                  min={500}
                  max={affBalance}
                  required
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  {payoutMethod === 'SBP'
                    ? 'Телефон и название банка (например: +7 999 123-45-67, Сбербанк)'
                    : 'Номер карты МИР'}
                </label>
                <input
                  type="text"
                  required
                  value={payoutRequisites}
                  onChange={(e) => setPayoutRequisites(e.target.value)}
                  placeholder={
                    payoutMethod === 'SBP'
                      ? '+7 999 000-00-00, Т-Банк'
                      : '2200 0000 0000 0000'
                  }
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                />
              </div>

              {payoutError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">
                  {payoutError}
                </div>
              )}

              <button
                type="submit"
                disabled={payoutBusy}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                Отправить заявку на выплату
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Модальное окно настроек профиля и смены пароля */}
      {profileOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setProfileOpen(false);
          }}
        >
          <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex shrink-0 items-center justify-between bg-[#0B0F19] px-6 py-4 text-white">
              <span className="text-sm font-bold">Профиль и смена пароля</span>
              <button
                type="button"
                onClick={() => setProfileOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={handleSaveProfile}
              className="space-y-3.5 overflow-y-auto p-6"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700">Ваше имя</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Ваш Telegram для связи с поддержкой (необязательно)
                </label>
                <input
                  type="text"
                  value={editTelegram}
                  onChange={(e) => setEditTelegram(e.target.value)}
                  placeholder="@username"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                />
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs font-bold text-slate-900">
                  Смена пароля (заполняйте только если хотите поменять)
                </div>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Текущий пароль"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Новый пароль (от 6 символов)"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                />
              </div>
              {profileError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">
                  {profileError}
                </div>
              )}
              <button
                type="submit"
                disabled={profileBusy}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                Сохранить настройки
              </button>
            </form>
          </div>
        </div>
      )}

      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={pub?.viewer ?? null}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={loadAll}
      />

      <HashVerifyModal prediction={hashItem} onClose={() => setHashItem(null)} />
    </SiteShell>
  );
}

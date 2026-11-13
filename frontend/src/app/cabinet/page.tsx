'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Copy,
  Crown,
  ExternalLink,
  Plus,
  Send,
  Share2,
  User,
  Wallet,
} from 'lucide-react';
import {
  CheckoutModalTarget,
  YooKassaCheckoutModal,
} from '@/components/billing/YooKassaCheckoutModal';
import { SiteShell } from '@/components/layout/SiteShell';
import { PredictionCard } from '@/components/predictions/PredictionCard';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import type {
  AffiliateLinkRecord,
  AffiliatePayoutRequest,
  OrderTransaction,
  PublicPredictionDto,
  SafeSessionUser,
} from '@/server/types';

interface CabinetData {
  user: SafeSessionUser;
  unlockedPredictions: PublicPredictionDto[];
  orders: OrderTransaction[];
  affiliateLinks: AffiliateLinkRecord[];
  payouts: AffiliatePayoutRequest[];
}

export default function CabinetPage() {
  const router = useRouter();
  const { data: pubData, reload: reloadPub } = usePublicPlatform();
  const [cabinet, setCabinet] = useState<CabinetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ACCESS' | 'ORDERS' | 'PARTNER' | 'PROFILE'>('ACCESS');
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Профиль
  const [bankrollInput, setBankrollInput] = useState('');
  const [tgInput, setTgInput] = useState('');
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');

  // Пополнение
  const [topupRub, setTopupRub] = useState('1500');

  // Партнерка
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [withdrawRub, setWithdrawRub] = useState('1000');
  const [withdrawMethod, setWithdrawMethod] = useState<'SBP' | 'CARD' | 'USDT_TRC20'>('SBP');
  const [withdrawReq, setWithdrawReq] = useState('');

  const showNotice = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadCabinet = useCallback(async () => {
    const res = await fetch('/api/v1/cabinet', { cache: 'no-store' });
    if (res.status === 401) {
      router.replace('/login');
      return;
    }
    if (res.ok) {
      const json = (await res.json()) as CabinetData;
      setCabinet(json);
      setBankrollInput(String(json.user.referenceBankrollRub));
      setTgInput(json.user.telegramUsername ?? '');
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadCabinet();
  }, [loadCabinet]);

  if (loading || !pubData || !cabinet) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Загрузка личного кабинета...
      </div>
    );
  }

  const u = cabinet.user;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCancelAutoRenew = async () => {
    const res = await fetch('/api/v1/cabinet', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancelAutoRenew: true }),
    });
    if (res.ok) {
      showNotice('Автоматическое продление подписки отключено');
      await loadCabinet();
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/cabinet', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        referenceBankrollRub: Number(bankrollInput) || 50000,
        telegramUsername: tgInput,
        currentPassword: curPass || undefined,
        newPassword: newPass || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      showNotice(json.error || 'Ошибка сохранения');
      return;
    }
    setCurPass('');
    setNewPass('');
    showNotice('Настройки профиля сохранены');
    await Promise.all([loadCabinet(), reloadPub()]);
  };

  const handleCreatePartnerLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/affiliate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_LINK',
        code: newCode,
        label: newLabel,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      showNotice(json.error || 'Ошибка создания ссылки');
      return;
    }
    setNewCode('');
    setNewLabel('');
    showNotice('Партнерская ссылка создана');
    await loadCabinet();
  };

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/affiliate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'REQUEST_PAYOUT',
        amountRub: Number(withdrawRub),
        method: withdrawMethod,
        requisites: withdrawReq,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      showNotice(json.error || 'Ошибка заявки на вывод');
      return;
    }
    setWithdrawReq('');
    showNotice('Заявка на вывод отправлена');
    await loadCabinet();
  };

  const upcomingUnlocked = cabinet.unlockedPredictions.filter(
    (p) => p.matchStatus !== 'FINISHED',
  );

  return (
    <SiteShell
      brand={pubData.brand}
      viewer={u}
      onViewerChange={() => {
        reloadPub();
        router.push('/');
      }}
    >
      <YooKassaCheckoutModal
        target={checkoutTarget}
        viewer={u}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={async () => {
          await Promise.all([loadCabinet(), reloadPub()]);
        }}
      />

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-emerald-500/40 bg-slate-900 px-4 py-3 text-xs font-semibold text-emerald-300 shadow-2xl">
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {/* Шапка кабинета */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
            <div className="flex items-center gap-2.5 text-xs text-slate-400">
              <User className="h-4 w-4 text-emerald-400" />
              <span>Аккаунт клиента</span>
            </div>
            <div className="mt-2 text-lg font-bold text-white">{u.displayName}</div>
            <div className="text-xs text-slate-400">{u.email}</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Crown className="h-4 w-4 text-amber-400" />
                <span>Статус VIP-подписки</span>
              </span>
            </div>
            {u.hasActiveVip ? (
              <>
                <div className="mt-2 text-lg font-bold text-amber-300">
                  {u.vipPlanName || 'VIP активен'}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {u.vipExpiresAt === 'LIFETIME'
                    ? 'Бессрочный доступ'
                    : `Действует до ${new Date(u.vipExpiresAt!).toLocaleDateString('ru-RU')}`}
                </div>
              </>
            ) : (
              <>
                <div className="mt-2 text-base font-bold text-slate-300">Не подключена</div>
                <Link
                  href="/tariffs"
                  className="mt-1 inline-block text-xs font-semibold text-emerald-400 hover:underline"
                >
                  Выбрать тариф VIP →
                </Link>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-emerald-400" />
                <span>Баланс кабинета</span>
              </span>
              <span className="text-slate-500">
                Партнерские: {u.affiliateBalanceRub.toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-2xl font-extrabold text-white">
                {u.balanceRub.toLocaleString('ru-RU')} ₽
              </span>
              <button
                type="button"
                onClick={() => setTab('ORDERS')}
                className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25"
              >
                Пополнить
              </button>
            </div>
          </div>
        </div>

        {/* Навигация по вкладкам кабинета */}
        <div className="mt-6 flex flex-wrap gap-1.5 border-b border-slate-800 pb-3">
          {(
            [
              ['ACCESS', 'Мои прогнозы и VIP'],
              ['ORDERS', 'Баланс и оплаты'],
              ['PARTNER', `Партнерская программа (${u.revsharePercent}%)`],
              ['PROFILE', 'Калькулятор банка и профиль'],
            ] as const
          ).map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => setTab(code)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                tab === code
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ВКЛАДКА 1: ДОСТУПЫ И ПРОГНОЗЫ */}
        {tab === 'ACCESS' && (
          <div className="mt-6 space-y-6">
            {u.hasActiveVip && (
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 sm:flex-row sm:items-center">
                <div>
                  <div className="text-sm font-bold text-white">
                    Закрытый Telegram-канал участников VIP-клуба
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Все прогнозы приходят в канал моментально в момент публикации.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {u.vipInviteLink && (
                    <a
                      href={u.vipInviteLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-sky-400"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Перейти в VIP Telegram</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {u.autoRenew && (
                    <button
                      type="button"
                      onClick={handleCancelAutoRenew}
                      className="rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-slate-300 hover:text-white"
                    >
                      Отключить автопродление
                    </button>
                  )}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-lg font-bold text-white">
                Доступные вам предстоящие прогнозы
              </h2>
              <div className="mt-4 space-y-4">
                {upcomingUnlocked.length > 0 ? (
                  upcomingUnlocked.map((pred) => (
                    <PredictionCard
                      key={pred.id}
                      prediction={pred}
                      userReferenceBankrollRub={u.referenceBankrollRub}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
                    У вас пока нет активных предстоящих прогнозов.{' '}
                    <Link href="/predictions" className="text-emerald-400 underline">
                      Перейти к ленте матчей
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 2: БАЛАНС И ИСТОРИЯ ОПЛАТ */}
        {tab === 'ORDERS' && (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
              <h2 className="text-base font-bold text-white">Пополнение баланса кабинета</h2>
              <p className="mt-1 text-xs text-slate-400">
                С внутреннего баланса удобно оплачивать ординары в один клик без перехода на платежный шлюз.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={topupRub}
                  onChange={(e) => setTopupRub(e.target.value)}
                  className="w-40 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-white"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCheckoutTarget({
                      kind: 'BALANCE_TOPUP',
                      title: 'Пополнение баланса личного кабинета',
                      subtitle: u.email,
                      priceRub: Math.max(100, Number(topupRub) || 1000),
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400"
                >
                  <Plus className="h-4 w-4" />
                  <span>Пополнить через ЮKassa</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/75">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Дата</th>
                    <th className="px-4 py-3">Назначение</th>
                    <th className="px-4 py-3">Сумма</th>
                    <th className="px-4 py-3">Способ</th>
                    <th className="px-4 py-3">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {cabinet.orders.length > 0 ? (
                    cabinet.orders.map((ord) => (
                      <tr key={ord.id}>
                        <td className="px-4 py-3 text-slate-400">
                          {new Date(ord.createdAt).toLocaleString('ru-RU')}
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">{ord.title}</td>
                        <td className="px-4 py-3 font-mono font-bold">
                          {ord.amountRub.toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {ord.paymentMethod === 'yookassa' ? 'ЮKassa' : 'Баланс'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              ord.status === 'SUCCEEDED'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : ord.status === 'REFUNDED'
                                  ? 'bg-rose-500/15 text-rose-300'
                                  : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {ord.status === 'SUCCEEDED'
                              ? 'Оплачен'
                              : ord.status === 'REFUNDED'
                                ? 'Возврат'
                                : ord.status === 'PENDING'
                                  ? 'Ожидание'
                                  : 'Отменен'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        Заказов пока нет.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 3: ПАРТНЕРСКАЯ ПРОГРАММА */}
        {tab === 'PARTNER' && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Создание реферальной ссылки */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Share2 className="h-4 w-4 text-emerald-400" />
                  <span>Ваши партнерские ссылки ({u.revsharePercent}% с каждой оплаты)</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Приглашенный пользователь закрепляется за вами на 30 дней по cookie и навсегда после регистрации.
                </p>

                <div className="mt-4 space-y-2.5">
                  {cabinet.affiliateLinks.map((lnk) => {
                    const fullUrl = `${origin}/?ref=${lnk.code}`;
                    return (
                      <div
                        key={lnk.id}
                        className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{lnk.label}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(fullUrl);
                              showNotice('Ссылка скопирована');
                            }}
                            className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            <span>Копировать</span>
                          </button>
                        </div>
                        <div className="mt-1 truncate font-mono text-slate-400">{fullUrl}</div>
                        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
                          <span>Переходы: {lnk.clicks}</span>
                          <span>Регистрации: {lnk.registrations}</span>
                          <span>Оплаты: {lnk.buyers}</span>
                          <span className="font-bold text-emerald-400">
                            Доход: {lnk.revenueRub.toLocaleString('ru-RU')} ₽
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form onSubmit={handleCreatePartnerLink} className="mt-4 flex flex-wrap gap-2">
                  <input
                    type="text"
                    required
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="Код (напр. tg_sport)"
                    className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Название источника"
                    className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
                  >
                    + Добавить
                  </button>
                </form>
              </div>

              {/* Запрос выплаты */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
                <div className="text-sm font-bold text-white">
                  Вывод партнерского вознаграждения
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Доступно к выводу:{' '}
                  <strong className="font-mono text-emerald-400">
                    {u.affiliateBalanceRub.toLocaleString('ru-RU')} ₽
                  </strong>{' '}
                  (минимум 500 ₽)
                </div>

                <form onSubmit={handleRequestPayout} className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="number"
                      min={500}
                      value={withdrawRub}
                      onChange={(e) => setWithdrawRub(e.target.value)}
                      placeholder="Сумма ₽"
                      className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 font-mono text-xs text-white"
                    />
                    <select
                      value={withdrawMethod}
                      onChange={(e) =>
                        setWithdrawMethod(e.target.value as 'SBP' | 'CARD' | 'USDT_TRC20')
                      }
                      className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                    >
                      <option value="SBP">СБП (по номеру телефона)</option>
                      <option value="CARD">Карта РФ</option>
                      <option value="USDT_TRC20">USDT (TRC-20)</option>
                    </select>
                  </div>

                  <input
                    type="text"
                    required
                    value={withdrawReq}
                    onChange={(e) => setWithdrawReq(e.target.value)}
                    placeholder="Реквизиты (телефон и банк / номер карты / адрес кошелька)"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white"
                  />

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    Запросить выплату
                  </button>
                </form>

                {cabinet.payouts.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-xs">
                    {cabinet.payouts.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2"
                      >
                        <span>
                          {p.amountRub.toLocaleString('ru-RU')} ₽ ({p.method})
                        </span>
                        <span className="font-semibold text-slate-300">
                          {p.status === 'PAID'
                            ? 'Выплачено'
                            : p.status === 'REJECTED'
                              ? 'Отклонено'
                              : 'В обработке'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 4: ПРОФИЛЬ И КАЛЬКУЛЯТОР БАНКА */}
        {tab === 'PROFILE' && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-6 max-w-xl space-y-5 rounded-2xl border border-slate-800 bg-slate-900/75 p-6"
          >
            <div>
              <h2 className="text-base font-bold text-white">
                Персональный калькулятор флэта
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Укажите ваш рабочий банк — на всех карточках прогнозов автоматически будет рассчитываться точная сумма ставки в рублях под рекомендованный процент.
              </p>
              <input
                type="number"
                min={1000}
                step={1000}
                value={bankrollInput}
                onChange={(e) => setBankrollInput(e.target.value)}
                className="mt-2.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 font-mono text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Ваш Telegram (@username)
              </label>
              <input
                type="text"
                value={tgInput}
                onChange={(e) => setTgInput(e.target.value)}
                placeholder="@username"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div className="border-t border-slate-800 pt-4">
              <div className="text-xs font-bold text-white">Смена пароля (необязательно)</div>
              <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="password"
                  value={curPass}
                  onChange={(e) => setCurPass(e.target.value)}
                  placeholder="Текущий пароль"
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white"
                />
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Новый пароль"
                  className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400"
            >
              Сохранить настройки
            </button>
          </form>
        )}
      </div>
    </SiteShell>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Copy,
  Plus,
  Share2,
  ShoppingBag,
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
  purchasedPredictions: PublicPredictionDto[];
  orders: OrderTransaction[];
  affiliateLinks: AffiliateLinkRecord[];
  payouts: AffiliatePayoutRequest[];
}

export default function CabinetPage() {
  const router = useRouter();
  const { data: pubData, reload: reloadPub } = usePublicPlatform();
  const [cabinet, setCabinet] = useState<CabinetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'PURCHASES' | 'ORDERS' | 'PARTNER' | 'PROFILE'>(
    'PURCHASES',
  );
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutModalTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [bankrollInput, setBankrollInput] = useState('');
  const [tgInput, setTgInput] = useState('');
  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [topupRub, setTopupRub] = useState('1500');

  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [withdrawRub, setWithdrawRub] = useState('1000');
  const [withdrawMethod, setWithdrawMethod] = useState<'SBP' | 'CARD' | 'USDT_TRC20'>(
    'SBP',
  );
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
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] text-sm font-medium text-slate-500">
        Загрузка личного кабинета...
      </div>
    );
  }

  const u = cabinet.user;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

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
        <div className="fixed bottom-5 right-5 z-50 rounded-2xl border border-slate-200 bg-[#0B0F19] px-4 py-3 text-xs font-bold text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* Контрастная темная шапка личного кабинета */}
      <div className="bg-[#0B0F19] py-10 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <User className="h-4 w-4 text-blue-400" />
                <span>Профиль покупателя</span>
              </div>
              <div className="mt-2 text-lg font-black text-white">{u.displayName}</div>
              <div className="text-xs text-slate-400">{u.email}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <ShoppingBag className="h-4 w-4 text-blue-400" />
                <span>Приобретенные прогнозы</span>
              </div>
              <div className="mt-2 font-mono text-2xl font-black text-white">
                {cabinet.purchasedPredictions.length}
              </div>
              <div className="text-xs text-slate-400">
                Бессрочно доступны в вашем кабинете
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="h-4 w-4 text-blue-400" />
                  <span>Кошелек для покупок в 1 клик</span>
                </span>
                <span className="text-slate-400">
                  Реф: {u.affiliateBalanceRub.toLocaleString('ru-RU')} ₽
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="font-mono text-2xl font-black text-white">
                  {u.balanceRub.toLocaleString('ru-RU')} ₽
                </span>
                <button
                  type="button"
                  onClick={() => setTab('ORDERS')}
                  className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-500"
                >
                  Пополнить
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Вкладки и контент на светлом полотне */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['PURCHASES', `Мои покупки (${cabinet.purchasedPredictions.length})`],
              ['ORDERS', 'Кошелек и чеки'],
              ['PARTNER', `Партнерская программа (${u.revsharePercent}%)`],
              ['PROFILE', 'Калькулятор банка и профиль'],
            ] as const
          ).map(([code, label]) => (
            <button
              key={code}
              type="button"
              onClick={() => setTab(code)}
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                tab === code
                  ? 'bg-[#0B0F19] text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 1. МОИ КУПЛЕННЫЕ ПРОГНОЗЫ (СЕТКА 3 КАРТОЧКИ В РЯД) */}
        {tab === 'PURCHASES' && (
          <div className="mt-6">
            {cabinet.purchasedPredictions.length > 0 ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {cabinet.purchasedPredictions.map((pred) => (
                  <PredictionCard
                    key={pred.id}
                    prediction={pred}
                    variant="grid"
                    userReferenceBankrollRub={u.referenceBankrollRub}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
                <h2 className="text-lg font-extrabold text-slate-950">
                  У вас пока нет купленных прогнозов
                </h2>
                <p className="mt-1.5 text-xs text-slate-500">
                  Выберите интересующий вас матч на витрине событий — доступ откроется мгновенно.
                </p>
                <Link
                  href="/predictions"
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white hover:bg-blue-700"
                >
                  <span>Перейти к витрине событий</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        )}

        {/* 2. КОШЕЛЕК И ИСТОРИЯ ОПЛАТ */}
        {tab === 'ORDERS' && (
          <div className="mt-6 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-extrabold text-slate-950">
                Пополнение кошелька кабинета
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Пополните баланс один раз и открывайте любые прогнозы в один клик без перехода на страницу банка.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={topupRub}
                  onChange={(e) => setTopupRub(e.target.value)}
                  className="w-40 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-sm font-bold text-slate-900"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCheckoutTarget({
                      kind: 'BALANCE_TOPUP',
                      title: 'Пополнение кошелька кабинета',
                      subtitle: u.email,
                      priceRub: Math.max(100, Number(topupRub) || 1000),
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  <span>Пополнить через ЮKassa</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5 font-bold">Дата</th>
                    <th className="px-5 py-3.5 font-bold">Событие / Назначение</th>
                    <th className="px-5 py-3.5 font-bold">Сумма</th>
                    <th className="px-5 py-3.5 font-bold">Способ</th>
                    <th className="px-5 py-3.5 font-bold">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {cabinet.orders.length > 0 ? (
                    cabinet.orders.map((ord) => (
                      <tr key={ord.id}>
                        <td className="px-5 py-3.5 text-slate-400">
                          {new Date(ord.createdAt).toLocaleString('ru-RU')}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-950">
                          {ord.title}
                        </td>
                        <td className="px-5 py-3.5 font-mono font-black">
                          {ord.amountRub.toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">
                          {ord.paymentMethod === 'yookassa' ? 'ЮKassa' : 'Кошелек'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                              ord.status === 'SUCCEEDED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : ord.status === 'REFUNDED'
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-slate-100 text-slate-600'
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
                      <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                        Операций пока нет.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. ПАРТНЕРСКАЯ ПРОГРАММА */}
        {tab === 'PARTNER' && (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
                <Share2 className="h-4 w-4 text-blue-600" />
                <span>Ваши партнерские ссылки ({u.revsharePercent}% с каждой покупки)</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Получайте вознаграждение с каждой разовой покупки приглашенных пользователей.
              </p>

              <div className="mt-4 space-y-2.5">
                {cabinet.affiliateLinks.map((lnk) => {
                  const fullUrl = `${origin}/?ref=${lnk.code}`;
                  return (
                    <div
                      key={lnk.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">{lnk.label}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(fullUrl);
                            showNotice('Ссылка скопирована');
                          }}
                          className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span>Копировать</span>
                        </button>
                      </div>
                      <div className="mt-1 truncate font-mono text-slate-500">{fullUrl}</div>
                      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                        <span>Переходы: {lnk.clicks}</span>
                        <span>Регистрации: {lnk.registrations}</span>
                        <span>Покупки: {lnk.buyers}</span>
                        <span className="font-bold text-blue-600">
                          Оборот: {lnk.revenueRub.toLocaleString('ru-RU')} ₽
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
                  placeholder="Код (напр. sport_tg)"
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
                />
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Источник"
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-[#0B0F19] px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  + Создать
                </button>
              </form>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-extrabold text-slate-950">
                Вывод партнерских средств
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Доступно к выводу:{' '}
                <strong className="font-mono text-blue-600">
                  {u.affiliateBalanceRub.toLocaleString('ru-RU')} ₽
                </strong>{' '}
                (от 500 ₽)
              </div>

              <form onSubmit={handleRequestPayout} className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="number"
                    min={500}
                    value={withdrawRub}
                    onChange={(e) => setWithdrawRub(e.target.value)}
                    placeholder="Сумма ₽"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-900"
                  />
                  <select
                    value={withdrawMethod}
                    onChange={(e) =>
                      setWithdrawMethod(e.target.value as 'SBP' | 'CARD' | 'USDT_TRC20')
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-900"
                  >
                    <option value="SBP">СБП (по телефону)</option>
                    <option value="CARD">Карта РФ</option>
                    <option value="USDT_TRC20">USDT (TRC-20)</option>
                  </select>
                </div>

                <input
                  type="text"
                  required
                  value={withdrawReq}
                  onChange={(e) => setWithdrawReq(e.target.value)}
                  placeholder="Реквизиты (телефон и банк / карта / адрес USDT)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900"
                />

                <button
                  type="submit"
                  className="w-full rounded-xl bg-blue-600 py-3 text-xs font-bold text-white hover:bg-blue-700"
                >
                  Отправить заявку на выплату
                </button>
              </form>

              {cabinet.payouts.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs">
                  {cabinet.payouts.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <span className="font-semibold text-slate-800">
                        {p.amountRub.toLocaleString('ru-RU')} ₽ ({p.method})
                      </span>
                      <span className="font-bold text-slate-500">
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
        )}

        {/* 4. ПРОФИЛЬ И КАЛЬКУЛЯТОР БАНКА */}
        {tab === 'PROFILE' && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-6 max-w-xl space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
          >
            <div>
              <h2 className="text-base font-extrabold text-slate-950">
                Калькулятор флэта под ваш банк
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Укажите ваш рабочий банк — на всех карточках событий автоматически будет показываться сумма ставки в рублях под рекомендованный процент.
              </p>
              <input
                type="number"
                min={1000}
                step={1000}
                value={bankrollInput}
                onChange={(e) => setBankrollInput(e.target.value)}
                className="mt-2.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-sm font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">
                Ваш Telegram (@username)
              </label>
              <input
                type="text"
                value={tgInput}
                onChange={(e) => setTgInput(e.target.value)}
                placeholder="@username"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900"
              />
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="text-xs font-bold text-slate-900">
                Смена пароля (необязательно)
              </div>
              <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="password"
                  value={curPass}
                  onChange={(e) => setCurPass(e.target.value)}
                  placeholder="Текущий пароль"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900"
                />
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Новый пароль"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900"
                />
              </div>
            </div>

            <button
              type="submit"
              className="rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700"
            >
              Сохранить изменения
            </button>
          </form>
        )}
      </div>
    </SiteShell>
  );
}

'use client';

import React, { useMemo, useState } from 'react';
import { Ban, Gift, Loader2, Search, Users } from 'lucide-react';
import type { OrderTransaction, PredictionRecord, SafeSessionUser } from '@/server/types';
import { Badge, EmptyState, Field, Modal, SectionCard, inputCls, inputMonoCls, type ToastKind } from './ui';
import { compareValues, formatRub, nextSort, type AdminUser, type SortState } from './admin-format';
import { SortableHeader } from './AdminTableHelpers';
import { ClientDetailsModal } from './ClientDetailsModal';

type UserSort = 'name' | 'balance' | 'affiliate' | 'access';

type UserAction =
  | { kind: 'balance'; user: SafeSessionUser }
  | { kind: 'grant'; user: SafeSessionUser }
  | { kind: 'revshare'; user: SafeSessionUser }
  | { kind: 'password'; user: SafeSessionUser }
  | { kind: 'block'; user: SafeSessionUser };

export function UsersTab({
  users,
  predictions,
  transactions,
  onRefresh,
  onToast,
}: {
  users: AdminUser[];
  predictions: PredictionRecord[];
  transactions: OrderTransaction[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'BUYERS' | 'PARTNERS' | 'BLOCKED'>('ALL');
  const [sort, setSort] = useState<SortState<UserSort>>({ key: 'name', direction: 'asc' });
  const [detailsUserId, setDetailsUserId] = useState<string | null>(null);
  const [action, setAction] = useState<UserAction | null>(null);
  const [busy, setBusy] = useState(false);

  const [balanceAmount, setBalanceAmount] = useState('1000');
  const [grantPredictionId, setGrantPredictionId] = useState('');
  const [revsharePct, setRevsharePct] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const openAction = (next: UserAction) => {
    setAction(next);
    if (next.kind === 'balance') setBalanceAmount('1000');
    if (next.kind === 'revshare') setRevsharePct(String(next.user.revsharePercent));
    if (next.kind === 'password') setNewPassword('');
    if (next.kind === 'grant') {
      const pending = predictions.filter(
        (p) => p.resultStatus === 'PENDING' && !next.user.purchasedPredictionIds.includes(p.id),
      );
      setGrantPredictionId(pending[0]?.id ?? '');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = users.filter((u) => {
      if (filter === 'BUYERS' && u.purchasedPredictionIds.length === 0) return false;
      if (filter === 'PARTNERS' && u.affiliateTotalEarnedRub <= 0) return false;
      if (filter === 'BLOCKED' && u.status !== 'BLOCKED') return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
    });
    const value = (user: AdminUser): string | number => {
      switch (sort.key) {
        case 'name': return user.displayName || user.email;
        case 'balance': return user.balanceRub;
        case 'affiliate': return user.affiliateBalanceRub;
        case 'access': return user.purchasedPredictionIds.length;
      }
    };
    return rows.sort((a, b) => compareValues(value(a), value(b), sort.direction) || a.id.localeCompare(b.id));
  }, [users, search, filter, sort]);

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      let payload: Record<string, unknown> | null = null;
      if (action.kind === 'balance') {
        const amount = Number(balanceAmount);
        if (!Number.isFinite(amount) || amount === 0) {
          onToast('Введите корректную сумму', 'error');
          return;
        }
        payload = { action: 'ADD_BALANCE', userId: action.user.id, amountRub: amount };
      } else if (action.kind === 'grant') {
        if (!grantPredictionId) {
          onToast('Все актуальные матчи уже открыты у этого клиента', 'info');
          return;
        }
        payload = { action: 'GRANT_PREDICTION', userId: action.user.id, predictionId: grantPredictionId };
      } else if (action.kind === 'revshare') {
        const pct = Number(revsharePct);
        if (!Number.isFinite(pct) || pct < 5 || pct > 60) {
          onToast('Партнёрский процент должен быть от 5 до 60%', 'error');
          return;
        }
        payload = { action: 'SET_REVSHARE', userId: action.user.id, revsharePercent: pct };
      } else if (action.kind === 'password') {
        if (newPassword.length < 6) {
          onToast('Пароль должен содержать минимум 6 символов', 'error');
          return;
        }
        payload = { action: 'RESET_PASSWORD', userId: action.user.id, newPassword };
      } else if (action.kind === 'block') {
        payload = { action: 'TOGGLE_BLOCK', userId: action.user.id };
      }
      if (!payload) return;
      const res = await fetch('/api/v1/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Не удалось выполнить действие (HTTP ${res.status})`);
      const messages: Record<UserAction['kind'], string> = {
        balance: Number(balanceAmount) < 0 ? 'Баланс изменён' : 'Баланс начислен',
        grant: 'Доступ к прогнозу открыт',
        revshare: 'Партнёрский процент обновлён',
        password: 'Новый пароль установлен',
        block:
          action.user.status === 'BLOCKED'
            ? 'Аккаунт разблокирован'
            : 'Аккаунт заблокирован',
      };
      onToast(messages[action.kind]);
      setAction(null);
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось выполнить действие', 'error');
    } finally {
      setBusy(false);
    }
  };

  const grantablePredictions = action?.kind === 'grant'
    ? predictions.filter(
        (p) => p.resultStatus === 'PENDING' && !action.user.purchasedPredictionIds.includes(p.id),
      )
    : [];

  const modalMeta: Record<UserAction['kind'], { title: string; description: string; confirm: string }> = {
    balance: { title: 'Начислить на баланс', description: 'Сумма будет добавлена на внутренний баланс клиента.', confirm: 'Начислить' },
    grant: { title: 'Подарить прогноз', description: 'Клиент получит бесплатный доступ к выбранному событию.', confirm: 'Открыть доступ' },
    revshare: { title: 'Партнёрский процент', description: 'Доля с продаж по реферальной ссылке клиента.', confirm: 'Сохранить' },
    password: { title: 'Сменить пароль', description: 'Новый пароль будет действовать сразу.', confirm: 'Установить пароль' },
    block: { title: 'Изменить блокировку', description: 'Заблокированный клиент не сможет входить и покупать.', confirm: 'Применить' },
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск клиентов"
            placeholder="Поиск по email, имени или ID…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ['ALL', 'Все'],
              ['BUYERS', 'Покупатели'],
              ['PARTNERS', 'Партнёры'],
              ['BLOCKED', 'Заблокированные'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                filter === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <SectionCard title={`Клиенты (${filtered.length})`} subtitle="Управление пользователями и партнёрами">
        {filtered.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="Клиентов не найдено" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <SortableHeader label="Клиент" active={sort.key === 'name'} direction={sort.direction} onSort={() => setSort((s) => nextSort(s, 'name'))} />
                  <SortableHeader label="Баланс" active={sort.key === 'balance'} direction={sort.direction} onSort={() => setSort((s) => nextSort(s, 'balance', 'desc'))} />
                  <SortableHeader label="Партнёрка" active={sort.key === 'affiliate'} direction={sort.direction} onSort={() => setSort((s) => nextSort(s, 'affiliate', 'desc'))} />
                  <SortableHeader label="Открыто прогнозов" active={sort.key === 'access'} direction={sort.direction} onSort={() => setSort((s) => nextSort(s, 'access', 'desc'))} />
                  <th className="px-5 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setDetailsUserId(u.id)} className="text-left font-bold text-blue-700 hover:text-blue-900 hover:underline">
                          {u.displayName} ({u.email})
                        </button>
                        {u.role === 'ADMIN' && <Badge tone="blue">Администратор</Badge>}
                        {u.status === 'BLOCKED' && <Badge tone="rose">Заблокирован</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-slate-900">
                      {formatRub(u.balanceRub)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <div className="font-mono font-bold">{formatRub(u.affiliateBalanceRub)}</div>
                      <div className="text-[11px] text-slate-400">
                        {u.revsharePercent}% · заработано {formatRub(u.affiliateTotalEarnedRub)}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-slate-900">
                      {u.purchasedPredictionIds.length}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openAction({ kind: 'balance', user: u })}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          + ₽
                        </button>
                        <button
                          type="button"
                          onClick={() => openAction({ kind: 'grant', user: u })}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100"
                        >
                          <Gift className="h-3 w-3" />
                          Подарить матч
                        </button>
                        <button
                          type="button"
                          onClick={() => openAction({ kind: 'revshare', user: u })}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          {u.revsharePercent}%
                        </button>
                        <button
                          type="button"
                          onClick={() => openAction({ kind: 'password', user: u })}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Пароль
                        </button>
                        {u.role !== 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => openAction({ kind: 'block', user: u })}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                              u.status === 'BLOCKED'
                                ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                            }`}
                          >
                            <Ban className="h-3 w-3" />
                            {u.status === 'BLOCKED' ? 'Разблокировать' : 'Блок'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ClientDetailsModal
        user={users.find((user) => user.id === detailsUserId) ?? null}
        transactions={transactions}
        predictions={predictions}
        onClose={() => setDetailsUserId(null)}
      />

      <Modal
        open={action !== null}
        onClose={() => { if (!busy) setAction(null); }}
        title={action ? modalMeta[action.kind].title : ''}
        description={
          action
            ? `${modalMeta[action.kind].description} Клиент: ${action.user.displayName} (${action.user.email})`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setAction(null)}
              disabled={busy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={runAction}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${
                action?.kind === 'block' && action.user.status !== 'BLOCKED'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {action ? modalMeta[action.kind].confirm : ''}
            </button>
          </>
        }
      >
        {action?.kind === 'balance' && (
          <Field label="Сумма начисления (₽)" hint="Можно указать отрицательную сумму для списания.">
            <input type="number" autoFocus value={balanceAmount} onChange={(e) => setBalanceAmount(e.target.value)} className={inputMonoCls} />
          </Field>
        )}
        {action?.kind === 'grant' && (
          <Field label="Событие для подарка">
            {grantablePredictions.length === 0 ? (
              <p className="text-xs text-slate-500">Все актуальные матчи уже открыты у этого клиента.</p>
            ) : (
              <select value={grantPredictionId} onChange={(e) => setGrantPredictionId(e.target.value)} className={inputCls}>
                {grantablePredictions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.homeTeam} — {p.awayTeam} · {p.leagueName}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {action?.kind === 'revshare' && (
          <Field label="Партнёрский процент" hint="Допустимый диапазон: от 5 до 60%.">
            <input type="number" min={5} max={60} autoFocus value={revsharePct} onChange={(e) => setRevsharePct(e.target.value)} className={inputMonoCls} />
          </Field>
        )}
        {action?.kind === 'password' && (
          <Field label="Новый пароль" hint="Минимум 6 символов.">
            <input type="password" autoFocus value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
          </Field>
        )}
        {action?.kind === 'block' && (
          <p className="text-xs leading-relaxed text-slate-600">
            {action.user.status === 'BLOCKED'
              ? 'Аккаунт будет разблокирован и клиент снова сможет входить и покупать прогнозы.'
              : 'Аккаунт будет заблокирован: клиент не сможет входить и покупать прогнозы, пока вы не разблокируете его.'}
          </p>
        )}
      </Modal>
    </div>
  );
}

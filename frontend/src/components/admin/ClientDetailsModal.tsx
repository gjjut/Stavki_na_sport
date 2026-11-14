'use client';

import React, { useMemo } from 'react';
import { LocalDateTime } from '@/components/LocalDateTime';
import type { OrderTransaction, PredictionRecord } from '@/server/types';
import { OrderStatusBadge } from './AdminTableHelpers';
import { formatRub, type AdminUser } from './admin-format';
import { Badge, Modal } from './ui';

export function ClientDetailsModal({ user, transactions, predictions, onClose }: {
  user: AdminUser | null;
  transactions: OrderTransaction[];
  predictions: PredictionRecord[];
  onClose: () => void;
}) {
  const orders = useMemo(() => user
    ? transactions.filter((order) => order.userId === user.id)
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
    : [], [user, transactions]);
  const accessiblePredictions = useMemo(() => {
    const byId = new Map(predictions.map((prediction) => [prediction.id, prediction]));
    return (user?.purchasedPredictionIds ?? []).map((id) => ({ id, prediction: byId.get(id) }));
  }, [user, predictions]);

  return (
    <Modal open={user !== null} onClose={onClose} title="Карточка клиента" description={user?.email} wide>
      {user && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-extrabold text-slate-950">{user.displayName}</h4>
            <Badge tone={user.status === 'BLOCKED' ? 'rose' : 'emerald'}>{user.status === 'BLOCKED' ? 'Заблокирован' : 'Активен'}</Badge>
            {user.role === 'ADMIN' && <Badge tone="blue">Администратор</Badge>}
          </div>
          <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-xs sm:grid-cols-2">
            <div><span className="text-slate-500">Город: </span><strong>{user.city || 'не указан'}</strong></div>
            <div><span className="text-slate-500">Баланс клиента: </span><strong>{formatRub(user.balanceRub)}</strong></div>
            <div><span className="text-slate-500">Партнёрский баланс: </span><strong>{formatRub(user.affiliateBalanceRub)}</strong></div>
            <div><span className="text-slate-500">Открыто прогнозов: </span><strong>{user.purchasedPredictionIds.length}</strong></div>
            <div><span className="text-slate-500">Регистрация: </span>{user.createdAt ? <LocalDateTime value={user.createdAt} format="full" /> : 'нет данных'}</div>
            <div><span className="text-slate-500">Последний вход: </span>{user.lastLoginAt ? <LocalDateTime value={user.lastLoginAt} format="full" /> : 'нет данных'}</div>
          </div>

          <section aria-label="История заказов клиента">
            <h4 className="text-sm font-extrabold text-slate-950">История заказов ({orders.length})</h4>
            <p className="mt-1 text-[11px] text-slate-500">Включает покупки, пополнения, отменённые и возвращённые заказы.</p>
            {orders.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">Заказов пока нет.</p>
            ) : (
              <div className="mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
                {orders.map((order) => (
                  <div key={order.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900">{order.title}</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        <LocalDateTime value={order.createdAt} format="full" /> · {order.paymentMethod === 'yookassa' ? 'ЮKassa' : 'Внутренний баланс'}
                      </div>
                      {order.insuranceCredited && <div className="mt-1 text-[11px] text-emerald-700">Страховка выплачена{typeof order.insuranceRefundedAmountRub === 'number' ? `: ${formatRub(order.insuranceRefundedAmountRub)}` : ''}</div>}
                      {order.refundDestination === 'BALANCE' && <div className="mt-1 text-[11px] text-slate-500">Возврат на баланс: {formatRub(order.refundBalanceAmountRub ?? 0)}</div>}
                      {order.externalRefundNotices?.length ? <div className="mt-1 text-[11px] font-bold text-amber-700">Возврат ЮKassa: требуется ручная сверка в разделе «Финансы».</div> : null}
                    </div>
                    <div className="text-right"><div className="mb-1 font-mono font-bold">{formatRub(order.amountRub)}</div><OrderStatusBadge status={order.status} /></div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section aria-label="Открытые прогнозы клиента">
            <h4 className="text-sm font-extrabold text-slate-950">Открытые прогнозы ({accessiblePredictions.length})</h4>
            <p className="mt-1 text-[11px] text-slate-500">Список включает купленные и подаренные доступы.</p>
            {accessiblePredictions.length === 0 ? <p className="mt-3 text-xs text-slate-500">Нет открытых прогнозов.</p> : (
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-700">
                {accessiblePredictions.map(({ id, prediction }) => (
                  <li key={id} className="rounded-lg bg-slate-50 px-3 py-2">
                    {prediction ? `${prediction.homeTeam} — ${prediction.awayTeam} · ${prediction.leagueName}` : `Событие удалено · ${id}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

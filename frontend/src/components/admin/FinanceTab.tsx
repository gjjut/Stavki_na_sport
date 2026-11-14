'use client';

import React, { useMemo, useState } from 'react';
import { Download, ReceiptText, Search, Wallet } from 'lucide-react';
import { LocalDateTime } from '@/components/LocalDateTime';
import type { OrderTransaction, PayoutRequestRecord } from '@/server/types';
import { quoteBalanceRefund } from '@/lib/admin-finance-policy';
import { Badge, ConfirmDialog, EmptyState, SectionCard, type ToastKind } from './ui';
import { compareValues, escapeCsvCell, formatRub, nextSort, type SortState } from './admin-format';
import { OrderStatusBadge, SortableHeader } from './AdminTableHelpers';

type OrderSort = 'title' | 'buyer' | 'date' | 'amount' | 'status';

export function FinanceTab({
  transactions,
  payouts,
  onRefresh,
  onToast,
}: {
  transactions: OrderTransaction[];
  payouts: PayoutRequestRecord[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderTransaction['status']>('ALL');
  const [sort, setSort] = useState<SortState<OrderSort>>({ key: 'date', direction: 'desc' });
  const [refundTarget, setRefundTarget] = useState<OrderTransaction | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [payoutBusy, setPayoutBusy] = useState<string | null>(null);
  const [payoutTarget, setPayoutTarget] = useState<{ payout: PayoutRequestRecord; decision: 'PAID' | 'REJECTED' } | null>(null);

  const downloadOrdersCsv = () => {
    const rows = transactions;
    const header = [
      'ID заказа',
      'Дата и время',
      'Email покупателя',
      'Наименование',
      'Сумма (RUB)',
      'Способ оплаты',
      'Статус',
      'Промокод',
      'Возврат по страховке',
    ];
    const lines = [
      header.map(escapeCsvCell).join(';'),
      ...rows.map((r) =>
        [
          r.id,
          new Date(r.createdAt).toLocaleString('ru-RU'),
          r.userEmail,
          r.title,
          r.amountRub,
          r.paymentMethod === 'yookassa' ? 'ЮKassa (Карта/СБП)' : 'Внутренний баланс',
          r.status,
          r.promoCode || '',
          r.insuranceCredited ? 'Да' : 'Нет',
        ]
          .map(escapeCsvCell)
          .join(';'),
      ),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `valuex_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = transactions.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.title.toLowerCase().includes(q) ||
        o.userEmail.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q)
      );
    });
    const value = (order: OrderTransaction): string | number => {
      switch (sort.key) {
        case 'title': return order.title;
        case 'buyer': return order.userEmail;
        case 'date': return Date.parse(order.createdAt) || 0;
        case 'amount': return order.amountRub;
        case 'status': return order.status;
      }
    };
    return rows.sort((a, b) => compareValues(value(a), value(b), sort.direction) || a.id.localeCompare(b.id));
  }, [transactions, search, statusFilter, sort]);

  const processPayout = async () => {
    if (!payoutTarget || payoutBusy) return;
    const { payout, decision } = payoutTarget;
    setPayoutBusy(payout.id);
    try {
      const res = await fetch('/api/v1/admin/finance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'PROCESS_PAYOUT', payoutId: payout.id, decision }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `Не удалось обработать заявку (HTTP ${res.status})`);
      onToast(decision === 'PAID'
        ? 'Заявка отмечена как выплаченная. Перевод выполняется отдельно.'
        : 'Заявка отклонена, сумма возвращена на партнёрский счёт');
      setPayoutTarget(null);
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось обработать заявку', 'error');
    } finally {
      setPayoutBusy(null);
    }
  };

  const confirmRefund = async () => {
    if (!refundTarget || refunding) return;
    setRefunding(true);
    try {
      const res = await fetch('/api/v1/admin/finance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REFUND_ORDER', orderId: refundTarget.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; creditedRub?: number };
      if (!res.ok) throw new Error(json.error || `Не удалось выполнить возврат (HTTP ${res.status})`);
      onToast(typeof json.creditedRub === 'number'
        ? `На баланс клиента зачислено ${formatRub(json.creditedRub)}.`
        : 'Операция выполнена. Проверьте баланс клиента.');
      setRefundTarget(null);
      await onRefresh();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Не удалось выполнить возврат', 'error');
    } finally {
      setRefunding(false);
    }
  };

  const refundQuote = refundTarget ? quoteBalanceRefund(refundTarget) : null;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Заявки партнёров на выплату"
        subtitle="После перевода средств по реквизитам отметьте заявку оплаченной"
      >
        {payouts.length === 0 ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="Заявок на вывод пока нет" />
        ) : (
          <div className="divide-y divide-slate-100">
            {payouts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-black text-slate-950">
                      {formatRub(p.amountRub)}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                      {p.requisites}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {p.userEmail} · <LocalDateTime value={p.createdAt} format="full" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.status === 'PENDING' ? (
                    <>
                      <button
                        type="button"
                        disabled={payoutBusy !== null}
                        onClick={() => setPayoutTarget({ payout: p, decision: 'PAID' })}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Отметить выплаченной
                      </button>
                      <button
                        type="button"
                        disabled={payoutBusy !== null}
                        onClick={() => setPayoutTarget({ payout: p, decision: 'REJECTED' })}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        Отклонить
                      </button>
                    </>
                  ) : (
                    <Badge tone={p.status === 'PAID' ? 'emerald' : 'rose'}>
                      {p.status === 'PAID' ? 'Выплачено' : 'Отклонено'}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={`Реестр заказов (${filtered.length})`}
        subtitle="Все транзакции и возвраты страховки"
        action={
          <button
            type="button"
            onClick={downloadOrdersCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-white"
          >
            <Download className="h-3.5 w-3.5 text-blue-600" />
            Скачать CSV (все)
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 px-5 py-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию, email или ID…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap rounded-xl border border-slate-200 bg-white p-1">
            {(
              [
                ['ALL', 'Все'],
                ['SUCCEEDED', 'Оплачены'],
                ['REFUNDED', 'Возвраты'],
                ['PENDING', 'Ожидают'],
                ['CANCELED', 'Отменены'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                  statusFilter === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<ReceiptText className="h-5 w-5" />} title="Заказов не найдено" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <SortableHeader label="Заказ" active={sort.key === 'title'} direction={sort.direction} onSort={() => setSort((s) => nextSort(s, 'title'))} />
                  <SortableHeader label="Покупатель" active={sort.key === 'buyer'} direction={sort.direction} onSort={() => setSort((s) => nextSort(s, 'buyer'))} />
                  <SortableHeader label="Дата" active={sort.key === 'date'} direction={sort.direction} onSort={() => setSort((s) => nextSort(s, 'date', 'desc'))} />
                  <SortableHeader label="Сумма" active={sort.key === 'amount'} direction={sort.direction} onSort={() => setSort((s) => nextSort(s, 'amount', 'desc'))} />
                  <SortableHeader label="Статус" active={sort.key === 'status'} direction={sort.direction} onSort={() => setSort((s) => nextSort(s, 'status'))} />
                  <th className="px-5 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-900">{order.title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {order.promoCode && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                            {order.promoCode}
                          </span>
                        )}
                        {order.insuranceCredited && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            Страховка выплачена
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{order.userEmail}</td>
                    <td className="px-5 py-3 text-slate-500">
                      <LocalDateTime value={order.createdAt} format="full" />
                    </td>
                    <td className="px-5 py-3 font-mono font-black text-slate-950">
                      {formatRub(order.amountRub)}
                    </td>
                    <td className="px-5 py-3">
                      <OrderStatusBadge status={order.status} />
                      {order.refundDestination === 'BALANCE' && <div className="mt-1 text-[10px] text-slate-500">На баланс: {formatRub(order.refundBalanceAmountRub ?? 0)}</div>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {order.status === 'SUCCEEDED' && (quoteBalanceRefund(order).ok ? (
                        <button
                          type="button"
                          onClick={() => setRefundTarget(order)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                        >
                          Возврат на баланс
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400" title={(() => { const q = quoteBalanceRefund(order); return q.ok ? '' : q.reason; })()}>
                          Требуется ручная проверка
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={refundTarget !== null}
        title="Вернуть средства?"
        description={refundTarget && refundQuote?.ok
          ? `На внутренний баланс будет зачислено ${formatRub(refundQuote.creditRub)}${refundQuote.insuranceRub ? ` с учётом уже выплаченной страховки ${formatRub(refundQuote.insuranceRub)}` : ''}; доступ к прогнозам будет отозван. На карту или в ЮKassa этот возврат не отправляется.`
          : ''}
        confirmLabel="Вернуть на баланс"
        busy={refunding}
        onConfirm={confirmRefund}
        onCancel={() => { if (!refunding) setRefundTarget(null); }}
      />
      <ConfirmDialog
        open={payoutTarget !== null}
        title={payoutTarget?.decision === 'PAID' ? 'Отметить заявку выплаченной?' : 'Отклонить заявку?'}
        description={payoutTarget?.decision === 'PAID'
          ? `Убедитесь, что вы отдельно перевели ${formatRub(payoutTarget.payout.amountRub)} партнёру. Панель только изменит статус и не отправляет перевод.`
          : payoutTarget ? `${formatRub(payoutTarget.payout.amountRub)} вернётся на партнёрский счёт.` : ''}
        confirmLabel={payoutTarget?.decision === 'PAID' ? 'Отметить выплаченной' : 'Отклонить заявку'}
        danger={payoutTarget?.decision !== 'PAID'}
        busy={payoutBusy !== null}
        onConfirm={() => void processPayout()}
        onCancel={() => { if (!payoutBusy) setPayoutTarget(null); }}
      />
    </div>
  );
}

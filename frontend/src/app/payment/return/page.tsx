'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { OrderTransaction } from '@/server/types';

function PaymentReturnInner() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState<OrderTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError('Не указан номер заказа.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/billing/verify-return', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        });
        const json = (await res.json()) as { order?: OrderTransaction; error?: string };
        if (!res.ok || !json.order) {
          throw new Error(json.error || 'Не удалось проверить статус платежа');
        }
        if (!cancelled) setOrder(json.order);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Ошибка проверки заказа');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
        <h1 className="mt-4 text-lg font-extrabold text-slate-950">
          Проверяем оплату в ЮKassa...
        </h1>
        <p className="mt-1 text-xs text-slate-500">Подождите пару секунд.</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <XCircle className="mx-auto h-10 w-10 text-rose-500" />
        <h1 className="mt-4 text-lg font-extrabold text-slate-950">
          Не удалось подтвердить заказ
        </h1>
        <p className="mt-2 text-xs text-slate-500">{error}</p>
        <Link
          href="/cabinet"
          className="mt-6 inline-block rounded-xl bg-slate-900 px-6 py-3 text-xs font-bold text-white"
        >
          Перейти в мои покупки
        </Link>
      </div>
    );
  }

  const isPaid = order.status === 'SUCCEEDED';

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
      {isPaid ? (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-xl font-black text-slate-950">Оплата подтверждена!</h1>
          <p className="mt-1 text-xs text-slate-500">
            {order.title} · {order.amountRub.toLocaleString('ru-RU')} ₽
          </p>

          <Link
            href="/cabinet"
            className="mt-6 inline-block w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700"
          >
            Открыть прогноз в кабинете
          </Link>
        </>
      ) : (
        <>
          <XCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-4 text-xl font-extrabold text-slate-950">
            Статус: {order.status === 'CANCELED' ? 'Платеж отменен' : 'Ожидает подтверждения'}
          </h1>
          <p className="mt-2 text-xs text-slate-500">
            Если оплата прошла, событие появится в разделе «Мои покупки» в течение минуты.
          </p>
          <Link
            href="/cabinet"
            className="mt-6 inline-block w-full rounded-xl bg-slate-900 py-3 text-xs font-bold text-white"
          >
            Перейти в личный кабинет
          </Link>
        </>
      )}
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] px-4">
      <Suspense
        fallback={
          <div className="text-sm font-medium text-slate-500">
            Проверка результата платежа...
          </div>
        }
      >
        <PaymentReturnInner />
      </Suspense>
    </div>
  );
}

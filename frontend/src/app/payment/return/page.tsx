'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
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
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-400" />
        <h1 className="mt-4 text-lg font-bold text-white">Проверяем оплату в ЮKassa...</h1>
        <p className="mt-1 text-xs text-slate-400">Пожалуйста, подождите пару секунд.</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <XCircle className="mx-auto h-10 w-10 text-rose-400" />
        <h1 className="mt-4 text-lg font-bold text-white">Не удалось подтвердить заказ</h1>
        <p className="mt-2 text-xs text-slate-400">{error}</p>
        <Link
          href="/cabinet"
          className="mt-6 inline-block rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white"
        >
          В личный кабинет
        </Link>
      </div>
    );
  }

  const isPaid = order.status === 'SUCCEEDED';

  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
      {isPaid ? (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
          <h1 className="mt-4 text-xl font-extrabold text-white">Оплата принята</h1>
          <p className="mt-1 text-xs text-slate-400">
            {order.title} · {order.amountRub.toLocaleString('ru-RU')} ₽
          </p>

          {order.vipInviteLink && (
            <a
              href={order.vipInviteLink}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-sky-400"
            >
              <span>Перейти в закрытый VIP-канал Telegram</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          )}

          <Link
            href="/cabinet"
            className="mt-3 inline-block w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400"
          >
            Открыть в личном кабинете
          </Link>
        </>
      ) : (
        <>
          <XCircle className="mx-auto h-12 w-12 text-amber-400" />
          <h1 className="mt-4 text-xl font-bold text-white">
            Статус заказа: {order.status === 'CANCELED' ? 'Отменен' : 'Ожидает подтверждения'}
          </h1>
          <p className="mt-2 text-xs text-slate-400">
            Если средства были списаны, доступ активируется автоматически в течение минуты.
          </p>
          <Link
            href="/cabinet"
            className="mt-5 inline-block w-full rounded-xl bg-slate-800 py-3 text-sm font-semibold text-white"
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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <Suspense
        fallback={
          <div className="text-sm text-slate-400">Проверка результата платежа...</div>
        }
      >
        <PaymentReturnInner />
      </Suspense>
    </div>
  );
}

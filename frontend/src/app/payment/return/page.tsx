'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Check, CheckCircle2, Copy, Loader2, XCircle } from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import { trackMetrikaGoal } from '@/lib/metrika';
import type { OrderTransaction } from '@/server/types';

function PaymentReturnInner() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [order, setOrder] = useState<OrderTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedCreds, setSavedCreds] = useState<{
    email: string;
    generatedPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('valuex_new_credentials');
      if (raw) {
        setSavedCreds(JSON.parse(raw));
        sessionStorage.removeItem('valuex_new_credentials');
      }
    } catch {
      // ignore
    }
  }, []);

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
        const json = (await res.json()) as {
          order?: OrderTransaction;
          error?: string;
        };
        if (!res.ok || !json.order) {
          throw new Error(json.error || 'Не удалось проверить статус платежа');
        }
        if (!cancelled) {
          setOrder(json.order);
          if (json.order.status === 'SUCCEEDED') {
            trackMetrikaGoal('purchase_success', {
              amount: json.order.amountRub,
              kind: json.order.kind,
            });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Ошибка проверки заказа',
          );
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
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-xl sm:p-8">
      {isPaid ? (
        <>
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-xl font-black text-slate-950">
            Оплата подтверждена!
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {order.title} · {order.amountRub.toLocaleString('ru-RU')} ₽
          </p>

          {savedCreds && (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 text-left text-xs">
              <div className="font-extrabold text-slate-900">
                Сохраните данные вашего автоматически созданного кабинета:
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px] text-slate-500">
                    Логин:{' '}
                    <strong className="text-slate-900">
                      {savedCreds.email}
                    </strong>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Пароль:{' '}
                    <strong className="font-mono text-blue-700">
                      {savedCreds.generatedPassword}
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `Логин: ${savedCreds.email}\nПароль: ${savedCreds.generatedPassword}`,
                    );
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copied ? 'Скопировано' : 'Скопировать'}</span>
                </button>
              </div>
            </div>
          )}

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
            Статус:{' '}
            {order.status === 'CANCELED'
              ? 'Платеж отменен'
              : 'Ожидает подтверждения'}
          </h1>
          <p className="mt-2 text-xs text-slate-500">
            Если оплата прошла, событие появится в разделе «Мои прогнозы» в течение минуты.
          </p>
          <Link
            href="/cabinet"
            className="mt-6 inline-block w-full rounded-xl bg-slate-900 py-3 text-xs font-bold text-white"
          >
            Проверить в кабинете
          </Link>
        </>
      )}
    </div>
  );
}

export default function PaymentReturnPage() {
  const { data, reload } = usePublicPlatform();
  return (
    <SiteShell
      brand={data?.brand ?? null}
      viewer={data?.viewer ?? null}
      onViewerChange={() => reload()}
    >
      <div className="flex items-center justify-center px-4 py-12 sm:py-16">
        <Suspense fallback={null}>
          <PaymentReturnInner />
        </Suspense>
      </div>
    </SiteShell>
  );
}

'use client';

import React from 'react';
import { SiteShell } from '@/components/layout/SiteShell';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';

export default function LegalOfferPage() {
  const { data, loading, reload } = usePublicPlatform();

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F6FA] text-sm text-slate-500">
        Загрузка документа...
      </div>
    );
  }

  return (
    <SiteShell brand={data.brand} viewer={data.viewer} onViewerChange={() => reload()}>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
            Правовой документ
          </div>
          <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">
            Публичная оферта на разовое предоставление аналитических материалов
          </h1>
          <p className="mt-2 text-xs text-slate-400">
            Действующая редакция сервиса {data.brand.brandName}
          </p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-600">
            <section>
              <h2 className="text-base font-extrabold text-slate-950">
                1. Общие положения
              </h2>
              <p className="mt-2">
                Настоящий документ является публичной офертой (ст. 437 ГК РФ) со стороны исполнителя ({data.brand.legalSellerName}, {data.brand.legalInn}) по предоставлению разового платного доступа к авторским информационно-аналитическим обзорам отдельных спортивных событий.
              </p>
            </section>

            <section>
              <h2 className="text-base font-extrabold text-slate-950">
                2. Предмет договора и отсутствие гарантий выигрыша
              </h2>
              <p className="mt-2">
                Исполнитель предоставляет Заказчику доступ к выбранному Заказчиком аналитическому разбору конкретного спортивного матча в Личном кабинете на Сайте.
              </p>
              <p className="mt-2">
                Материалы отражают аналитическое мнение авторов на основе статистики. Сервис <strong>не является букмекерской конторой</strong>, не организует азартные игры, не принимает ставки и не гарантирует наступление спортивного исхода.
              </p>
            </section>

            <section>
              <h2 className="text-base font-extrabold text-slate-950">
                3. Порядок разовой оплаты
              </h2>
              <p className="mt-2">
                Стоимость каждого аналитического материала указана непосредственно на карточке соответствующего события в рублях РФ. Оплата производится разовым платежом без автоматических списаний и подписок через платежный сервис ЮKassa (банковские карты МИР, СБП) либо с предварительно пополненного внутреннего кошелька кабинета с отправкой чека 54-ФЗ.
              </p>
            </section>

            <section>
              <h2 className="text-base font-extrabold text-slate-950">
                4. Момент оказания услуги, страховка на баланс и возвраты
              </h2>
              <p className="mt-2">
                Услуга по предоставлению разового информационного материала считается оказанной в полном объеме в момент раскрытия закрытого текста прогноза в Личном кабинете Заказчика до начала спортивного события.
              </p>
              <p className="mt-2">
                Если карточка события отмечена знаком «Страховка 100% на баланс при минусе», то при официальном расчете рекомендованного исхода как проигрыш или возврат система автоматически начисляет эквивалент оплаченной стоимости данного события на внутренний баланс Личного кабинета Заказчика для приобретения любых последующих аналитических материалов. В случае отмены официального спортивного матча возврат средств осуществляется в полном объеме по обращению на {data.brand.supportEmail}.
              </p>
            </section>

            <section>
              <h2 className="text-base font-extrabold text-slate-950">
                5. Реквизиты исполнителя
              </h2>
              <p className="mt-2">
                {data.brand.legalSellerName} ({data.brand.legalInn})
                <br />
                Электронная почта поддержки: {data.brand.supportEmail}
              </p>
            </section>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}

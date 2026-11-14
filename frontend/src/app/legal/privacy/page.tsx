'use client';

import React from 'react';
import { SiteShell } from '@/components/layout/SiteShell';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';

export default function LegalPrivacyPage() {
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
            Политика обработки персональных данных (152-ФЗ)
          </h1>
          <p className="mt-2 text-xs text-slate-400">
            Оператор: {data.brand.legalSellerName} ({data.brand.legalInn})
          </p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-600">
            <section>
              <h2 className="text-base font-extrabold text-slate-950">
                1. Объем обрабатываемых данных
              </h2>
              <p className="mt-2">
                Для создания учетной записи, сохранения приобретенных разовых прогнозов и отправки кассовых чеков 54-ФЗ обрабатываются: адрес электронной почты, имя пользователя и защищенный файл cookie авторизационной сессии.
              </p>
            </section>

            <section>
              <h2 className="text-base font-extrabold text-slate-950">
                2. Безопасность платежей
              </h2>
              <p className="mt-2">
                Сервис не запрашивает и не хранит номера банковских карт. Оплата осуществляется на стороне лицензированного платежного оператора ЮKassa по стандарту безопасности PCI DSS.
              </p>
            </section>

            <section>
              <h2 className="text-base font-extrabold text-slate-950">
                3. Хранение и удаление данных
              </h2>
              <p className="mt-2">
                База данных сервиса располагается на территории РФ. Пароли хранятся исключительно в виде криптографических хешей с солью. По обращению на {data.brand.supportEmail} учетная запись удаляется в установленный законом срок.
              </p>
            </section>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}

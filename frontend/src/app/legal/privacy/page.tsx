'use client';

import React from 'react';
import { SiteShell } from '@/components/layout/SiteShell';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';

export default function LegalPrivacyPage() {
  const { data, loading, reload } = usePublicPlatform();

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Загрузка документа...
      </div>
    );
  }

  return (
    <SiteShell brand={data.brand} viewer={data.viewer} onViewerChange={() => reload()}>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
          Политика обработки персональных данных (152-ФЗ)
        </h1>
        <p className="mt-2 text-xs text-slate-500">
          Оператор: {data.brand.legalSellerName} ({data.brand.legalInn})
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-300">
          <section>
            <h2 className="text-base font-bold text-white">1. Какие данные собираются</h2>
            <p className="mt-2">
              Для создания личного кабинета, предоставления доступа к приобретенным аналитическим материалам и отправки кассовых чеков в соответствии с 54-ФЗ мы обрабатываем: адрес электронной почты, указанное пользователем имя, привязанный идентификатор в мессенджере Telegram (по желанию пользователя) и файлы cookie авторизационной сессии.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">
              2. Безопасность платежной информации
            </h2>
            <p className="mt-2">
              Наш сервер не собирает и не хранит полные реквизиты банковских карт пользователей. Ввод платежных данных осуществляется на защищенной странице платежного оператора ЮKassa по стандарту PCI DSS.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">
              3. Хранение и защита учетных записей
            </h2>
            <p className="mt-2">
              База данных сервиса размещена на территории Российской Федерации. Пароли пользователей хранятся исключительно в виде криптографических хешей с индивидуальной солью. По запросу на {data.brand.supportEmail} учетная запись и связанные данные удаляются в установленный законом срок.
            </p>
          </section>
        </div>
      </div>
    </SiteShell>
  );
}

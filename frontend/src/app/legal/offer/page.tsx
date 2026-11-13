'use client';

import React from 'react';
import { SiteShell } from '@/components/layout/SiteShell';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';

export default function LegalOfferPage() {
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
          Публичная оферта на оказание информационно-аналитических услуг
        </h1>
        <p className="mt-2 text-xs text-slate-500">
          Редакция действительна для всех пользователей сервиса {data.brand.brandName}.PRO
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-300">
          <section>
            <h2 className="text-base font-bold text-white">1. Общие положения</h2>
            <p className="mt-2">
              Настоящий документ является официальным предложением (публичной офертой) в соответствии со ст. 437 Гражданского кодекса РФ со стороны исполнителя ({data.brand.legalSellerName}, {data.brand.legalInn}) по предоставлению платного доступа к авторским информационно-аналитическим материалам в области спортивной статистики.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">
              2. Предмет договора и характер материалов
            </h2>
            <p className="mt-2">
              Исполнитель предоставляет Заказчику доступ к закрытым аналитическим обзорам спортивных матчей на Сайте и/или в закрытом информационном канале мессенджера Telegram на условиях выбранного тарифа или разового заказа.
            </p>
            <p className="mt-2">
              Все размещаемые материалы отражают субъективное аналитическое мнение авторов, основанное на математической статистике. Сервис <strong>не является букмекерской конторой</strong>, не принимает денежные ставки, не выплачивает выигрыши и не гарантирует наступление того или иного спортивного исхода.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">
              3. Стоимость услуг, оплата и рекуррентные платежи
            </h2>
            <p className="mt-2">
              Актуальные цены на разовые материалы и тарифы подписки опубликованы на странице «Тарифы VIP». Оплата осуществляется в рублях РФ через платежный сервис ЮKassa (банковские карты МИР, СБП, электронные кошельки) с формированием электронного кассового чека в соответствии с 54-ФЗ.
            </p>
            <p className="mt-2">
              При оформлении подписки с отметкой об автоматическом продлении списание стоимости следующего расчетного периода происходит автоматически. Пользователь вправе самостоятельно отключить автопродление в любой момент в разделе «Личный кабинет».
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">
              4. Момент исполнения услуги и порядок возвратов
            </h2>
            <p className="mt-2">
              Информационная услуга по предоставлению разового аналитического материала считается оказанной в момент открытия закрытого текста обзора в Личном кабинете Заказчика до начала спортивного события. По подписочным тарифам возврат возможен за неиспользованный период за вычетом фактически оказанных информационных услуг по обращению на {data.brand.supportEmail}.
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold text-white">5. Реквизиты и контакты</h2>
            <p className="mt-2">
              Исполнитель: {data.brand.legalSellerName} ({data.brand.legalInn})
              <br />
              Электронная почта поддержки: {data.brand.supportEmail}
            </p>
          </section>
        </div>
      </div>
    </SiteShell>
  );
}

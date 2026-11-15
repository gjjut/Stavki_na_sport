'use client';

import React from 'react';
import Link from 'next/link';
import { SiteShell, type PublicBrandInfo } from '@/components/layout/SiteShell';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import { LEGAL_DOCUMENT_VERSION_LABEL } from '@/lib/legal-version';
import { isPlaceholderLegalInn } from '@/lib/plain-russian';

export function LegalDocument({ title, children }: {
  title: string;
  children: (brand: PublicBrandInfo | null) => React.ReactNode;
}) {
  const { data, error, reload } = usePublicPlatform();
  return (
    <SiteShell brand={data?.brand ?? null} viewer={data?.viewer ?? null} onViewerChange={() => reload()}>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link href="/" className="text-xs font-semibold text-blue-700 hover:underline">← На главную</Link>
        <article className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-10">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-600">Документы сервиса</div>
          <h1 className="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">{title}</h1>
          <p className="mt-3 text-xs text-slate-500">Редакция от {LEGAL_DOCUMENT_VERSION_LABEL}</p>
          {error && <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Сведения об исполнителе временно недоступны. Попробуйте обновить страницу.</p>}
          <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">{children(data?.brand ?? null)}</div>
        </article>
      </div>
    </SiteShell>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-2"><h2 className="text-base font-extrabold leading-snug text-slate-950">{title}</h2>{children}</section>;
}

export function LegalContacts({ brand }: { brand: PublicBrandInfo | null }) {
  const valid = brand && !isPlaceholderLegalInn(brand.legalSellerName, brand.legalInn);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7">
      <p><strong>Исполнитель / оператор:</strong> {valid ? brand.legalSellerName : 'сведения не опубликованы'}</p>
      <p><strong>ИНН:</strong> {valid ? brand.legalInn : 'не указан'}</p>
      <p><strong>Адрес для обращений:</strong> {brand?.legalAddress?.trim() || 'не указан'}</p>
      {brand?.legalRegistrationNumber?.trim() && <p><strong>ОГРН / ОГРНИП:</strong> {brand.legalRegistrationNumber}</p>}
      <p><strong>Электронная почта:</strong> {brand?.supportEmail ? <a className="break-all text-blue-700 underline" href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a> : 'не указана'}</p>
      {brand?.supportTelegram && <p><strong>Поддержка:</strong> <a className="break-all text-blue-700 underline" href={brand.supportTelegram} target="_blank" rel="noreferrer">Telegram</a></p>}
      {brand && (!valid || !brand.legalAddress?.trim() || !brand.supportEmail?.trim()) && (
        <p className="mt-2 font-semibold text-amber-800">Не все сведения исполнителя заполнены. Пожалуйста, уточните их у поддержки до покупки.</p>
      )}
    </div>
  );
}

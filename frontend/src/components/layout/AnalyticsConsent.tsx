'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import {
  ANALYTICS_CHOICE_EVENT,
  ANALYTICS_STORAGE_KEY,
  readAnalyticsChoice,
  saveAnalyticsChoice,
  type AnalyticsChoice,
} from '@/lib/analytics-consent';

export function openAnalyticsSettings() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('valuex:analytics-settings'));
}

/** Stays mounted in the root layout, including pages without SiteShell. */
export function AnalyticsConsentMonitor() {
  useEffect(() => {
    const check = () => {
      if (readAnalyticsChoice() !== 'allow' && window.__valuexMetrikaLoaded) {
        // Stop our own goals immediately; a loaded third-party script needs a
        // fresh document to stop its listeners. This also handles localStorage.clear().
        delete window.__valuexMetrikaId;
        window.location.reload();
        return;
      }
      window.dispatchEvent(new Event(ANALYTICS_CHOICE_EVENT));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ANALYTICS_STORAGE_KEY || event.key === null) check();
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibility);
    // A same-tab localStorage.clear() does not emit a storage event in this tab.
    // Recheck a loaded counter so it is removed even without a focus change.
    const timer = window.setInterval(() => { if (window.__valuexMetrikaLoaded) check(); }, 5_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return null;
}

export function AnalyticsConsent({ counterId }: { counterId: number }) {
  const [choice, setChoice] = useState<AnalyticsChoice>('loading');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const hasCounter = Number.isSafeInteger(counterId) && counterId > 0;

  useEffect(() => {
    setChoice(readAnalyticsChoice());
    const onSettings = () => setSettingsOpen(true);
    const onChoice = () => setChoice(readAnalyticsChoice());
    window.addEventListener('valuex:analytics-settings', onSettings);
    window.addEventListener(ANALYTICS_CHOICE_EVENT, onChoice);
    return () => {
      window.removeEventListener('valuex:analytics-settings', onSettings);
      window.removeEventListener(ANALYTICS_CHOICE_EVENT, onChoice);
    };
  }, []);

  useEffect(() => {
    if (choice === 'allow' && hasCounter) {
      window.__valuexMetrikaId = counterId;
      return () => {
        if (window.__valuexMetrikaId === counterId) delete window.__valuexMetrikaId;
      };
    }
    delete window.__valuexMetrikaId;
  }, [choice, counterId, hasCounter]);

  const choose = (next: 'allow' | 'deny') => {
    const saved = saveAnalyticsChoice(next);
    setStorageError(!saved);
    if (!saved) {
      delete window.__valuexMetrikaId;
      setChoice('ask');
      setSettingsOpen(true);
      if (window.__valuexMetrikaLoaded) window.location.reload();
      return;
    }
    setSettingsOpen(false);
    if (next === 'deny') {
      delete window.__valuexMetrikaId;
      setChoice('deny');
      if (choice === 'allow' || window.__valuexMetrikaLoaded) {
        window.location.reload();
      }
    } else {
      setChoice('allow');
    }
  };

  if (!hasCounter) return null;
  return (
    <>
      {choice === 'allow' && (
        <Script
          id={`ym-counter-${counterId}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: `
            window.__valuexMetrikaId = ${counterId};
            window.__valuexMetrikaLoaded = true;
            (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
            ym(${counterId},"init",{clickmap:false,trackLinks:true,accurateTrackBounce:true,webvisor:false});
          ` }}
        />
      )}
      {(choice === 'ask' || settingsOpen) && (
        <div role="region" aria-label="Настройки аналитических cookies" className="fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 text-slate-700 shadow-2xl sm:bottom-4 sm:flex sm:items-center sm:gap-5 sm:p-5">
          <p className="text-xs leading-relaxed sm:flex-1">
            Необязательная Яндекс.Метрика помогает улучшать сайт и использует cookies. Без согласия она не запускается. Вы можете отказаться и изменить выбор внизу страницы. <Link href="/legal/privacy" className="font-semibold text-blue-700 underline">Подробнее</Link>.
            {storageError && <span role="alert" className="mt-1 block font-semibold text-rose-700">Не удалось сохранить выбор в браузере, поэтому аналитика не запущена.</span>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-0 sm:shrink-0">
            <button type="button" onClick={() => choose('deny')} className="min-h-10 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Отказаться</button>
            <button type="button" onClick={() => choose('allow')} className="min-h-10 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">Разрешить аналитику</button>
          </div>
        </div>
      )}
    </>
  );
}

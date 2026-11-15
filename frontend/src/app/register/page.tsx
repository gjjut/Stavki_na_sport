'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import { PublicLoadError } from '@/components/layout/PublicLoadError';
import { LEGAL_DOCUMENT_VERSION } from '@/lib/legal-version';
import { isBrowserSessionConfirmed } from '@/lib/client-session';
import { openTelegramExternalLink } from '@/lib/embedded-browser';

export default function RegisterPage() {
  const router = useRouter();
  const { data, error: publicError, reload } = usePublicPlatform();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [personalDataConsent, setPersonalDataConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || accountCreated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email, city, password, rulesAccepted, personalDataConsent, legalVersion: LEGAL_DOCUMENT_VERSION }),
      });
      const json = (await res.json()) as { user?: { id: string }; error?: string };
      if (!res.ok) {
        throw new Error(json.error || 'Не удалось создать аккаунт');
      }
      setAccountCreated(true);
      if (!(await isBrowserSessionConfirmed(json.user?.id))) {
        throw new Error('Аккаунт создан, но вход не удалось подтвердить. Не регистрируйтесь повторно: откройте сайт в браузере и войдите с указанными почтой и паролем.');
      }
      router.push('/cabinet');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SiteShell
      brand={data?.brand ?? null}
      viewer={data?.viewer ?? null}
      onViewerChange={() => reload()}
    >
      <PublicLoadError message={publicError} onRetry={() => void reload()} />
      <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-10 sm:py-14">
        <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
          <div className="hero-surface px-6 py-5 text-white sm:px-7">
            <div className="flex items-center gap-2 text-blue-400">
              <UserPlus className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Быстрая регистрация
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-black">Создание кабинета</h1>
          </div>

          <div className="p-6 sm:p-7">
            <p className="text-xs leading-relaxed text-slate-500">
              В кабинете сохраняются покупки, баланс и история начислений. Прогнозы не гарантируют выигрыша.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
              <div>
                <label htmlFor="register-name" className="block text-xs font-bold text-slate-700">
                  Ваше имя
                </label>
                <input
                  type="text"
                  required
                  id="register-name"
                  autoComplete="name"
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Алексей"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="register-email" className="block text-xs font-bold text-slate-700">
                  Электронная почта (для чека 54-ФЗ)
                </label>
                <input
                  type="email"
                  required
                  id="register-email"
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.ru"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="register-city" className="block text-xs font-bold text-slate-700">
                  Город (необязательно)
                </label>
                <input
                  type="text"
                  id="register-city"
                  autoComplete="address-level2"
                  maxLength={80}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Москва"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="register-password" className="block text-xs font-bold text-slate-700">
                  Пароль (от 10 символов)
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  maxLength={256}
                  autoComplete="new-password"
                  id="register-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                <input type="checkbox" required checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                <span>Мне исполнилось 18 лет, я принимаю <Link href="/legal/rules" target="_blank" className="font-semibold text-blue-700 underline">правила сайта</Link>.</span>
              </label>
              <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-700">
                <input type="checkbox" required checked={personalDataConsent} onChange={(e) => setPersonalDataConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
                <span>Даю отдельное <Link href="/legal/consent" target="_blank" className="font-semibold text-blue-700 underline">согласие на обработку персональных данных</Link> для создания и обслуживания кабинета.</span>
              </label>

              {error && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-600">
                  {error}
                  {accountCreated && (
                    <a href="/login" target="_blank" rel="noopener noreferrer"
                      onClick={(event) => { if (openTelegramExternalLink('/login')) event.preventDefault(); }}
                      className="mt-2 block font-bold underline">
                      Открыть сайт для входа
                    </a>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || accountCreated}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Зарегистрироваться</span>
              </button>
            </form>

            <p className="mt-4 text-center text-[11px] text-slate-500">
              Подробнее об обработке данных — в <Link href="/legal/privacy" className="underline hover:text-blue-700">политике конфиденциальности</Link>. Оферта принимается при оформлении заказа.
            </p>

            <div className="mt-4 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
              Уже есть аккаунт?{' '}
              <Link
                href="/login"
                className="font-bold text-blue-600 hover:underline"
              >
                Войти
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}

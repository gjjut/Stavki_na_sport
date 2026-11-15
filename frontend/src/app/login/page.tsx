'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import { SiteShell } from '@/components/layout/SiteShell';
import { usePublicPlatform } from '@/hooks/usePublicPlatform';
import { PublicLoadError } from '@/components/layout/PublicLoadError';
import { isBrowserSessionConfirmed } from '@/lib/client-session';
import { openTelegramExternalLink } from '@/lib/embedded-browser';
import type { SafeSessionUser } from '@/server/types';

export default function LoginPage() {
  const router = useRouter();
  const { data, error: publicError, reload } = usePublicPlatform();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionUnconfirmed, setSessionUnconfirmed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSessionUnconfirmed(false);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as {
        user?: SafeSessionUser;
        error?: string;
      };
      if (!res.ok || !json.user) {
        throw new Error(json.error || 'Не удалось войти');
      }
      if (!(await isBrowserSessionConfirmed(json.user.id))) {
        setSessionUnconfirmed(true);
        throw new Error('Вход не удалось подтвердить: браузер мог заблокировать cookies или связь прервалась. Откройте сайт в браузере и войдите там.');
      }
      router.push(json.user.role === 'ADMIN' ? '/admin' : '/cabinet');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка авторизации');
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
      <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-10 sm:py-16">
        <div className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
          <div className="hero-surface px-6 py-5 text-white sm:px-7">
            <div className="flex items-center gap-2 text-blue-400">
              <Lock className="h-4 w-4" />
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Личный кабинет
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-black">Вход в аккаунт</h1>
          </div>

          <div className="p-6 sm:p-7">
            <p className="text-xs leading-relaxed text-slate-500">
              Открытые прогнозы, начисления по программе «страховка» и баланс доступны после входа.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-bold text-slate-700">
                  Электронная почта
                </label>
                <input
                  type="email"
                  required
                  id="login-email"
                  autoComplete="email"
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.ru"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-xs font-bold text-slate-700">
                    Пароль
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Забыли пароль?
                  </Link>
                </div>
                <input
                  type="password"
                  required
                  id="login-password"
                  autoComplete="current-password"
                  maxLength={256}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-600">
                  {error}
                  {sessionUnconfirmed && (
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
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Войти</span>
              </button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
              Впервые у нас?{' '}
              <Link
                href="/register"
                className="font-bold text-blue-600 hover:underline"
              >
                Создать аккаунт
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}

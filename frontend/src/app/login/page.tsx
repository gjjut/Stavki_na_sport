'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import type { SafeSessionUser } from '@/server/types';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = (await res.json()) as { user?: SafeSessionUser; error?: string };
      if (!res.ok || !json.user) {
        throw new Error(json.error || 'Не удалось войти');
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F4F6FA] px-4 py-12">
      <Link href="/" className="mb-7 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B0F19] font-mono text-xs font-black text-white">
          VX
        </div>
        <span className="text-xl font-black tracking-tight text-slate-950">
          VALUEX<span className="text-blue-600">.</span>
        </span>
      </Link>

      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
        <div className="bg-[#0B0F19] px-7 py-5 text-white">
          <div className="flex items-center gap-2 text-blue-400">
            <Lock className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Личный кабинет
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black">Вход в аккаунт</h1>
        </div>

        <div className="p-7">
          <p className="text-xs text-slate-500">
            Все приобретенные вами события и баланс кошелька доступны после входа.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700">
                Электронная почта
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.ru"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700">Пароль</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-600">
                {error}
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
            <Link href="/register" className="font-bold text-blue-600 hover:underline">
              Создать аккаунт
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

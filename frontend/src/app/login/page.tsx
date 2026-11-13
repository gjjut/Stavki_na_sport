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
      if (json.user.role === 'ADMIN') {
        router.push('/admin');
      } else {
        router.push('/cabinet');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 font-mono text-sm font-black text-slate-950">
          +EV
        </div>
        <span className="text-xl font-extrabold text-white">
          VALUEX<span className="text-emerald-400">.PRO</span>
        </span>
      </Link>

      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <div className="flex items-center gap-2 text-emerald-400">
          <Lock className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Личный кабинет
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold text-white">Вход в аккаунт</h1>
        <p className="mt-1 text-xs text-slate-400">
          Введите email и пароль для доступа к купленным прогнозам и VIP-подписке
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300">
              Электронная почта
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.ru"
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">Пароль</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>Войти</span>
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-4 text-center text-xs text-slate-400">
          Еще нет аккаунта?{' '}
          <Link href="/register" className="font-semibold text-emerald-400 hover:underline">
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  );
}

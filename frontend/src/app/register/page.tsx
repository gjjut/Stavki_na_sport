'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email, city, password }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || 'Не удалось создать аккаунт');
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
          <UserPlus className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Новый клиент
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold text-white">Создание аккаунта</h1>
        <p className="mt-1 text-xs text-slate-400">
          Личный кабинет для хранения покупок, приглашения в VIP-канал и реферальной программы
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300">Ваше имя</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Алексей"
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">
              Электронная почта (для чеков 54-ФЗ)
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
            <label className="block text-xs font-semibold text-slate-300">
              Город (необязательно)
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Москва"
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300">
              Пароль (минимум 6 символов)
            </label>
            <input
              type="password"
              required
              minLength={6}
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
            <span>Зарегистрироваться</span>
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          Регистрируясь, вы принимаете условия{' '}
          <Link href="/legal/offer" className="underline hover:text-slate-300">
            оферты
          </Link>{' '}
          и{' '}
          <Link href="/legal/privacy" className="underline hover:text-slate-300">
            политики конфиденциальности
          </Link>
          .
        </p>

        <div className="mt-4 border-t border-slate-800 pt-4 text-center text-xs text-slate-400">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="font-semibold text-emerald-400 hover:underline">
            Войти
          </Link>
        </div>
      </div>
    </div>
  );
}

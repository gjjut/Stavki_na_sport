'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Loader2, Send } from 'lucide-react';
import type { SafeSessionUser } from '@/server/types';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'EMAIL' | 'CODE'>('EMAIL');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [supportUrl, setSupportUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfoMsg(null);
    setSupportUrl(null);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REQUEST_CODE', email }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        sentViaTelegram?: boolean;
        needSupport?: boolean;
        supportTelegram?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || 'Ошибка запроса кода');
      }
      if (json.sentViaTelegram) {
        setStep('CODE');
        setInfoMsg(
          json.message || 'Код отправлен в ваш привязанный Telegram!',
        );
      } else {
        setInfoMsg(
          json.message ||
            'Напишите в поддержку для быстрого восстановления доступа.',
        );
        if (json.supportTelegram) setSupportUrl(json.supportTelegram);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка восстановления');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONFIRM_RESET',
          email,
          code,
          newPassword,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        user?: SafeSessionUser;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Не удалось сменить пароль');
      }
      router.push(json.user?.role === 'ADMIN' ? '/admin' : '/cabinet');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка проверки кода');
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
            <KeyRound className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              Восстановление доступа
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black">Сброс пароля</h1>
        </div>

        <div className="p-7">
          {step === 'EMAIL' ? (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <p className="text-xs leading-relaxed text-slate-500">
                Введите E-mail вашего кабинета. Если у вас подключены уведомления в Telegram — 6-значный код придет мгновенно в личку бота.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Ваш E-mail
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@mail.ru"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              {infoMsg && (
                <div className="space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-slate-800">
                  <p className="font-medium leading-relaxed">{infoMsg}</p>
                  {supportUrl && (
                    <a
                      href={supportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 font-bold text-white hover:bg-blue-700"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Написать в поддержку в Telegram</span>
                    </a>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Получить код восстановления</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset} className="space-y-4">
              {infoMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
                  {infoMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  6-значный код из Telegram
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-center font-mono text-lg font-black tracking-widest text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Придумайте новый пароль (от 6 символов)
                </label>
                <input
                  type="password"
                  minLength={6}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Новый пароль..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/25 hover:bg-blue-700 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Сохранить пароль и войти</span>
              </button>
            </form>
          )}

          <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 font-bold text-slate-700 hover:text-blue-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Вернуться ко входу</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

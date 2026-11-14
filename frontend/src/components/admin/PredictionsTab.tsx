'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Pencil, Plus, Search, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { LocalDateTime } from '@/components/LocalDateTime';
import { TeamAvatar } from '@/components/predictions/TeamAvatar';
import { dateTimeLocalInputToIso, toDateTimeLocalInputValue } from '@/lib/date-time';
import type { AccessTier, PredictionRecord, SportType } from '@/server/types';
import { formatRub } from './admin-format';
import { Badge, ConfirmDialog, EmptyState, Field, Modal, SectionCard, inputCls, inputMonoCls, type ToastKind } from './ui';

const LEAGUE_PRESETS: Array<{ label: string; sport: SportType; league: string }> = [
  { label: 'ЛЧ УЕФА', sport: 'FOOTBALL', league: 'Лига Чемпионов УЕФА' },
  { label: 'АПЛ', sport: 'FOOTBALL', league: 'Англия · Премьер-лига' },
  { label: 'РПЛ', sport: 'FOOTBALL', league: 'Россия · Мир РПЛ' },
  { label: 'КХЛ', sport: 'HOCKEY', league: 'КХЛ · Регулярный сезон' },
  { label: 'НХЛ', sport: 'HOCKEY', league: 'NHL · Регулярный чемпионат' },
  { label: 'ATP Tour', sport: 'TENNIS', league: 'ATP Masters 1000' },
  { label: 'CS2 Tier-1', sport: 'ESPORTS', league: 'CS2 · BLAST Premier' },
  { label: 'UFC', sport: 'MMA', league: 'UFC · Номерной турнир' },
];

function getAdminMatchStatusLabel(prediction: PredictionRecord): string {
  switch (prediction.matchLifecycleStatus) {
    case 'SCHEDULED':
      return 'Запланирован';
    case 'LIVE':
      return 'LIVE';
    case 'FINISHED':
      return 'Завершён';
    case 'POSTPONED':
      return 'Перенесён';
    case 'CANCELLED':
      return 'Отменён';
    case 'UNKNOWN':
      return 'Статус не подтверждён';
    default:
      return prediction.matchStatus === 'LIVE'
        ? 'LIVE'
        : prediction.matchStatus === 'FINISHED'
          ? 'Завершён'
          : 'Предстоящий';
  }
}

type BulkDeleteIssue = { id: string; label: string; message: string };

const unknownResultMessage =
  'Ответ сервера не получен. Результат неизвестен — обновите данные и проверьте событие перед повтором.';

async function responseError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof payload?.error === 'string' && payload.error.trim()
    ? payload.error
    : `${fallback} (HTTP ${response.status})`;
}

export function PredictionsTab({
  predictions,
  initialSearch = '',
  initialPredictionId,
  defaultPrice,
  onRefresh,
  onToast,
}: {
  predictions: PredictionRecord[];
  initialSearch?: string;
  initialPredictionId?: string;
  defaultPrice: number;
  onRefresh: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState(initialSearch);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'SETTLED'>('ALL');
  const [sportFilter, setSportFilter] = useState<SportType | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkReport, setBulkReport] = useState<{ deleted: number; issues: BulkDeleteIssue[] } | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ item: PredictionRecord; value: string } | null>(null);
  const [savingPrice, setSavingPrice] = useState(false);
  const [insuranceBusyIds, setInsuranceBusyIds] = useState<Set<string>>(new Set());
  const insuranceRequests = useRef(new Set<string>());
  const [deleteTarget, setDeleteTarget] = useState<PredictionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settling, setSettling] = useState(false);

  const PAGE_SIZE = 15;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return predictions.filter((p) => {
      if (filter === 'PENDING' && p.resultStatus !== 'PENDING') return false;
      if (filter === 'SETTLED' && p.resultStatus === 'PENDING') return false;
      if (sportFilter !== 'ALL' && p.sport !== sportFilter) return false;
      if (!q) return true;
      if (initialPredictionId && q === initialPredictionId.toLowerCase()) return p.id === initialPredictionId;
      return (
        p.id.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.homeTeam.toLowerCase().includes(q) ||
        p.awayTeam.toLowerCase().includes(q) ||
        p.leagueName.toLowerCase().includes(q) ||
        p.selectionTitle.toLowerCase().includes(q)
      );
    });
  }, [predictions, search, filter, sportFilter, initialPredictionId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, filter, sportFilter]);

  useEffect(() => {
    const availableIds = new Set(predictions.map((prediction) => prediction.id));
    setSelectedIds((current) => {
      const remaining = [...current].filter((id) => availableIds.has(id));
      return remaining.length === current.size ? current : new Set(remaining);
    });
  }, [predictions]);

  const refreshAfterAction = async () => {
    try {
      await onRefresh();
    } catch {
      onToast('Не удалось обновить список. Данные могут быть устаревшими.', 'error');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const pageIds = paged.map((p) => p.id);
      const allSelected = pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const confirmBulkDelete = async () => {
    if (bulkDeleting || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const labels = new Map(predictions.map((p) => [p.id, `${p.homeTeam} — ${p.awayTeam}`]));
    const deletedIds = new Set<string>();
    const issues: BulkDeleteIssue[] = [];
    const addIssue = (id: string, message: string) => {
      issues.push({ id, label: labels.get(id) ?? id, message });
    };

    setBulkDeleting(true);
    setBulkReport(null);
    try {
      for (const [index, id] of ids.entries()) {
        try {
          const res = await fetch(`/api/v1/admin/predictions?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
          });
          if (res.ok) deletedIds.add(id);
          else addIssue(id, await responseError(res, 'Не удалось удалить событие'));
        } catch {
          addIssue(id, unknownResultMessage);
          ids.slice(index + 1).forEach((remainingId) =>
            addIssue(remainingId, 'Запрос не отправлен: пакет остановлен после потери связи.'),
          );
          break;
        }
      }
      setSelectedIds((current) => new Set([...current].filter((id) => !deletedIds.has(id))));
      setBulkReport({ deleted: deletedIds.size, issues });
      setBulkDeleteOpen(false);
      if (issues.length) {
        onToast(`Удалено: ${deletedIds.size}; не подтверждено или не отправлено: ${issues.length}. Подробности в отчёте.`, 'error');
      } else {
        onToast(`Удалено событий: ${deletedIds.size}`);
      }
      await refreshAfterAction();
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleVerifiedSettlementCycle = async () => {
    if (settling) return;
    setSettling(true);
    try {
      const res = await fetch('/api/v1/admin/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RUN_SETTLE_NOW' }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        checkedCount?: number;
        settledCount?: number;
        compensatedBuyers?: number;
        error?: string;
      };
      if (!res.ok) {
        onToast(json.error || `Не удалось проверить результаты (HTTP ${res.status})`, 'error');
        return;
      }
      onToast(
        (json.settledCount ?? 0) > 0
          ? `Рассчитано матчей: ${json.settledCount}; страховок выплачено: ${json.compensatedBuyers ?? 0}.`
          : `Новых расчётов нет. Проверено событий: ${json.checkedCount ?? 0}.`,
      );
      await refreshAfterAction();
    } catch {
      onToast('Ответ о расчёте не получен. Обновите данные и проверьте результаты перед повтором.', 'error');
      await refreshAfterAction();
    } finally {
      setSettling(false);
    }
  };

  const savePrice = async () => {
    if (!priceEdit || savingPrice) return;
    const nextPrice = Number(priceEdit.value);
    if (!Number.isSafeInteger(nextPrice) || nextPrice < 50) {
      onToast('Цена должна быть целым числом не меньше 50 ₽', 'error');
      return;
    }
    setSavingPrice(true);
    try {
      const res = await fetch('/api/v1/admin/predictions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predictionId: priceEdit.item.id,
          editMeta: { singlePriceRub: nextPrice },
        }),
      });
      if (!res.ok) {
        onToast(await responseError(res, 'Не удалось изменить цену'), 'error');
        return;
      }
      setPriceEdit(null);
      onToast('Цена события обновлена');
      await refreshAfterAction();
    } catch {
      onToast(unknownResultMessage, 'error');
      await refreshAfterAction();
    } finally {
      setSavingPrice(false);
    }
  };

  const toggleInsured = async (item: PredictionRecord) => {
    if (insuranceRequests.current.has(item.id)) return;
    insuranceRequests.current.add(item.id);
    setInsuranceBusyIds(new Set(insuranceRequests.current));
    try {
      const res = await fetch('/api/v1/admin/predictions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predictionId: item.id,
          editMeta: { insuredOnLoss: !item.insuredOnLoss },
        }),
      });
      if (!res.ok) {
        onToast(await responseError(res, 'Не удалось изменить страховку'), 'error');
        return;
      }
      onToast(
        !item.insuredOnLoss
          ? 'Страховка на баланс включена для события'
          : 'Страховка отключена для события',
      );
      await refreshAfterAction();
    } catch {
      onToast(unknownResultMessage, 'error');
      await refreshAfterAction();
    } finally {
      insuranceRequests.current.delete(item.id);
      setInsuranceBusyIds(new Set(insuranceRequests.current));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/admin/predictions?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        onToast(await responseError(res, 'Не удалось удалить событие'), 'error');
        return;
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(deleteTarget.id);
        return next;
      });
      onToast('Событие удалено');
      setDeleteTarget(null);
      await refreshAfterAction();
    } catch {
      onToast(unknownResultMessage, 'error');
      await refreshAfterAction();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Опубликовать событие
        </button>
        <button
          type="button"
          onClick={handleVerifiedSettlementCycle}
          disabled={settling}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          {settling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Рассчитать по подтверждённым счётaм
        </button>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по командам, лиге, исходу…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ['ALL', 'Все'],
              ['PENDING', 'Активные'],
              ['SETTLED', 'Рассчитанные'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                filter === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ['ALL', 'Все виды'],
            ['FOOTBALL', 'Футбол'],
            ['HOCKEY', 'Хоккей'],
            ['TENNIS', 'Теннис'],
            ['ESPORTS', 'Киберспорт'],
            ['BASKETBALL', 'Баскетбол'],
            ['MMA', 'ММА'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSportFilter(id)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
              sportFilter === id
                ? 'bg-blue-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'
            }`}
          >
            {label}
          </button>
        ))}
        {selectedIds.size > 0 && (
          <div className="ml-auto flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-1.5 text-white">
            <span className="text-[11px] font-bold">Выбрано: {selectedIds.size}</span>
            <button
              type="button"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={bulkDeleting}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold hover:bg-rose-700 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              Удалить
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkDeleting}
              className="text-[11px] font-bold text-slate-400 hover:text-white disabled:opacity-50"
            >
              Сбросить
            </button>
          </div>
        )}
      </div>

      {bulkReport && (
        <div role="status" aria-live="polite" className={`rounded-xl border p-4 text-xs ${bulkReport.issues.length ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
          <div className="flex items-center justify-between gap-3">
            <strong>Удалено: {bulkReport.deleted}. {bulkReport.issues.length > 0 && `Не подтверждено или не отправлено: ${bulkReport.issues.length}.`}</strong>
            <button type="button" onClick={() => setBulkReport(null)} className="font-bold underline">Закрыть отчёт</button>
          </div>
          {bulkReport.issues.length > 0 && (
            <ul className="mt-2 space-y-1">
              {bulkReport.issues.map((issue) => <li key={issue.id}><strong>{issue.label}</strong>: {issue.message}</li>)}
            </ul>
          )}
        </div>
      )}

      <SectionCard title={`События (${filtered.length})`} subtitle="Управление прогнозами на витрине">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="Ничего не найдено"
            description="Попробуйте изменить запрос или сбросить фильтр."
          />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-2.5">
              <input
                type="checkbox"
                checked={paged.length > 0 && paged.every((p) => selectedIds.has(p.id))}
                onChange={toggleSelectPage}
                disabled={bulkDeleting}
                className="h-4 w-4 rounded border-slate-300"
                aria-label="Выбрать все на странице"
              />
              <span className="text-[11px] font-semibold text-slate-500">
                Выбрать страницу ({paged.length})
              </span>
            </div>
            <div className="divide-y divide-slate-100">
            {paged.map((item) => (
              <div key={item.id} className={`px-5 py-4 ${selectedIds.has(item.id) ? 'bg-blue-50/50' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    disabled={bulkDeleting}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                    aria-label={`Выбрать ${item.homeTeam} — ${item.awayTeam}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400">{item.leagueName}</span>
                      <Badge tone={item.matchLifecycleStatus === 'LIVE' ? 'rose' : item.matchLifecycleStatus === 'FINISHED' ? 'slate' : 'blue'}>
                        {getAdminMatchStatusLabel(item)}
                      </Badge>
                      {item.accessTier === 'PAID_SINGLE' ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPriceEdit({ item, value: String(item.singlePriceRub ?? defaultPrice) })
                          }
                          className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-blue-600 hover:text-blue-800"
                          title="Изменить цену"
                        >
                          {formatRub(item.singlePriceRub ?? 0)}
                          <Pencil className="h-3 w-3" />
                        </button>
                      ) : (
                        <Badge tone="emerald">Бесплатно</Badge>
                      )}
                      {item.accessTier === 'PAID_SINGLE' && (
                        <button
                          type="button"
                          onClick={() => toggleInsured(item)}
                          disabled={insuranceBusyIds.has(item.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition disabled:opacity-50 ${
                            item.insuredOnLoss
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                          title="Переключить страховку"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          {item.insuredOnLoss ? 'Страховка ВКЛ' : 'Без страховки'}
                        </button>
                      )}
                      {item.isFeatured && <Badge tone="indigo">Главное событие</Badge>}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-extrabold text-slate-950">
                      <TeamAvatar team={item.homeTeam} sport={item.sport} logoUrl={item.homeLogoUrl} size="xs" />
                      <span>{item.homeTeam}</span>
                      <span className="text-slate-300">—</span>
                      <TeamAvatar team={item.awayTeam} sport={item.sport} logoUrl={item.awayLogoUrl} size="xs" />
                      <span>{item.awayTeam}</span>
                    </div>

                    <div className="mt-1 text-xs text-slate-600">
                      Исход: <strong>{item.selectionTitle}</strong> @{' '}
                      <strong className="font-mono">{item.fixedOdds.toFixed(2)}</strong>
                      {' · '}
                      <LocalDateTime value={item.matchStartsAt} format="full" />
                    </div>

                    {item.authorSource === 'AI_AUTOPILOT' && (
                      <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                        <span>Статус: {getAdminMatchStatusLabel(item)}</span>
                        {item.actualStartedAt && (
                          <span>
                            {' · '}старт наблюдался <LocalDateTime value={item.actualStartedAt} format="full" />
                          </span>
                        )}
                        {item.actualFinishedAt && (
                          <span>
                            {' · '}
                            {item.actualFinishedAtPrecision === 'SOURCE_EXACT'
                              ? 'фактический финиш'
                              : 'финиш зафиксирован'}{' '}
                            <LocalDateTime value={item.actualFinishedAt} format="full" />
                          </span>
                        )}
                        {item.matchVerifiedAt && (
                          <span>
                            {' · '}проверено <LocalDateTime value={item.matchVerifiedAt} format="full" />
                          </span>
                        )}
                        {item.matchVerificationSource && <span> · {item.matchVerificationSource}</span>}
                        {Number.isInteger(item.liveHomeScore) &&
                          Number.isInteger(item.liveAwayScore) && (
                            <span>
                              {' · '}счёт {item.liveHomeScore}:{item.liveAwayScore}
                            </span>
                          )}
                        {item.finalScoreVerified && <span> · счёт подтверждён</span>}
                        {item.matchVerificationConflict && <span> · конфликт источников</span>}
                      </div>
                    )}

                    {item.agentReport && (
                      <details className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] text-slate-700">
                        <summary className="cursor-pointer font-bold text-indigo-800">
                          Сохранённый отчёт AI-команды
                        </summary>
                        <pre className="mt-2 whitespace-pre-wrap font-sans leading-relaxed">
                          {item.agentReport}
                        </pre>
                      </details>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.resultStatus === 'PENDING' ? (
                      item.finalScoreVerified &&
                      !item.matchVerificationConflict &&
                      item.matchLifecycleStatus === 'FINISHED' ? (
                        <button
                          type="button"
                          onClick={handleVerifiedSettlementCycle}
                          disabled={settling}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Рассчитать по подтверждённому счёту
                        </button>
                      ) : (
                        <span className="max-w-[240px] rounded-lg bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold leading-relaxed text-amber-800">
                          Расчёт закрыт до согласия финального счёта минимум у двух независимых источников.
                        </span>
                      )
                    ) : (
                      <Badge tone={item.settlementVerified ? 'slate' : 'amber'}>
                        <CheckCircle2
                          className={`h-3 w-3 ${item.settlementVerified ? 'text-emerald-600' : 'text-amber-600'}`}
                        />
                        {item.settlementVerified
                          ? `${item.resultStatus} (${item.finalScore || 'итог'})`
                          : `Не проверено · ${item.resultStatus} (${item.finalScore || 'без счёта'}) — исключено из статистики`}
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Удалить событие"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
                <span className="text-[11px] font-semibold text-slate-500">
                  Страница {safePage} из {totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    ← Назад
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(safePage + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Вперёд →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>

      <CreatePredictionModal
        open={showCreate}
        defaultPrice={defaultPrice}
        onClose={() => setShowCreate(false)}
        onCreated={async () => {
          setShowCreate(false);
          await onRefresh();
        }}
        onToast={onToast}
      />

      <Modal
        open={priceEdit !== null}
        onClose={() => { if (!savingPrice) setPriceEdit(null); }}
        title="Изменить цену события"
        description={
          priceEdit
            ? `${priceEdit.item.homeTeam} — ${priceEdit.item.awayTeam}`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setPriceEdit(null)}
              disabled={savingPrice}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={savePrice}
              disabled={savingPrice}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Сохранить цену
            </button>
          </>
        }
      >
        <Field label="Новая цена (₽)" hint="Минимум 50 ₽. Применится сразу на витрине.">
          <input
            type="number"
            min={50}
            autoFocus
            value={priceEdit?.value ?? ''}
            onChange={(e) => setPriceEdit((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
            className={inputMonoCls}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Удалить событие?"
        description={
          deleteTarget
            ? `Событие «${deleteTarget.homeTeam} — ${deleteTarget.awayTeam}» будет удалено без возможности восстановления. События с открытым доступом клиентов и оплаченными или ожидающими заказами защищены от удаления.`
            : ''
        }
        confirmLabel="Удалить"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Удалить выбранные события?"
        description={`Выбрано событий: ${selectedIds.size}. Удаление необратимо; события с открытым доступом клиентов и оплаченными или ожидающими заказами будут пропущены.`}
        confirmLabel={`Удалить (${selectedIds.size})`}
        busy={bulkDeleting}
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  );
}

/* ── Модалка создания события ─────────────────────────────────────────── */

function CreatePredictionModal({
  open,
  defaultPrice,
  onClose,
  onCreated,
  onToast,
}: {
  open: boolean;
  defaultPrice: number;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onToast: (msg: string, kind?: ToastKind) => void;
}) {
  const formId = useId();
  const [sport, setSport] = useState<SportType>('FOOTBALL');
  const [leagueName, setLeagueName] = useState('Лига Чемпионов УЕФА');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [matchStartsAt, setMatchStartsAt] = useState('');
  const [accessTier, setAccessTier] = useState<AccessTier>('PAID_SINGLE');
  const [singlePriceRub, setSinglePriceRub] = useState(defaultPrice);
  const [insuredOnLoss, setInsuredOnLoss] = useState(true);
  const [selectionTitle, setSelectionTitle] = useState('');
  const [fixedOdds, setFixedOdds] = useState(1.92);
  const [stakeUnits, setStakeUnits] = useState(2.0);
  const [bookmakerSource, setBookmakerSource] = useState('Фонбет / Pari');
  const [analysisTeaser, setAnalysisTeaser] = useState('');
  const [analysisFull, setAnalysisFull] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSinglePriceRub(defaultPrice);
      setMatchStartsAt(toDateTimeLocalInputValue(new Date(Date.now() + 5 * 3600_000)));
    }
  }, [open, defaultPrice]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (![leagueName, homeTeam, awayTeam, selectionTitle, analysisTeaser, analysisFull].every((value) => value.trim())) {
      onToast('Заполните все обязательные текстовые поля.', 'error');
      return;
    }
    const matchStartsAtIso = dateTimeLocalInputToIso(matchStartsAt);
    if (!matchStartsAtIso) {
      onToast(
        'Выбранное местное время недопустимо (возможно, часы перескочили при переходе на летнее время). Выберите другую дату или время.',
        'error',
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport,
          leagueName,
          homeTeam,
          awayTeam,
          matchStartsAt: matchStartsAtIso,
          accessTier,
          singlePriceRub: accessTier === 'FREE' ? null : Number(singlePriceRub),
          insuredOnLoss: accessTier === 'PAID_SINGLE' ? insuredOnLoss : false,
          selectionTitle,
          fixedOdds: Number(fixedOdds),
          stakeUnits: Number(stakeUnits),
          bookmakerSource,
          analysisTeaser,
          analysisFull,
          isFeatured,
          pushToTelegram: true,
        }),
      });
      if (!res.ok) {
        onToast(await responseError(res, 'Ошибка публикации'), 'error');
        return;
      }
      setHomeTeam('');
      setAwayTeam('');
      setSelectionTitle('');
      setAnalysisTeaser('');
      setAnalysisFull('');
      onToast('Событие опубликовано на витрине и зафиксировано SHA-256!');
      try {
        await onCreated();
      } catch {
        onToast('Событие опубликовано, но список не обновился. Обновите страницу.', 'error');
      }
    } catch {
      onToast('Ответ о публикации не получен. Проверьте список событий перед повтором, чтобы не создать дубликат.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="Опубликовать новое событие"
      description="Событие сразу появится на витрине и будет зафиксировано SHA-256."
      wide
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="submit"
            form={formId}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Выставить на витрину
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <Field label="Быстрый выбор турнира">
          <div className="flex flex-wrap gap-1.5">
            {LEAGUE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setSport(preset.sport);
                  setLeagueName(preset.league);
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Вид спорта">
            <select value={sport} onChange={(e) => setSport(e.target.value as SportType)} className={inputCls}>
              <option value="FOOTBALL">Футбол</option>
              <option value="HOCKEY">Хоккей</option>
              <option value="TENNIS">Теннис</option>
              <option value="ESPORTS">Киберспорт</option>
              <option value="BASKETBALL">Баскетбол</option>
              <option value="MMA">ММА / Бокс</option>
            </select>
          </Field>
          <Field label="Формат продажи">
            <select value={accessTier} onChange={(e) => setAccessTier(e.target.value as AccessTier)} className={inputCls}>
              <option value="PAID_SINGLE">Платный прогноз (разовый)</option>
              <option value="FREE">Бесплатный открытый прогноз</option>
            </select>
          </Field>
        </div>

        <Field label="Лига / Турнир">
          <input required value={leagueName} onChange={(e) => setLeagueName(e.target.value)} className={inputCls} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Хозяева / Игрок 1">
            <div className="flex items-center gap-2">
              {homeTeam.trim().length >= 2 && <TeamAvatar team={homeTeam.trim()} sport={sport} size="sm" />}
              <input required value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="Реал Мадрид" className={inputCls} />
            </div>
          </Field>
          <Field label="Гости / Игрок 2">
            <div className="flex items-center gap-2">
              {awayTeam.trim().length >= 2 && <TeamAvatar team={awayTeam.trim()} sport={sport} size="sm" />}
              <input required value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="Бавария" className={inputCls} />
            </div>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Начало матча (время браузера)" hint="При сохранении переводится в UTC; на сайте каждый увидит его в своём часовом поясе.">
            <input
              type="datetime-local"
              required
              value={matchStartsAt}
              onChange={(e) => setMatchStartsAt(e.target.value)}
              className={inputCls}
            />
          </Field>
          {accessTier === 'PAID_SINGLE' && (
            <Field label="Цена события (₽)">
              <input
                type="number"
                min={50}
                required
                value={singlePriceRub}
                onChange={(e) => setSinglePriceRub(Number(e.target.value))}
                className={inputMonoCls}
              />
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Точный исход (скрыт до оплаты)">
            <input required value={selectionTitle} onChange={(e) => setSelectionTitle(e.target.value)} placeholder="Фора 1 (-1.0) / ТБ 2.5" className={inputCls} />
          </Field>
          <Field label="Коэффициент">
            <input type="number" min="1.05" max="50" step="0.01" required value={fixedOdds} onChange={(e) => setFixedOdds(Number(e.target.value))} className={inputMonoCls} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Флэт (% от банка)">
            <input type="number" min="0.25" max="10" step="0.25" required value={stakeUnits} onChange={(e) => setStakeUnits(Number(e.target.value))} className={inputMonoCls} />
          </Field>
          <Field label="Букмекер">
            <input value={bookmakerSource} onChange={(e) => setBookmakerSource(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <Field label="Публичный анонс на карточке витрины">
          <textarea required rows={2} value={analysisTeaser} onChange={(e) => setAnalysisTeaser(e.target.value)} placeholder="Краткое описание ценности матча для покупателя…" className={inputCls} />
        </Field>

        <Field label="Закрытая аналитика (открывается после покупки)">
          <textarea required rows={3} value={analysisFull} onChange={(e) => setAnalysisFull(e.target.value)} placeholder="Подробные цифры xG, составы, мотивация и обоснование выбора…" className={inputCls} />
        </Field>

        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
          {accessTier === 'PAID_SINGLE' && (
            <label className="flex items-center gap-2 text-xs font-bold text-emerald-800">
              <input type="checkbox" checked={insuredOnLoss} onChange={(e) => setInsuredOnLoss(e.target.checked)} />
              <span>Страховка 100% возврата на баланс при минусе</span>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
            <span>Закрепить как «Главное событие дня» в шапке</span>
          </label>
        </div>
      </form>
    </Modal>
  );
}

import type { OrderTransaction, PredictionRecord } from '@/server/types';
import type { AdminUser } from '@/components/admin/admin-format';

export type AdminTabId = 'OVERVIEW' | 'AUTOPILOT' | 'AI_CHAT' | 'PREDICTIONS' | 'PRICING_PROMOS' | 'FINANCE' | 'USERS' | 'SETTINGS';
export type AdminCommandTarget = { tab: AdminTabId; search?: string; userId?: string; predictionId?: string; orderId?: string };
export interface AdminCommandResult {
  key: string;
  group: 'Разделы' | 'Клиенты' | 'События' | 'Заказы';
  label: string;
  detail: string;
  target: AdminCommandTarget;
}

const sections: Array<{ id: AdminTabId; label: string; keywords: string }> = [
  { id: 'OVERVIEW', label: 'Обзор', keywords: 'дашборд главная статистика' },
  { id: 'AUTOPILOT', label: 'ИИ-Автопилот', keywords: 'автопилот нейросеть модель черновики диагностика' },
  { id: 'AI_CHAT', label: 'ИИ-Чат', keywords: 'чат помощник сообщения' },
  { id: 'PREDICTIONS', label: 'События', keywords: 'матчи прогнозы спорт' },
  { id: 'PRICING_PROMOS', label: 'Цены и промокоды', keywords: 'скидки цены промокод' },
  { id: 'FINANCE', label: 'Финансы', keywords: 'заказы платежи оплаты выплаты возвраты' },
  { id: 'USERS', label: 'Клиенты', keywords: 'пользователи покупатели партнеры' },
  { id: 'SETTINGS', label: 'Настройки', keywords: 'сайт параметры конфигурация' },
];

function normalize(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
}

function matches(query: string, ...fields: Array<string | undefined | null>): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const haystack = normalize(fields.filter(Boolean).join(' '));
  return terms.every((term) => haystack.includes(term));
}

/** Search only the admin overview already loaded in memory; never perform mutations. */
export function searchAdminCommands(query: string, data: {
  users: AdminUser[];
  predictions: PredictionRecord[];
  transactions: OrderTransaction[];
}): AdminCommandResult[] {
  const q = normalize(query);
  const results: AdminCommandResult[] = sections
    .filter((section) => !q || matches(q, section.label, section.keywords, section.id))
    .map((section) => ({
      key: `section:${section.id}`,
      group: 'Разделы',
      label: section.label,
      detail: 'Открыть раздел',
      target: { tab: section.id },
    }));
  if (!q) return results;

  for (const user of data.users.filter((u) => matches(q, u.displayName, u.email, u.id)).slice(0, 6)) {
    results.push({ key: `user:${user.id}`, group: 'Клиенты', label: user.displayName || user.email, detail: user.email,
      target: { tab: 'USERS', search: user.id, userId: user.id } });
  }
  for (const prediction of data.predictions.filter((p) => matches(q, p.homeTeam, p.awayTeam, p.leagueName, p.id, p.slug)).slice(0, 6)) {
    results.push({ key: `prediction:${prediction.id}`, group: 'События', label: `${prediction.homeTeam} — ${prediction.awayTeam}`, detail: prediction.leagueName,
      target: { tab: 'PREDICTIONS', search: prediction.id, predictionId: prediction.id } });
  }
  for (const order of data.transactions.filter((t) => matches(q, t.title, t.userEmail, t.id)).slice(0, 6)) {
    results.push({ key: `order:${order.id}`, group: 'Заказы', label: order.title, detail: `${order.userEmail} · ${order.amountRub.toLocaleString('ru-RU')} ₽`,
      target: { tab: 'FINANCE', search: order.id, orderId: order.id } });
  }
  return results;
}

'use client';

import React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { OrderTransaction } from '@/server/types';
import { Badge } from './ui';
import type { SortDirection } from './admin-format';

const STATUS_LABELS: Record<OrderTransaction['status'], string> = {
  SUCCEEDED: 'Оплачен',
  PENDING: 'Ожидает',
  CANCELED: 'Отменён',
  REFUNDED: 'Возврат',
};

export function OrderStatusBadge({ status }: { status: OrderTransaction['status'] }) {
  return (
    <Badge tone={status === 'SUCCEEDED' ? 'emerald' : status === 'REFUNDED' ? 'rose' : status === 'CANCELED' ? 'slate' : 'amber'}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function SortableHeader({ label, active, direction, onSort }: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
}) {
  const Icon = !active ? ChevronsUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className="px-5 py-3" aria-sort={active ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
      <button type="button" onClick={onSort} className="inline-flex items-center gap-1 text-left hover:text-slate-800">
        {label}<Icon aria-hidden="true" className="h-3 w-3" />
      </button>
    </th>
  );
}

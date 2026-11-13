'use client';

import React, { useState } from 'react';
import type { SportType } from '@/server/types';

interface TeamAvatarProps {
  team: string;
  sport?: SportType;
  logoUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<TeamAvatarProps['size']>, string> = {
  xs: 'h-6 w-6 rounded-lg p-0.5 text-[9px]',
  sm: 'h-7 w-7 rounded-lg p-0.5 text-[10px]',
  md: 'h-8 w-8 rounded-xl p-1 text-[11px]',
  lg: 'h-11 w-11 rounded-xl p-1.5 text-xs',
  xl: 'h-12 w-12 sm:h-14 sm:w-14 rounded-2xl p-1.5 text-sm',
};

function getClientFallbackMonogram(team: string): string {
  const cleaned = team
    .replace(/\b(ФК|ХК|ПФК|БК|FC|HC|BC)\b/gi, '')
    .trim();
  const words = cleaned.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }
  return (words[0] || team).slice(0, 3).toUpperCase();
}

export const TeamAvatar: React.FC<TeamAvatarProps> = ({
  team,
  sport,
  logoUrl,
  size = 'md',
  variant = 'light',
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const params = new URLSearchParams();
  params.set('team', team);
  if (sport) params.set('sport', sport);
  if (logoUrl && logoUrl.trim()) params.set('url', logoUrl.trim());

  const src = `/api/v1/team-logo?${params.toString()}`;

  const frameClass =
    variant === 'dark'
      ? 'border border-white/20 bg-white/95 shadow-md ring-1 ring-black/10'
      : 'border border-slate-200/90 bg-white shadow-2xs';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden select-none ${SIZE_CLASSES[size]} ${frameClass} ${className}`}
      title={team}
    >
      {!imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={team}
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="font-mono font-black text-slate-800">
          {getClientFallbackMonogram(team)}
        </span>
      )}
    </span>
  );
};

import React from 'react';

export const PredictionCardSkeleton: React.FC = () => {
  return (
    <div className="flex h-full animate-pulse flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <div>
        <div className="flex items-center justify-between gap-2">
          <div className="h-3.5 w-32 rounded-full bg-slate-200" />
          <div className="h-5 w-24 rounded-full bg-slate-100" />
        </div>

        <div className="mt-3.5 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-7 rounded-md bg-slate-200" />
              <div className="h-4 w-36 rounded bg-slate-200" />
            </div>
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-7 rounded-md bg-slate-200" />
              <div className="h-4 w-32 rounded bg-slate-200" />
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="h-3 w-24 rounded bg-slate-100" />
          <div className="h-3 w-28 rounded bg-slate-100" />
        </div>

        <div className="mt-3 h-6 w-56 rounded-lg bg-emerald-50" />

        <div className="mt-3 space-y-1.5">
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-4/5 rounded bg-slate-100" />
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3.5">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="h-6 w-20 rounded bg-slate-200" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-20 rounded-xl bg-slate-100" />
            <div className="h-9 w-20 rounded-xl bg-blue-100" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const HeroFeaturedSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse rounded-3xl border border-white/15 bg-gradient-to-b from-slate-900 to-[#111827] p-6 shadow-2xl">
      <div className="flex items-center justify-between">
        <div className="h-6 w-36 rounded-full bg-white/10" />
        <div className="h-4 w-24 rounded bg-white/10" />
      </div>
      <div className="mt-4 h-3 w-40 rounded bg-white/10" />
      <div className="mt-2 h-7 w-64 rounded bg-white/15" />
      <div className="mt-3 h-6 w-56 rounded-lg bg-emerald-500/15" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-5/6 rounded bg-white/10" />
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
        <div className="h-8 w-24 rounded bg-white/15" />
        <div className="h-11 w-40 rounded-xl bg-blue-600/40" />
      </div>
    </div>
  );
};

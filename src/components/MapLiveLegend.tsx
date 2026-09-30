import React, { useMemo, useState } from 'react';
import type { BorderParkSnapshot } from '../services/borderPark';

/** رنگ شدت زمان انتظار بر پایهٔ ساعت — مرجع واحد لایه‌های نقشه و legend */
export function waitTierColor(hours: number): string {
  if (hours >= 200) return '#fb7185';
  if (hours >= 72) return '#fbbf24';
  if (hours >= 12) return '#2dd4bf';
  return '#94a3b8';
}

const WAIT_TIERS = [
  { color: '#94a3b8', label: 'کمتر از ۱۲ ساعت' },
  { color: '#2dd4bf', label: '۱۲ تا ۷۲ ساعت' },
  { color: '#fbbf24', label: '۷۲ تا ۲۰۰ ساعت' },
  { color: '#fb7185', label: 'بیش از ۲۰۰ ساعت — بحران' },
];

/** نمونه‌های مقیاس اندازهٔ حباب (تردد روزانهٔ کامیون) */
const SIZE_STEPS = [
  { tr: 250, label: '۲۵۰' },
  { tr: 1200, label: '۱٬۲۰۰' },
  { tr: 5000, label: '۵٬۰۰۰' },
];

const fmt = (n: number) => Number(n || 0).toLocaleString('fa-IR');

interface MapLiveLegendProps {
  gates: BorderParkSnapshot[];
}

/** Legend پویای صف زندهٔ گمرک — تنها با وجود دادهٔ زندهٔ معتبر نمایش داده می‌شود */
export const MapLiveLegend: React.FC<MapLiveLegendProps> = ({ gates }) => {
  const [open, setOpen] = useState(true);

  const live = useMemo(() => gates.filter((g) => g.confidence !== 'low'), [gates]);
  const lastUpdated = useMemo(() => {
    const stamps = live.map((g) => g.sourceUpdatedAt).filter(Boolean) as string[];
    return stamps[0] || '';
  }, [live]);

  if (live.length === 0) return null;

  return (
    <div className="absolute bottom-14 left-3 z-10 w-[176px] bg-slate-950/92 backdrop-blur-md border border-slate-800 rounded-xl shadow-lg overflow-hidden">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-right hover:bg-slate-900/60 transition-colors"
        title="راهنمای رنگ و اندازهٔ حباب‌های صف زنده"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--cmd-green)] opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--cmd-green)]" />
        </span>
        <span className="text-[10px] font-bold text-[var(--cmd-green)] flex-1">صف زندهٔ گمرک</span>
        <span className="text-[9px] text-slate-400">{fmt(live.length)} مرز</span>
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 pt-2 border-t border-slate-800/70 flex flex-col gap-1.5">
          {WAIT_TIERS.map((tier) => (
            <div key={tier.label} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full border border-slate-700 shrink-0"
                style={{ background: tier.color }}
              />
              <span className="text-[9px] text-slate-300">{tier.label}</span>
            </div>
          ))}

          <div className="border-t border-slate-800/70 pt-1.5">
            <div className="text-[9px] text-slate-400 mb-1">اندازهٔ حباب = تردد روزانه (کامیون)</div>
            <div className="flex items-end gap-2.5">
              {SIZE_STEPS.map((step) => {
                const px = Math.min(30, Math.round((3 + Math.sqrt(step.tr) * 0.42) * 0.55) * 2);
                return (
                  <div key={step.tr} className="flex flex-col items-center gap-0.5">
                    <span
                      className="rounded-full border border-sky-400/70 bg-sky-400/25"
                      style={{ width: px, height: px }}
                    />
                    <span className="text-[8px] text-slate-500">≈{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-800/70 pt-1.5 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
            <span className="text-[9px] text-slate-400">بدون دادهٔ زنده: رنگ نوع گذرگاه</span>
          </div>

          {lastUpdated && (
            <p className="text-[8px] text-slate-500 leading-relaxed border-t border-slate-800/70 pt-1.5">
              بهروزرسانی سامانه: {lastUpdated} · منبع: نوبتدهی رسمی گمرک
            </p>
          )}
        </div>
      )}
    </div>
  );
};

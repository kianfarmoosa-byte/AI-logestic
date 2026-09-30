import React from 'react';
import { Search, Sparkles, Sun, Moon, Globe, ChevronDown } from 'lucide-react';
import { Crossing } from '../types';
import { OpsNotifications } from './OpsNotifications';

interface TopbarProps {
  totalFiltered: number;
  totalAll: number;
  iranGatesCount: number;
  darkTheme: boolean;
  onToggleTheme: () => void;
  onOpenGlobalSearch: () => void;
  onOpenAiHub: () => void;
  activeTab: string;
  /** دادهٔ گیت‌ها برای لینک اعلان‌ها به نقشه */
  crossings?: Crossing[];
  onFocusGate?: (crossing: Crossing) => void;
}

/**
 * هدر بازطراحی‌شده به سبک KEMETRA: برند ماتریسی + جستجوی پیل + بج‌های KPI +
 * CTA سبز امضایی + کارت کاربر سبز. تمام دکمه‌ها و رفتارهای قبلی حفظ شده‌اند؛
 * ظاهر از توکن‌های پوستهٔ روشن (index.css) پیروی می‌کند.
 */
export const Topbar: React.FC<TopbarProps> = ({
  totalFiltered,
  totalAll,
  iranGatesCount,
  darkTheme,
  onToggleTheme,
  onOpenGlobalSearch,
  onOpenAiHub,
  crossings,
  onFocusGate,
}) => {
  return (
    <header className="absolute top-0 right-0 left-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-950/92 backdrop-blur-xl border-b border-slate-800 font-['Vazirmatn'] pointer-events-auto">
      {/* Brand — مونوگرام سبز + نام اطلس */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-[var(--cmd-green)] flex items-center justify-center shadow-md">
          <Globe className="w-5 h-5 text-white" />
        </div>
        <div className="leading-tight">
          <h1 className="text-[15px] font-black text-slate-100 tracking-tight">
            اطلس ترانزیت
          </h1>
          <p className="text-[10px] text-slate-400">
            شبکهٔ جاده‌ای، گذرگاه‌های مرزی و کریدورهای اوراسیا
          </p>
        </div>
      </div>

      {/* Prominent Global Search Trigger — پیل خاکستری روشن با دکمهٔ داخلی سبز */}
      <div className="flex-1 max-w-md mx-2 hidden sm:block">
        <button
          onClick={onOpenGlobalSearch}
          className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl py-1.5 pl-1.5 pr-3 text-xs transition-all shadow-sm group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 group-hover:text-[var(--cmd-green)] transition-colors" />
            <span className="text-slate-400 group-hover:text-slate-200">
              جستجوی گذرگاه، شهر، کالا یا استعلام آنلاین...
            </span>
          </div>
          <kbd className="text-[10px] bg-slate-950 text-slate-400 px-2 py-1 rounded-lg border border-slate-700 font-mono">
            Ctrl + K
          </kbd>
        </button>
      </div>

      {/* KPIs & Action Buttons */}
      <div className="flex items-center gap-2">
        {/* KPI badges */}
        <div className="hidden lg:flex items-center gap-2 text-xs">
          <div className="bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-center shadow-sm">
            <span className="text-[10px] text-slate-400 block">گذرگاه فعال</span>
            <b className="text-slate-100 font-bold">{totalFiltered}</b>
            <span className="text-[9px] text-slate-500"> / {totalAll}</span>
          </div>
          <div className="bg-slate-900 border border-[var(--cmd-green-ring)] px-2.5 py-1 rounded-lg text-center shadow-sm">
            <span className="text-[10px] text-[var(--cmd-green)] block">دروازه ایران</span>
            <b className="text-slate-100 font-bold">{iranGatesCount}</b>
          </div>
        </div>

        {/* AI Grounding Hub Button — CTA سبز کروم (Rest Change) */}
        <button
          onClick={onOpenAiHub}
          className="btn-cmd-green flex items-center gap-1.5 font-bold px-3.5 py-2 rounded-xl text-xs transition-all shadow-md"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden md:inline">استعلام بلادرنگ هوشمند</span>
          <span className="md:hidden">استعلام هوشمند</span>
        </button>

        {/* Global Search mobile button */}
        <button
          onClick={onOpenGlobalSearch}
          className="sm:hidden p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300"
          title="جستجو"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* مرکز اعلان عملیاتی واقعی: صف بحرانی + ناهنجاری جریان */}
        <OpsNotifications crossings={crossings || []} onFocusGate={onFocusGate || (() => {})} />

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 transition-colors"
          title={darkTheme ? 'حالت روشن' : 'حالت تیره'}
        >
          {darkTheme ? <Sun className="w-4 h-4 text-[var(--tone-amber)]" /> : <Moon className="w-4 h-4 text-[var(--tone-sky)]" />}
        </button>

        {/* User Card — کارت سبز کروم با آواتار حروف اول */}
        <button
          onClick={onToggleTheme}
          className="hidden md:flex items-center gap-2 bg-[var(--cmd-green)] hover:bg-[var(--cmd-green-hover)] rounded-xl px-3 py-1.5 shadow-md transition-colors"
          title="تعویض پوستهٔ روشن/تیره"
        >
          <span className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center text-white text-[11px] font-black">
            اط
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-bold text-white">اپراتور اطلس</span>
            <span className="text-[9px] text-white/80">دسترسی کامل</span>
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-white/85" />
        </button>
      </div>
    </header>
  );
};

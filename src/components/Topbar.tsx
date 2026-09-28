import React from 'react';
import { Search, Sparkles, Sun, Moon, Compass, Globe } from 'lucide-react';
import { Crossing } from '../types';

interface TopbarProps {
  totalFiltered: number;
  totalAll: number;
  iranGatesCount: number;
  darkTheme: boolean;
  onToggleTheme: () => void;
  onOpenGlobalSearch: () => void;
  onOpenAiHub: () => void;
  activeTab: string;
}

export const Topbar: React.FC<TopbarProps> = ({
  totalFiltered,
  totalAll,
  iranGatesCount,
  darkTheme,
  onToggleTheme,
  onOpenGlobalSearch,
  onOpenAiHub,
}) => {
  return (
    <header className="absolute top-0 right-0 left-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-950/85 backdrop-blur-xl border-b border-slate-800/90 font-['Vazirmatn'] pointer-events-auto">
      {/* Brand */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-teal-400 flex items-center justify-center text-slate-950 font-black text-lg shadow-lg">
          <Globe className="w-5 h-5 text-slate-950" />
        </div>
        <div>
          <h1 className="text-sm font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-slate-100 to-teal-300">
            اطلس شبکه جاده‌ای و ترانزیت منتهی به ایران
          </h1>
          <p className="text-[10px] text-slate-400">
            نسخه ارتقایافته با جستجوی هوشمند داده و دسترسی برخط به Google Search و Maps
          </p>
        </div>
      </div>

      {/* Prominent Global Search Trigger */}
      <div className="flex-1 max-w-md mx-2 hidden sm:block">
        <button
          onClick={onOpenGlobalSearch}
          className="w-full flex items-center justify-between bg-slate-900/90 hover:bg-slate-850 text-slate-300 border border-slate-700/80 rounded-xl py-2 px-3 text-xs transition-all shadow-inner group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span className="text-slate-400 group-hover:text-slate-200">
              جستجوی گذرگاه، شهر، کالا یا استعلام آنلاین...
            </span>
          </div>
          <kbd className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
            Ctrl + K
          </kbd>
        </button>
      </div>

      {/* KPIs & Action Buttons */}
      <div className="flex items-center gap-2">
        {/* KPI badges */}
        <div className="hidden lg:flex items-center gap-2 text-xs">
          <div className="bg-slate-900/80 border border-slate-800 px-2.5 py-1 rounded-lg text-center">
            <span className="text-[10px] text-slate-400 block">گذرگاه فعال</span>
            <b className="text-slate-100 font-bold">{totalFiltered}</b>
          </div>
          <div className="bg-slate-900/80 border border-amber-500/30 px-2.5 py-1 rounded-lg text-center">
            <span className="text-[10px] text-amber-400/90 block">دروازه ایران</span>
            <b className="text-amber-400 font-bold">{iranGatesCount}</b>
          </div>
        </div>

        {/* AI Grounding Hub Button */}
        <button
          onClick={onOpenAiHub}
          className="flex items-center gap-1.5 bg-gradient-to-r from-teal-500 to-amber-500 hover:from-teal-400 hover:to-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all shadow-md animate-pulse hover:animate-none"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden md:inline">استعلام بلادرنگ Google AI</span>
          <span className="md:hidden">Google AI</span>
        </button>

        {/* Global Search mobile button */}
        <button
          onClick={onOpenGlobalSearch}
          className="sm:hidden p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-slate-300"
          title="جستجو"
        >
          <Search className="w-4 h-4 text-amber-400" />
        </button>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:text-slate-100 transition-colors"
          title={darkTheme ? 'حالت روشن' : 'حالت تیره'}
        >
          {darkTheme ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-400" />}
        </button>
      </div>
    </header>
  );
};

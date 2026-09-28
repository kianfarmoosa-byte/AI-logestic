import React from 'react';
import { Search, RotateCcw, MapPin, ChevronLeft } from 'lucide-react';
import { Crossing } from '../types';

interface FilterViewProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedTypes: Set<string>;
  onToggleType: (type: string) => void;
  selectedCountry: string;
  onSelectCountry: (country: string) => void;
  countriesList: string[];
  selectedDepths: Set<string>;
  onToggleDepth: (depth: string) => void;
  selectedConfs: Set<string>;
  onToggleConf: (conf: string) => void;
  onResetFilters: () => void;
  filteredCrossings: Crossing[];
  totalCrossings: number;
  onSelectCrossing: (crossing: Crossing) => void;
}

export const FilterView: React.FC<FilterViewProps> = ({
  searchQuery,
  onSearchChange,
  selectedTypes,
  onToggleType,
  selectedCountry,
  onSelectCountry,
  countriesList,
  selectedDepths,
  onToggleDepth,
  selectedConfs,
  onToggleConf,
  onResetFilters,
  filteredCrossings,
  totalCrossings,
  onSelectCrossing,
}) => {
  return (
    <div className="flex flex-col gap-4 p-3 font-['Vazirmatn'] text-xs">
      {/* Quick Text Filter */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="فیلتر گذرگاه‌ها (فارسی / English)..."
          className="w-full bg-slate-950 border border-slate-700/80 rounded-xl py-2 px-3 pr-8 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
        />
        <Search className="w-4 h-4 text-slate-400 absolute top-2.5 right-2.5" />
      </div>

      {/* Crossing Types */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">نوع گذرگاه:</label>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onToggleType('road')}
            className={`px-3 py-1 rounded-full text-[11px] transition-all border ${
              selectedTypes.has('road')
                ? 'bg-blue-600 text-white font-bold border-blue-500'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            جاده‌ای
          </button>
          <button
            onClick={() => onToggleType('combined')}
            className={`px-3 py-1 rounded-full text-[11px] transition-all border ${
              selectedTypes.has('combined')
                ? 'bg-purple-600 text-white font-bold border-purple-500'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            جاده‌ای + ریلی
          </button>
          <button
            onClick={() => onToggleType('rail')}
            className={`px-3 py-1 rounded-full text-[11px] transition-all border ${
              selectedTypes.has('rail')
                ? 'bg-slate-600 text-white font-bold border-slate-500'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            ریلی اختصاصی
          </button>
        </div>
      </div>

      {/* Country Select */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">کشور:</label>
        <select
          value={selectedCountry}
          onChange={(e) => onSelectCountry(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700/80 rounded-xl p-2 text-xs text-slate-100"
        >
          <option value="">همه کشورها ({countriesList.length})</option>
          {countriesList.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Network Depth BFS */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
          عمق شبکه از مرز ایران (BFS Depth):
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onToggleDepth('1')}
            className={`px-2.5 py-1 rounded-full text-[11px] border transition-all ${
              selectedDepths.has('1')
                ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            ۱ · مرز مستقیم ایران
          </button>
          <button
            onClick={() => onToggleDepth('2')}
            className={`px-2.5 py-1 rounded-full text-[11px] border transition-all ${
              selectedDepths.has('2')
                ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            ۲ · حلقه دوم
          </button>
          <button
            onClick={() => onToggleDepth('3')}
            className={`px-2.5 py-1 rounded-full text-[11px] border transition-all ${
              selectedDepths.has('3')
                ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            ۳ · حلقه سوم و اروپا
          </button>
        </div>
      </div>

      {/* Data Confidence */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">سطح اطمینان داده:</label>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onToggleConf('بالا')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] border transition-all ${
              selectedConfs.has('بالا')
                ? 'bg-emerald-600 text-white font-bold border-emerald-500'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            بالا
          </button>
          <button
            onClick={() => onToggleConf('متوسط')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] border transition-all ${
              selectedConfs.has('متوسط')
                ? 'bg-amber-600 text-white font-bold border-amber-500'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            متوسط
          </button>
          <button
            onClick={() => onToggleConf('پایین')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] border transition-all ${
              selectedConfs.has('پایین')
                ? 'bg-red-600 text-white font-bold border-red-500'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            پایین
          </button>
        </div>
      </div>

      {/* Counts & Reset */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
        <span>
          نمایش <strong>{filteredCrossings.length}</strong> از <strong>{totalCrossings}</strong> گذرگاه
        </span>
        <button
          onClick={onResetFilters}
          className="flex items-center gap-1 text-slate-400 hover:text-amber-400 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>بازنشانی فیلترها</span>
        </button>
      </div>

      {/* Matching Crossings Quick List */}
      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
        {filteredCrossings.slice(0, 30).map((c) => (
          <div
            key={c.id}
            onClick={() => onSelectCrossing(c)}
            className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800/80 border border-slate-850 cursor-pointer transition-all"
          >
            <div>
              <div className="font-semibold text-slate-200">{c.name}</div>
              <div className="text-[10px] text-slate-400">
                {c.country} · {c.type} {c.trucks_est ? `· ≈ ${c.trucks_est} کامیون/روز` : ''}
              </div>
            </div>
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </div>
        ))}
      </div>
    </div>
  );
};

import React from 'react';
import { BarChart3, PieChart, Activity, ShieldAlert, ArrowUpRight } from 'lucide-react';
import { Crossing, Corridor } from '../types';

interface AnalyticsViewProps {
  crossings: Crossing[];
  corridors: Corridor[];
  activeCorridors: boolean[];
  onToggleCorridor: (index: number) => void;
  onFocusGate: (crossing: Crossing) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  crossings,
  corridors,
  activeCorridors,
  onToggleCorridor,
  onFocusGate,
}) => {
  // Statistics
  const typeCounts = { road: 0, combined: 0, rail: 0 };
  crossings.forEach((c) => {
    if (c.layer === 'road') typeCounts.road++;
    else if (c.layer === 'combined') typeCounts.combined++;
    else if (c.layer === 'rail') typeCounts.rail++;
  });

  const total = Math.max(crossings.length, 1);
  const pRoad = (typeCounts.road / total) * 100;
  const pComb = pRoad + (typeCounts.combined / total) * 100;

  // Top gates by capacity
  const topGates = [...crossings]
    .filter((c) => c.trucks_est && c.trucks_est > 0)
    .sort((a, b) => (b.trucks_est || 0) - (a.trucks_est || 0))
    .slice(0, 8);

  const maxCap = topGates.length > 0 ? (topGates[0].trucks_est || 1) : 1;

  // Country distribution
  const countryCounts: Record<string, number> = {};
  crossings.forEach((c) => {
    countryCounts[c.country] = (countryCounts[c.country] || 0) + 1;
  });

  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  const maxCountry = topCountries.length > 0 ? topCountries[0][1] : 1;

  return (
    <div className="flex flex-col gap-4 p-3 font-['Vazirmatn'] text-xs">
      {/* Type distribution donut simulation */}
      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <h4 className="font-bold text-slate-300 text-xs mb-3 flex items-center gap-1.5">
          <PieChart className="w-4 h-4 text-amber-400" />
          <span>ترکیب نوع گذرگاه‌های مرزی</span>
        </h4>
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-full shrink-0 relative shadow-inner"
            style={{
              background: `conic-gradient(#3b82f6 0% ${pRoad}%, #a855f7 ${pRoad}% ${pComb}%, #64748b ${pComb}% 100%)`,
            }}
          >
            <div className="absolute inset-4 rounded-full bg-slate-900" />
          </div>
          <div className="flex flex-col gap-1.5 text-slate-300 text-[11px] flex-1">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span>جاده‌ای خالص:</span>
              </span>
              <b className="font-bold text-slate-100">{typeCounts.road}</b>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span>ترکیبی (جاده+ریل):</span>
              </span>
              <b className="font-bold text-slate-100">{typeCounts.combined}</b>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                <span>ریلی اختصاصی:</span>
              </span>
              <b className="font-bold text-slate-100">{typeCounts.rail}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Top Capacity Gates */}
      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <h4 className="font-bold text-slate-300 text-xs mb-3 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <span>پرظرفیت‌ترین پایانه‌های مرزی (کامیون در روز)</span>
        </h4>
        <div className="space-y-2">
          {topGates.map((gate) => (
            <div
              key={gate.id}
              onClick={() => onFocusGate(gate)}
              className="cursor-pointer group"
            >
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="font-medium text-slate-200 group-hover:text-amber-400 transition-colors">
                  {gate.name} ({gate.country})
                </span>
                <span className="text-emerald-400 font-bold">
                  {Number(gate.trucks_est).toLocaleString('fa-IR')}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full rounded-full transition-all group-hover:brightness-125"
                  style={{ width: `${((gate.trucks_est || 0) / maxCap) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Country Distribution */}
      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <h4 className="font-bold text-slate-300 text-xs mb-3 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-teal-400" />
          <span>توزیع کشوری گذرگاه‌ها در شبکه</span>
        </h4>
        <div className="space-y-2">
          {topCountries.map(([country, count]) => (
            <div key={country}>
              <div className="flex justify-between items-center text-[11px] mb-1">
                <span className="text-slate-300">{country}</span>
                <span className="text-slate-400">{count} مرز</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-teal-500/70 h-full rounded-full"
                  style={{ width: `${(count / maxCountry) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Corridors Management */}
      <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <h4 className="font-bold text-slate-300 text-xs mb-3">کریدورهای بین‌المللی ترانزیت</h4>
        <div className="space-y-2">
          {corridors.map((c, idx) => (
            <div
              key={idx}
              onClick={() => onToggleCorridor(idx)}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 hover:bg-slate-800 border border-slate-800 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <span className="text-[11px] text-slate-200 font-medium leading-relaxed">{c.name}</span>
              </div>
              <input
                type="checkbox"
                checked={activeCorridors[idx]}
                readOnly
                className="accent-amber-400 rounded cursor-pointer"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

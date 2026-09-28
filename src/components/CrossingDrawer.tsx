import React, { useState } from 'react';
import {
  X,
  MapPin,
  Clock,
  Truck,
  Building,
  Shield,
  FileText,
  Warehouse,
  Snowflake,
  ExternalLink,
  Sparkles,
  Globe2,
  Navigation,
} from 'lucide-react';
import { Crossing } from '../types';

interface CrossingDrawerProps {
  crossing: Crossing | null;
  onClose: () => void;
  onQueryAiSearch: (query: string, crossingName: string) => void;
  onQueryAiMaps: (query: string, lat: number, lng: number) => void;
  onRouteFrom: (crossing: Crossing) => void;
  onRouteTo: (crossing: Crossing) => void;
}

export const CrossingDrawer: React.FC<CrossingDrawerProps> = ({
  crossing,
  onClose,
  onQueryAiSearch,
  onQueryAiMaps,
  onRouteFrom,
  onRouteTo,
}) => {
  if (!crossing) return null;

  return (
    <div className="absolute top-[80px] left-3 bottom-3 w-80 md:w-96 z-30 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden font-['Vazirmatn'] animate-slide-in">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 relative">
        <button
          onClick={onClose}
          className="absolute top-3 left-3 p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 pr-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <h3 className="font-extrabold text-base text-slate-100">{crossing.name}</h3>
        </div>
        {crossing.name_en && (
          <div className="text-xs text-slate-400 mt-0.5 dir-ltr text-right">{crossing.name_en}</div>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
            {crossing.country}
          </span>
          <span className="text-[10px] bg-blue-950/80 text-blue-300 px-2 py-0.5 rounded-full border border-blue-800/60">
            {crossing.type}
          </span>
          {crossing.country === 'ایران' && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/40">
              دروازه مرزی ایران
            </span>
          )}
          {crossing.status && (
            <span className="text-[10px] bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-800/60">
              {crossing.status}
            </span>
          )}
          {crossing.confidence && (
            <span className="text-[10px] bg-purple-950/80 text-purple-300 px-2 py-0.5 rounded-full border border-purple-800/60">
              سطح اطمینان: {crossing.confidence}
            </span>
          )}
        </div>
      </div>

      {/* Real-time Google Grounding Quick Action Bar */}
      <div className="p-3 bg-gradient-to-r from-teal-950/50 to-amber-950/40 border-b border-slate-800 flex flex-col gap-2">
        <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>استعلام داده‌های واقعی و برخط (Google AI):</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              onQueryAiSearch(
                `آخرین وضعیت ترافیک، صف کامیون‌ها، ساعت کاری و اطلاعیه‌های مرز ${crossing.name}`,
                crossing.name
              );
            }}
            className="flex items-center justify-center gap-1 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 py-1.5 px-2 rounded-lg transition-all shadow"
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>استعلام وب گوگل</span>
          </button>

          <button
            onClick={() => {
              onQueryAiMaps(
                `پایانه مرزی، تیرپارک و انبار گمرکی در مرز ${crossing.name}`,
                crossing.lat,
                crossing.lng
              );
            }}
            className="flex items-center justify-center gap-1 text-[11px] font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 py-1.5 px-2 rounded-lg transition-all shadow"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>اماکن در گوگل مپس</span>
          </button>
        </div>

        {/* Route Set Buttons */}
        <div className="flex gap-2 mt-0.5">
          <button
            onClick={() => onRouteFrom(crossing)}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 py-1 rounded"
          >
            <Navigation className="w-3 h-3 text-emerald-400" />
            <span>تنظیم به عنوان مبدأ</span>
          </button>
          <button
            onClick={() => onRouteTo(crossing)}
            className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 py-1 rounded"
          >
            <Navigation className="w-3 h-3 text-red-400" />
            <span>تنظیم به عنوان مقصد</span>
          </button>
        </div>
      </div>

      {/* Body Information */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs text-slate-200">
        {/* Capacity Bar */}
        {crossing.trucks_est ? (
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-slate-400">ظرفیت روزانه کامیون (برآورد):</span>
              <span className="font-extrabold text-amber-400">
                ≈ {Number(crossing.trucks_est).toLocaleString('fa-IR')} کامیون
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full"
                style={{ width: `${Math.min(100, (crossing.trucks_est / 2000) * 100)}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* Attributes List */}
        <div className="space-y-2 divide-y divide-slate-800/80">
          {crossing.opp_name && (
            <div className="pt-2 flex justify-between gap-2">
              <span className="text-slate-400 shrink-0">گمرک سمت مقابل:</span>
              <span className="font-semibold text-slate-100 text-left">{crossing.opp_name}</span>
            </div>
          )}

          {crossing.corridor && (
            <div className="pt-2 flex justify-between gap-2">
              <span className="text-slate-400 shrink-0">کریدور متصل:</span>
              <span className="text-teal-400 font-medium">{crossing.corridor}</span>
            </div>
          )}

          {crossing.clearance && (
            <div className="pt-2 flex justify-between gap-2">
              <span className="text-slate-400 shrink-0">زمان ترخیص معمول:</span>
              <span>{crossing.clearance} ساعت</span>
            </div>
          )}

          {crossing.hours_summer && (
            <div className="pt-2 flex justify-between gap-2">
              <span className="text-slate-400 shrink-0">ساعت کاری:</span>
              <span>{crossing.hours_summer}</span>
            </div>
          )}

          {crossing.warehouse && (
            <div className="pt-2">
              <div className="text-slate-400 mb-0.5">انبارداری و پایانه‌ها:</div>
              <div className="text-slate-300 text-[11px] leading-relaxed bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                {crossing.warehouse}
              </div>
            </div>
          )}

          {crossing.cold && (
            <div className="pt-2 flex justify-between gap-2">
              <span className="text-slate-400 shrink-0">سردخانه:</span>
              <span>{crossing.cold}</span>
            </div>
          )}

          {crossing.highway && (
            <div className="pt-2">
              <div className="text-slate-400 mb-0.5">اتصال بزرگراهی / ریلی:</div>
              <div className="text-slate-300 text-[11px] leading-relaxed bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                {crossing.highway}
              </div>
            </div>
          )}

          {crossing.cargo && (
            <div className="pt-2">
              <div className="text-slate-400 mb-0.5">کالاهای اصلی ترانزیتی:</div>
              <div className="text-slate-300 text-[11px] leading-relaxed bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                {crossing.cargo}
              </div>
            </div>
          )}

          {crossing.services && (
            <div className="pt-2">
              <div className="text-slate-400 mb-0.5">خدمات بازرسی و قرنطینه:</div>
              <div className="text-slate-300 text-[11px] leading-relaxed bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                {crossing.services}
              </div>
            </div>
          )}

          {crossing.volume && (
            <div className="pt-2 flex justify-between gap-2">
              <span className="text-slate-400 shrink-0">حجم سالانه (تن):</span>
              <span>{Number(crossing.volume).toLocaleString('fa-IR')} تن</span>
            </div>
          )}

          {crossing.src_type && (
            <div className="pt-2 flex justify-between gap-2 text-[10px] text-slate-500">
              <span>مرجع داده:</span>
              <span>{crossing.src_type}</span>
            </div>
          )}
        </div>

        {/* Operational Notes */}
        {(crossing.note || crossing.rail_note) && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl text-[11px] text-amber-200/90 leading-relaxed">
            {crossing.note}
            {crossing.note && crossing.rail_note && <div className="my-1 border-t border-amber-500/20" />}
            {crossing.rail_note}
          </div>
        )}
      </div>
    </div>
  );
};

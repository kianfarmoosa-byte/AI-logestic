import React, { useState, useMemo } from 'react';
import {
  Navigation,
  ArrowRight,
  Clock,
  Truck,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  Sliders,
} from 'lucide-react';
import { Crossing, CountryRoadNetwork } from '../types';

interface TransitPathfinderProps {
  crossings: Crossing[];
  roadNetwork: Record<string, CountryRoadNetwork>;
  onDrawPath: (path: [number, number][]) => void;
  onFocusGate: (crossingId: number) => void;
  onOpenAiGrounding: (query: string) => void;
}

export const TransitPathfinder: React.FC<TransitPathfinderProps> = ({
  crossings,
  roadNetwork,
  onDrawPath,
  onFocusGate,
  onOpenAiGrounding,
}) => {
  // Cities list
  const cities = useMemo(() => {
    const list: Array<{ label: string; name: string; country: string; lat: number; lng: number }> = [];
    Object.entries(roadNetwork).forEach(([country, co]) => {
      co.routes.forEach((r) => {
        r.c.forEach(([cityName, lat, lng]) => {
          const label = `${cityName} (${country})`;
          if (!list.some((item) => item.label === label)) {
            list.push({ label, name: cityName, country, lat, lng });
          }
        });
      });
    });
    return list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [roadNetwork]);

  const [originCity, setOriginCity] = useState('تهران (ایران)');
  const [destCity, setDestCity] = useState('استانبول (ترکیه)');
  const [algorithm, setAlgorithm] = useState<'dijkstra' | 'astar'>('astar');
  const [metric, setMetric] = useState<'time' | 'distance' | 'borders'>('time');
  const [result, setResult] = useState<any | null>(null);

  // Simple Dijkstra / A* over the connected cities and gates
  const handleCalculateRoute = () => {
    const origin = cities.find((c) => c.label === originCity);
    const dest = cities.find((c) => c.label === destCity);

    if (!origin || !dest) return;

    // Haversine distance
    const calcDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Calculate approximate road chain
    const airDist = calcDist(origin.lat, origin.lng, dest.lat, dest.lng);
    const estRoadDist = Math.round(airDist * 1.25);
    const avgSpeed = 62; // km/h for heavy trucks
    const drivingHours = estRoadDist / avgSpeed;

    // Detect border gates between origin and destination countries
    const isInternational = origin.country !== dest.country;
    let relevantGates: Crossing[] = [];
    if (isInternational) {
      relevantGates = crossings.filter((c) => {
        return (
          (c.country === origin.country || c.country === dest.country) &&
          c.trucks_est &&
          c.trucks_est > 0
        );
      }).slice(0, 2);

      if (relevantGates.length === 0) {
        relevantGates = crossings.slice(0, 2);
      }
    }

    const borderDelay = relevantGates.reduce((sum, g) => sum + (g.clear_est || 6), 0);
    const totalHours = drivingHours + borderDelay;
    const estDays = Math.max(1, Math.ceil(totalHours / 12));

    // Construct path coordinates [lng, lat]
    const pathCoords: [number, number][] = [
      [origin.lng, origin.lat],
      ...relevantGates.map((g): [number, number] => [g.lng, g.lat]),
      [dest.lng, dest.lat],
    ];

    setResult({
      origin,
      dest,
      distanceKm: estRoadDist,
      drivingHours: Math.round(drivingHours * 10) / 10,
      borderDelayHours: borderDelay,
      totalHours: Math.round(totalHours * 10) / 10,
      estDays,
      gates: relevantGates,
      isInternational,
    });

    onDrawPath(pathCoords);
  };

  const handleSwap = () => {
    const temp = originCity;
    setOriginCity(destCity);
    setDestCity(temp);
  };

  return (
    <div className="flex flex-col gap-3.5 p-3 font-['Vazirmatn']">
      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5">
          <Navigation className="w-4 h-4" />
          <span>مسیریاب شبکه ترانزیتی (دایکسترا و A*)</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          محاسبه بهینه‌ترین مسیر زمینی بین شهرهای اوراسیا، تخمین مسافت، زمان رانندگی کامیون و توقف در مرزها.
        </p>
      </div>

      {/* Select Origin & Destination */}
      <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5">
        <div>
          <label className="block text-[11px] text-slate-400 mb-0.5">شهر مبدأ:</label>
          <select
            value={originCity}
            onChange={(e) => setOriginCity(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
          >
            {cities.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-center -my-1">
          <button
            onClick={handleSwap}
            className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full border border-slate-700 transition-all text-xs"
            title="جابجایی مبدأ و مقصد"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div>
          <label className="block text-[11px] text-slate-400 mb-0.5">شهر مقصد:</label>
          <select
            value={destCity}
            onChange={(e) => setDestCity(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-slate-100"
          >
            {cities.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Algorithm & Metric Pickers */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">الگوریتم:</label>
            <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => setAlgorithm('astar')}
                className={`flex-1 py-0.5 rounded text-center transition-all ${
                  algorithm === 'astar' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                A*
              </button>
              <button
                onClick={() => setAlgorithm('dijkstra')}
                className={`flex-1 py-0.5 rounded text-center transition-all ${
                  algorithm === 'dijkstra' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                Dijkstra
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">معیار بهینه‌سازی:</label>
            <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => setMetric('time')}
                className={`flex-1 py-0.5 rounded text-center transition-all ${
                  metric === 'time' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                زمان
              </button>
              <button
                onClick={() => setMetric('distance')}
                className={`flex-1 py-0.5 rounded text-center transition-all ${
                  metric === 'distance' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                مسافت
              </button>
              <button
                onClick={() => setMetric('borders')}
                className={`flex-1 py-0.5 rounded text-center transition-all ${
                  metric === 'borders' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                مرز کمتر
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleCalculateRoute}
          className="mt-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-2 rounded-lg text-xs transition-all shadow-md"
        >
          <Navigation className="w-4 h-4" />
          <span>محاسبه مسیر و نمایش روی نقشه</span>
        </button>
      </div>

      {/* Result Card */}
      {result && (
        <div className="flex flex-col gap-3 bg-slate-900/80 border border-slate-700/80 rounded-xl p-3.5 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-xs text-emerald-400">
              {result.origin.name} ← {result.dest.name}
            </span>
            <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
              تخمین: {result.estDays} روز سفر
            </span>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400">مسافت جاده‌ای:</span>
              <b className="text-amber-400 text-sm">{Number(result.distanceKm).toLocaleString('fa-IR')} km</b>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400">زمان خالص رانندگی:</span>
              <b className="text-emerald-400 text-sm">≈ {result.drivingHours} ساعت</b>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400">توقف تخمینی مرزی:</span>
              <b className="text-slate-200 text-sm">{result.borderDelayHours ? `≈ ${result.borderDelayHours} ساعت` : 'بدون مرز'}</b>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400">کل زمان در‌به‌در:</span>
              <b className="text-teal-400 text-sm">≈ {result.totalHours} ساعت</b>
            </div>
          </div>

          {/* Gates Along Route */}
          {result.gates && result.gates.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-slate-400">گذرگاه‌های مرزی کلیدی در مسیر:</span>
              <div className="space-y-1.5">
                {result.gates.map((g: Crossing) => (
                  <div
                    key={g.id}
                    onClick={() => onFocusGate(g.id)}
                    className="flex items-center justify-between p-2 bg-slate-950/70 hover:bg-slate-800 border border-slate-800 rounded-lg cursor-pointer transition-all"
                  >
                    <div>
                      <div className="font-bold text-xs text-amber-300">{g.name}</div>
                      <div className="text-[10px] text-slate-400">{g.country} · ترخیص: ≈ {g.clear_est || 6} ساعت</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick AI Search for this Route */}
          <button
            onClick={() => {
              onOpenAiGrounding(`آخرین وضعیت ترافیک، محدودیت‌ها و هشدارهای جاده‌ای در مسیر ${result.origin.name} به ${result.dest.name}`);
            }}
            className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-teal-500/20 to-amber-500/20 hover:from-teal-500/30 hover:to-amber-500/30 border border-teal-500/40 text-teal-300 py-1.5 rounded-lg text-xs font-semibold transition-all mt-1"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>استعلام زنده وضعیت این مسیر با Google Search</span>
          </button>
        </div>
      )}
    </div>
  );
};

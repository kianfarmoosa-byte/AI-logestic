import React, { useState, useMemo } from 'react';
import {
  Navigation,
  Clock,
  RotateCcw,
  Sparkles,
  ChevronRight,
  ShieldAlert,
  Fuel,
  Leaf,
  Loader2,
  Coins,
} from 'lucide-react';
import { Crossing, CountryRoadNetwork } from '../types';
import { DEFAULT_CONSTRAINTS, DEFAULT_WEIGHTS, evaluateRoutes, planRoute } from '../services/routeEngine';
import { getVehicleProfile } from '../data/transportData';

interface TransitPathfinderProps {
  crossings: Crossing[];
  roadNetwork: Record<string, CountryRoadNetwork>;
  onDrawPath: (path: [number, number][]) => void;
  onFocusGate: (crossingId: number) => void;
  onOpenAiGrounding: (query: string) => void;
}

interface PathfinderCity {
  label: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

interface PathfinderResult {
  origin: PathfinderCity;
  dest: PathfinderCity;
  distanceKm: number;
  drivingHours: number;
  borderDelayHours: number;
  totalHours: number;
  estDays: number;
  gates: Crossing[];
  fuelLiters: number;
  co2Kg: number;
  costUsd: number;
  riskLevel: string;
  providerLabel: string;
  optionCount: number;
  notes: string[];
  real: boolean;
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
    const list: PathfinderCity[] = [];
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
  const [engine, setEngine] = useState<'auto' | 'osrm' | 'valhalla'>('auto');
  const [metric, setMetric] = useState<'time' | 'distance' | 'borders'>('time');
  const [result, setResult] = useState<PathfinderResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Haversine distance (فقط برای برآورد پشتیبان در حالت قطع دسترسی به موتورها)
  const calcDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  /** مسیریابی واقعی جاده‌ای با OSRM/Valhalla و ارزیابی هزینه، سوخت و کربن (پروفایل کامیون) */
  const handleCalculateRoute = async () => {
    const origin = cities.find((c) => c.label === originCity);
    const dest = cities.find((c) => c.label === destCity);
    if (!origin || !dest) return;

    setLoading(true);
    setError(null);

    const profile = getVehicleProfile('truck');

    try {
      const plan = await planRoute({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: dest.lat, lng: dest.lng },
        profile: 'truck',
        provider: engine,
        constraints: DEFAULT_CONSTRAINTS,
        alternatives: true,
      });

      const evaluated = evaluateRoutes(plan.alternatives, {
        profile,
        constraints: DEFAULT_CONSTRAINTS,
        fuelPriceUsdPerLiter: 0.72,
        utilization: 0.85,
        crossings,
        weights: DEFAULT_WEIGHTS,
      });

      const best = [...evaluated].sort((a, b) => {
        if (metric === 'distance') return a.metrics.distanceKm - b.metrics.distanceKm;
        if (metric === 'borders') return a.gates.length - b.gates.length;
        return a.metrics.totalHours - b.metrics.totalHours;
      })[0];

      const gateCrossings = best.gates
        .map((g) => crossings.find((c) => c.id === g.id))
        .filter((c): c is Crossing => Boolean(c));

      setResult({
        origin,
        dest,
        distanceKm: best.metrics.distanceKm,
        drivingHours: best.metrics.driveHours,
        borderDelayHours: best.metrics.borderHours,
        totalHours: best.metrics.totalHours,
        estDays: Math.max(1, Math.ceil(best.metrics.totalHours / 24)),
        gates: gateCrossings,
        fuelLiters: best.metrics.fuelLiters,
        co2Kg: best.metrics.co2Kg,
        costUsd: best.metrics.costUsd,
        riskLevel: best.metrics.riskLevel,
        providerLabel: plan.providerLabel,
        optionCount: plan.alternatives.length,
        notes: plan.notes,
        real: true,
      });

      onDrawPath(best.geometry);
    } catch (err: any) {
      // پشتیبان: برآورد هندسی اگر هیچ موتور مسیریابی در دسترس نباشد
      const airDist = calcDist(origin.lat, origin.lng, dest.lat, dest.lng);
      const estRoadDist = Math.round(airDist * 1.25);
      const avgSpeed = 56; // km/h برای کامیون سنگین
      const drivingHours = estRoadDist / avgSpeed;

      const isInternational = origin.country !== dest.country;
      let relevantGates: Crossing[] = [];
      if (isInternational) {
        relevantGates = crossings
          .filter((c) => (c.country === origin.country || c.country === dest.country) && c.trucks_est && c.trucks_est > 0)
          .slice(0, 2);
        if (relevantGates.length === 0) relevantGates = crossings.slice(0, 2);
      }

      const borderDelay = relevantGates.reduce((sum, g) => sum + (g.clear_est || 6), 0);
      const totalHours = drivingHours + borderDelay;
      const fuelLiters = (estRoadDist / 100) * profile.fuelPer100Km;

      setResult({
        origin,
        dest,
        distanceKm: estRoadDist,
        drivingHours: Math.round(drivingHours * 10) / 10,
        borderDelayHours: borderDelay,
        totalHours: Math.round(totalHours * 10) / 10,
        estDays: Math.max(1, Math.ceil(totalHours / 24)),
        gates: relevantGates,
        fuelLiters: Math.round(fuelLiters * 10) / 10,
        co2Kg: Math.round(fuelLiters * profile.co2PerLiter * 10) / 10,
        costUsd: Math.round(fuelLiters * 0.72 + totalHours * profile.driverPerHour + estRoadDist * profile.costPerKm),
        riskLevel: 'برآوردی',
        providerLabel: 'برآورد هندسی پشتیبان (بدون موتور مسیریابی)',
        optionCount: 1,
        notes: ['دسترسی به موتورهای مسیریابی برقرار نشد؛ اعداد زیر تخمین خط مستقیم با ضریب راه است.'],
        real: false,
      });

      setError(err?.message || 'محاسبهٔ مسیر واقعی ناموفق بود؛ برآورد پشتیبان نمایش داده شد.');
      onDrawPath([
        [origin.lng, origin.lat],
        ...relevantGates.map((g): [number, number] => [g.lng, g.lat]),
        [dest.lng, dest.lat],
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = () => {
    const temp = originCity;
    setOriginCity(destCity);
    setDestCity(temp);
  };

  return (
    <div className="flex flex-col gap-3.5 p-3 font-['Vazirmatn']">
      <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="text-xs font-bold text-[var(--tone-amber)] mb-1 flex items-center gap-1.5">
          <Navigation className="w-4 h-4" />
          <span>مسیریاب شبکه ترانزیتی با موتور واقعی جاده‌ای</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          محاسبهٔ مسیر بین شهرهای اوراسیا با هندسهٔ واقعی جاده (OSRM بدون کلید یا Valhalla با پروفایل کامیون)، همراه با تعداد
          گذرگاه‌های مرزی، مصرف سوخت، انتشار CO₂ و هزینهٔ برآوردی سفر.
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

        {/* Engine & Metric Pickers */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">موتور مسیریابی:</label>
            <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => setEngine('auto')}
                className={`flex-1 py-0.5 rounded text-center transition-all ${
                  engine === 'auto' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                خودکار
              </button>
              <button
                onClick={() => setEngine('osrm')}
                className={`flex-1 py-0.5 rounded text-center transition-all ${
                  engine === 'osrm' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                OSRM
              </button>
              <button
                onClick={() => setEngine('valhalla')}
                className={`flex-1 py-0.5 rounded text-center transition-all ${
                  engine === 'valhalla' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                Valhalla
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-0.5">معیار انتخاب گزینه:</label>
            <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => setMetric('time')}
                className={`flex-1 py-0.5 rounded text-center transition-all ${
                  metric === 'time' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                سریع‌ترین
              </button>
              <button
                onClick={() => setMetric('distance')}
                className={`flex-1 py-0.5 rounded text-center transition-all ${
                  metric === 'distance' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400'
                }`}
              >
                کوتاه‌ترین
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
          disabled={loading}
          className="mt-1 flex items-center justify-center gap-1.5 btn-cmd-green disabled:opacity-50 font-bold py-2 rounded-lg text-xs transition-all shadow-md"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
          <span>{loading ? 'در حال دریافت مسیر واقعی جاده…' : 'محاسبه مسیر و نمایش روی نقشه'}</span>
        </button>

        {error && (
          <p className="text-[10px] text-[var(--tone-amber)] bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 leading-relaxed">
            {error}
          </p>
        )}
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

          <div className="flex items-center justify-between text-[10px]">
            <span className={`flex items-center gap-1.5 ${result.real ? 'text-[var(--cmd-green)]' : 'text-[var(--tone-amber)]'}`}>
              <span className={`w-2 h-2 rounded-full ${result.real ? 'bg-teal-400' : 'bg-amber-400'}`} />
              {result.providerLabel}
            </span>
            <span className="text-slate-400">{result.optionCount} گزینهٔ مسیر بررسی شد</span>
          </div>

          {/* Metric Badges */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400">مسافت جاده‌ای:</span>
              <b className="text-[var(--tone-amber)] text-sm">{Number(result.distanceKm).toLocaleString('fa-IR')} km</b>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400">زمان خالص رانندگی:</span>
              <b className="text-emerald-400 text-sm">≈ {result.drivingHours} ساعت</b>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400">توقف تخمینی مرزی:</span>
              <b className="text-slate-200 text-sm">
                {result.borderDelayHours ? `≈ ${result.borderDelayHours} ساعت` : 'بدون مرز'}
              </b>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400">کل زمان در‌به‌در:</span>
              <b className="text-[var(--cmd-green)] text-sm">≈ {result.totalHours} ساعت</b>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400 flex items-center gap-1">
                <Fuel className="w-3 h-3" />
                مصرف سوخت:
              </span>
              <b className="text-orange-300 text-sm">{Number(result.fuelLiters).toLocaleString('fa-IR')} لیتر</b>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400 flex items-center gap-1">
                <Leaf className="w-3 h-3" />
                انتشار کربن:
              </span>
              <b className="text-lime-300 text-sm">{Number(result.co2Kg).toLocaleString('fa-IR')} kg CO₂</b>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400 flex items-center gap-1">
                <Coins className="w-3 h-3" />
                هزینهٔ برآوردی:
              </span>
              <b className="text-emerald-300 text-sm">{Number(result.costUsd).toLocaleString('fa-IR')} دلار</b>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="block text-[10px] text-slate-400 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" />
                ریسک مسیر:
              </span>
              <b className="text-slate-200 text-sm">{result.riskLevel}</b>
            </div>
          </div>

          {result.notes.length > 0 && (
            <ul className="text-[10px] text-slate-400 leading-relaxed space-y-1">
              {result.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          )}

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
                      <div className="font-bold text-xs text-[var(--tone-amber)]">{g.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {g.country} · ترخیص: ≈ {g.clear_est || 6} ساعت
                      </div>
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
              onOpenAiGrounding(
                `آخرین وضعیت ترافیک، محدودیت‌ها و هشدارهای جاده‌ای در مسیر ${result.origin.name} به ${result.dest.name}`
              );
            }}
            className="flex items-center justify-center gap-1.5 bg-[var(--cmd-green-soft)] hover:brightness-95 border border-[var(--cmd-green-ring)] text-[var(--cmd-green)] py-1.5 rounded-lg text-xs font-semibold transition-all mt-1"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--tone-amber)]" />
            <span>استعلام زندهٔ وضعیت این مسیر با دستیار هوشمند</span>
          </button>
        </div>
      )}

      {!result && !loading && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-3 text-[10px] text-slate-400 leading-relaxed flex items-start gap-2">
          <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
          <span>
            برای مقایسهٔ گزینه‌های مسیر، سبد بار چندمقصد، ایزوکرون دسترسی و زمان‌بندی ریل/دریا/هوا از تب «مسیریاب حمل و نقل» استفاده
            کنید.
          </span>
        </div>
      )}
    </div>
  );
};

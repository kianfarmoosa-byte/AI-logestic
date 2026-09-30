import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  Compass,
  Footprints,
  Gauge,
  Leaf,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Save,
  ShieldAlert,
  Sparkles,
  Target,
  Truck,
  Bus,
  Waves,
  Layers,
} from 'lucide-react';
import {
  Crossing,
  CountryRoadNetwork,
  EvaluatedRoute,
  IsochroneOverlay,
  LatLng,
  LoadBasketItem,
  ObjectiveWeights,
  RouteAlternative,
  RouteConstraints,
  RouteEngineStatus,
  RouteOverlay,
  RoutePlanResponse,
  RouteProfileId,
  RouteProviderId,
  SavedRoute,
} from '../types';
import { ROUTE_PRESETS, VEHICLE_PROFILES, getVehicleProfile, ADR_CLASSES } from '../data/transportData';
import {
  DEFAULT_CONSTRAINTS,
  DEFAULT_WEIGHTS,
  WEIGHT_PRESETS,
  evaluateRoutes,
  fetchRouteEngineStatus,
  newId,
  planIsochrone,
  planRoute,
  providerColor,
  saveOrganizationalRoute,
} from '../services/routeEngine';
import { LoadBasketPanel, ManualRoutePanel, ScheduleBoard } from './RouteToolkit';

interface PickedLocation {
  lat: number;
  lng: number;
  name?: string;
  target: 'origin' | 'destination';
  seq: number;
}

interface RouteStudioProps {
  crossings: Crossing[];
  roadNetwork: Record<string, CountryRoadNetwork>;
  onDrawOverlays: (overlays: RouteOverlay[]) => void;
  onDrawIsochrones: (overlays: IsochroneOverlay[]) => void;
  onFocusGate: (crossingId: number) => void;
  onRequestPick: (target: 'origin' | 'destination' | null) => void;
  pickTarget: 'origin' | 'destination' | null;
  pickedLocation: PickedLocation | null;
  onOpenAiGrounding: (query: string) => void;
  draftPath: [number, number][];
  drawMode: boolean;
  onToggleDraw: (active: boolean) => void;
  onUndoDraw: () => void;
  onClearDraw: () => void;
  savedRoutes: SavedRoute[];
  onSavedRoutesChange: (routes: SavedRoute[]) => void;
}

type SubTab = 'plan' | 'iso' | 'basket' | 'schedule' | 'draw';

const PROFILE_ICONS: Record<RouteProfileId, React.ReactNode> = {
  car: <Car className="w-3.5 h-3.5" />,
  bus: <Bus className="w-3.5 h-3.5" />,
  truck: <Truck className="w-3.5 h-3.5" />,
  truck_adr: <ShieldAlert className="w-3.5 h-3.5" />,
  pedestrian: <Footprints className="w-3.5 h-3.5" />,
};

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'plan', label: 'مسیر و مقایسه', icon: <RouteIcon className="w-3.5 h-3.5" /> },
  { id: 'iso', label: 'ایزوکرون', icon: <Compass className="w-3.5 h-3.5" /> },
  { id: 'basket', label: 'سبد بار', icon: <Layers className="w-3.5 h-3.5" /> },
  { id: 'schedule', label: 'ریل/دریا/هوا', icon: <Waves className="w-3.5 h-3.5" /> },
  { id: 'draw', label: 'ترسیم دستی', icon: <Target className="w-3.5 h-3.5" /> },
];

const RISK_CLASS: Record<string, string> = {
  کم: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  متوسط: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  بالا: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  بحرانی: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

const fa = (value: number, digits = 0) =>
  value.toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const RouteStudio: React.FC<RouteStudioProps> = ({
  crossings,
  roadNetwork,
  onDrawOverlays,
  onDrawIsochrones,
  onFocusGate,
  onRequestPick,
  pickTarget,
  pickedLocation,
  onOpenAiGrounding,
  draftPath,
  drawMode,
  onToggleDraw,
  onUndoDraw,
  onClearDraw,
  savedRoutes,
  onSavedRoutesChange,
}) => {
  const cities = useMemo(() => {
    const list: { label: string; name: string; country: string; lat: number; lng: number }[] = [];
    Object.entries(roadNetwork).forEach(([country, co]) => {
      co.routes.forEach((r) => {
        r.c.forEach(([cityName, lat, lng]) => {
          const label = `${cityName} (${country})`;
          if (!list.some((item) => item.label === label)) list.push({ label, name: cityName, country, lat, lng });
        });
      });
    });
    return list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }, [roadNetwork]);

  const [subTab, setSubTab] = useState<SubTab>('plan');
  const [profileId, setProfileId] = useState<RouteProfileId>('truck');
  const [provider, setProvider] = useState<RouteProviderId>('auto');
  const [origin, setOrigin] = useState<{ name: string } & LatLng>({
    name: ROUTE_PRESETS[0].origin.name,
    lat: ROUTE_PRESETS[0].origin.lat,
    lng: ROUTE_PRESETS[0].origin.lng,
  });
  const [destination, setDestination] = useState<{ name: string } & LatLng>({
    name: ROUTE_PRESETS[0].destination.name,
    lat: ROUTE_PRESETS[0].destination.lat,
    lng: ROUTE_PRESETS[0].destination.lng,
  });
  const [activePreset, setActivePreset] = useState<string | null>(ROUTE_PRESETS[0].id);
  const [constraints, setConstraints] = useState<RouteConstraints>({ ...DEFAULT_CONSTRAINTS });
  const [weights, setWeights] = useState<ObjectiveWeights>({ ...DEFAULT_WEIGHTS });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fuelPrice, setFuelPrice] = useState(0.72);
  const [utilization, setUtilization] = useState(0.85);
  const [weightTonsInput, setWeightTonsInput] = useState(24);

  const [plan, setPlan] = useState<RoutePlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [engineStatus, setEngineStatus] = useState<RouteEngineStatus | null>(null);
  const [statusChecked, setStatusChecked] = useState(false);

  const [isoHours, setIsoHours] = useState<number[]>([2, 4, 6, 8, 12]);
  const [isoCenter, setIsoCenter] = useState<'origin' | 'destination'>('origin');
  // C3: سوییچ پروفایل کامیون سنگین برای ایزوکرون — در نبود کلید ORS به‌صورت خودکار به موتورهای بدون کلید برمی‌گردد
  const [isoHgv, setIsoHgv] = useState(false);
  const [isoOverlays, setIsoOverlays] = useState<IsochroneOverlay[]>([]);
  const [isoNote, setIsoNote] = useState<string | null>(null);
  const [isoLoading, setIsoLoading] = useState(false);
  const [isoError, setIsoError] = useState<string | null>(null);

  const lastPickSeq = useRef<number>(-1);
  const drawRef = useRef(onDrawOverlays);
  drawRef.current = onDrawOverlays;

  const profile = getVehicleProfile(profileId);

  useEffect(() => {
    let alive = true;
    fetchRouteEngineStatus().then((status) => {
      if (!alive) return;
      setEngineStatus(status);
      setStatusChecked(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // اعمال مختصات انتخاب‌شده روی نقشه
  useEffect(() => {
    if (!pickedLocation || pickedLocation.seq === lastPickSeq.current) return;
    lastPickSeq.current = pickedLocation.seq;
    const label = pickedLocation.name || `نقطهٔ نقشه (${pickedLocation.lat.toFixed(2)}°, ${pickedLocation.lng.toFixed(2)}°)`;
    if (pickedLocation.target === 'origin') {
      setOrigin({ name: label, lat: pickedLocation.lat, lng: pickedLocation.lng });
    } else {
      setDestination({ name: label, lat: pickedLocation.lat, lng: pickedLocation.lng });
    }
  }, [pickedLocation]);

  const evaluated = useMemo(() => {
    if (!plan?.alternatives?.length) return [];
    return evaluateRoutes(plan.alternatives, {
      profile,
      constraints,
      fuelPriceUsdPerLiter: fuelPrice,
      utilization,
      crossings,
      weights,
    });
  }, [plan, profile, constraints, fuelPrice, utilization, crossings, weights]);

  useEffect(() => {
    const overlays = evaluated
      .filter((route) => visibleIds.includes(route.id))
      .map((route, idx) => ({
        id: route.id,
        label: route.label,
        color: providerColor(idx),
        coordinates: route.geometry,
        dash: idx > 0,
        width: idx === 0 ? 5 : 3.2,
      }));
    drawRef.current(overlays);
  }, [evaluated, visibleIds]);

  const best = useMemo(() => {
    if (evaluated.length === 0) return null;
    return [...evaluated].sort((a, b) => a.metrics.rank - b.metrics.rank)[0];
  }, [evaluated]);

  const objectiveLeaders = useMemo(() => {
    if (evaluated.length === 0) return null;
    const by = <K extends keyof EvaluatedRoute['metrics']>(key: K) =>
      [...evaluated].sort((a, b) => Number(a.metrics[key]) - Number(b.metrics[key]))[0];
    return {
      fastest: by('totalHours'),
      cheapest: by('costUsd'),
      safest: by('riskScore'),
      greenest: by('co2Kg'),
    };
  }, [evaluated]);

  const computeRoute = async (override?: {
    origin?: { name: string } & LatLng;
    destination?: { name: string } & LatLng;
    profileId?: RouteProfileId;
  }) => {
    const from = override?.origin || origin;
    const to = override?.destination || destination;
    setLoading(true);
    setError(null);
    try {
      const response = await planRoute({
        origin: { lat: from.lat, lng: from.lng },
        destination: { lat: to.lat, lng: to.lng },
        profile: override?.profileId || profileId,
        provider,
        constraints,
        alternatives: true,
      });
      setPlan(response);
      setVisibleIds(response.alternatives.map((a: RouteAlternative) => a.id));
    } catch (err: any) {
      setPlan(null);
      setVisibleIds([]);
      setError(err?.message || 'محاسبهٔ مسیر ناموفق بود.');
      onDrawOverlays([]);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (presetId: string) => {
    const preset = ROUTE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePreset(preset.id);
    setProfileId(preset.profile);
    setOrigin({ name: preset.origin.name, lat: preset.origin.lat, lng: preset.origin.lng });
    setDestination({
      name: preset.destination.name,
      lat: preset.destination.lat,
      lng: preset.destination.lng,
    });
    setSubTab('plan');
    computeRoute({ origin: preset.origin, destination: preset.destination, profileId: preset.profile });
  };

  const handleSaveRoute = (route: EvaluatedRoute) => {
    const saved: SavedRoute = {
      id: newId('route'),
      name: `${origin.name} ← ${destination.name}`,
      owner: 'کاربر اطلس',
      createdAt: new Date().toISOString(),
      source: 'planned',
      profile: profileId,
      originLabel: origin.name,
      destinationLabel: destination.name,
      distanceKm: route.metrics.distanceKm,
      durationHours: route.metrics.totalHours,
      fuelLiters: route.metrics.fuelLiters,
      co2Kg: route.metrics.co2Kg,
      costUsd: route.metrics.costUsd,
      cargo: constraints.adrClass || 'کالای عمومی',
      notes: `${route.label} — ${plan?.providerLabel || ''}`,
      geometry: route.geometry,
    };
    onSavedRoutesChange(saveOrganizationalRoute(saved));
  };

  const runIsochrone = async () => {
    const center = isoCenter === 'origin' ? origin : destination;
    setIsoLoading(true);
    setIsoError(null);
    setIsoNote(null);
    try {
      const result = await planIsochrone({
        center: { lat: center.lat, lng: center.lng },
        hours: isoHours.length ? isoHours : [2, 4, 6],
        profile: isoHgv ? 'truck' : profileId,
      });
      setIsoOverlays(result.overlays);
      onDrawIsochrones(result.overlays);
      setIsoNote([result.providerLabel, ...result.notes].join(' — '));
    } catch (err: any) {
      setIsoOverlays([]);
      onDrawIsochrones([]);
      setIsoError(err?.message || 'محاسبهٔ ایزوکرون ناموفق بود.');
    } finally {
      setIsoLoading(false);
    }
  };

  const updateConstraints = (patch: Partial<RouteConstraints>) =>
    setConstraints((prev) => ({ ...prev, ...patch }));

  return (
    <div className="flex flex-col gap-3 p-3 font-['Vazirmatn']">
      {/* Sub navigation */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all shrink-0 ${
              subTab === tab.id
                ? 'btn-cmd-green shadow'
                : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Engine status */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" />
            موتورهای مسیریابی متصل
          </span>
          <button
            onClick={() => {
              setStatusChecked(false);
              fetchRouteEngineStatus().then((s) => {
                setEngineStatus(s);
                setStatusChecked(true);
              });
            }}
            className="text-[10px] text-slate-400 hover:text-[var(--cmd-green)] flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${statusChecked ? '' : 'animate-spin'}`} />
            بررسی مجدد
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          <EngineBadge
            title="OSRM"
            ok={engineStatus ? engineStatus.osrm.available : null}
            hint="بدون کلید — مسیریابی جاده‌ای استاندارد"
          />
          <EngineBadge
            title="Valhalla"
            ok={engineStatus ? engineStatus.valhalla.available : null}
            hint={
              engineStatus?.valhalla.selfHosted
                ? 'نمونهٔ خودمیزبان سازمانی'
                : 'نمونهٔ عمومی OSM — پروفایل کامیون و ایزوکرون'
            }
          />
          <EngineBadge
            title="ORS"
            ok={engineStatus ? engineStatus.ors.available : null}
            hint={engineStatus?.ors.keyPresent ? 'کلید ORS_API_KEY فعال است' : 'بدون کلید — HGV سازمانی غیرفعال'}
          />
        </div>
        {engineStatus && !engineStatus.ors.keyPresent && (
          <p className="text-[10px] text-slate-500 leading-relaxed">
            برای فعال‌سازی پروفایل HGV سازمانی و ایزوکرون OpenRouteService، کلید <code className="text-amber-300">ORS_API_KEY</code> را
            در بخش تنظیمات › Environment (Keys) وارد کنید. همهٔ قابلیت‌های جاری بدون کلید کار می‌کنند.
          </p>
        )}
      </div>

      {subTab === 'plan' && (
        <>
          {/* Corridor presets */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-[var(--cmd-green)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              مسیرهای پرتردد پیشنهادی (یک کلیک)
            </span>
            <div className="grid grid-cols-1 gap-1.5">
              {ROUTE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  className={`text-right p-2 rounded-lg border transition-all ${
                    activePreset === preset.id
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: preset.color }} />
                    <span className="text-[11px] font-bold text-slate-100">{preset.title}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{preset.subtitle}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {preset.highlights.slice(0, 2).map((h) => (
                      <span key={h} className="text-[9px] bg-slate-800/70 text-slate-300 px-1.5 py-0.5 rounded">
                        {h}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Profile */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-amber-400">پروفایل وسیله / کاربر مسیر</span>
            <div className="grid grid-cols-2 gap-1.5">
              {VEHICLE_PROFILES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProfileId(p.id)}
                  className={`flex items-center gap-1.5 p-2 rounded-lg border text-[11px] transition-all ${
                    profileId === p.id
                      ? 'border-teal-500/60 bg-[var(--cmd-green-soft)] text-teal-200 font-bold'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {PROFILE_ICONS[p.id]}
                  <span>{p.short}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">{profile.description}</p>
          </div>

          {/* Origin / destination */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-400">مبدأ و مقصد</span>
              <button
                onClick={() => {
                  const temp = origin;
                  setOrigin(destination);
                  setDestination(temp);
                }}
                className="text-[10px] text-slate-400 hover:text-[var(--cmd-green)] flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                جابجایی
              </button>
            </div>

            <EndpointRow
              title="مبدأ"
              value={origin}
              cities={cities}
              onSelectCity={(city) => setOrigin({ name: city.label, lat: city.lat, lng: city.lng })}
              onPick={() => onRequestPick(pickTarget === 'origin' ? null : 'origin')}
              picking={pickTarget === 'origin'}
            />
            <EndpointRow
              title="مقصد"
              value={destination}
              cities={cities}
              onSelectCity={(city) => setDestination({ name: city.label, lat: city.lat, lng: city.lng })}
              onPick={() => onRequestPick(pickTarget === 'destination' ? null : 'destination')}
              picking={pickTarget === 'destination'}
            />

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
              <label className="text-[10px] text-slate-400 flex flex-col gap-1">
                موتور مسیریابی
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as RouteProviderId)}
                  className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
                >
                  <option value="auto">خودکار (بهینه بر اساس پروفایل)</option>
                  <option value="osrm">OSRM — بدون کلید</option>
                  <option value="valhalla">Valhalla — کامیون و محدودیت‌ها</option>
                  <option value="ors">OpenRouteService — نیازمند کلید</option>
                </select>
              </label>
              <label className="text-[10px] text-slate-400 flex flex-col gap-1">
                تناژ محموله برای مقایسهٔ شیوه‌ها (تن)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={weightTonsInput}
                  onChange={(e) => setWeightTonsInput(Number(e.target.value) || 0)}
                  className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
                />
              </label>
            </div>

            <button
              onClick={() => computeRoute()}
              disabled={loading}
              className="mt-1 flex items-center justify-center gap-1.5 btn-cmd-green disabled:opacity-50 font-bold py-2 rounded-lg text-xs transition-all shadow-md"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
              <span>{loading ? 'در حال محاسبهٔ مسیر واقعی…' : 'محاسبهٔ مسیر و مقایسهٔ گزینه‌ها'}</span>
            </button>
            {error && (
              <p className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2 leading-relaxed">
                {error}
              </p>
            )}
          </div>

          {/* Constraints */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center justify-between text-[11px] font-bold text-amber-400"
            >
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                محدودیت‌های فیزیکی و کالای خطرناک
              </span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAdvanced && (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <NumberField
                    label="ارتفاع (متر)"
                    value={constraints.heightM}
                    step={0.1}
                    onChange={(v) => updateConstraints({ heightM: v })}
                  />
                  <NumberField
                    label="وزن کل (تن)"
                    value={constraints.weightTons}
                    step={0.5}
                    onChange={(v) => updateConstraints({ weightTons: v })}
                  />
                  <NumberField
                    label="عرض (متر)"
                    value={constraints.widthM}
                    step={0.05}
                    onChange={(v) => updateConstraints({ widthM: v })}
                  />
                  <NumberField
                    label="طول (متر)"
                    value={constraints.lengthM}
                    step={0.5}
                    onChange={(v) => updateConstraints({ lengthM: v })}
                  />
                  <NumberField
                    label="بار محور (تن)"
                    value={constraints.axleLoadTons}
                    step={0.5}
                    onChange={(v) => updateConstraints({ axleLoadTons: v })}
                  />
                  <label className="text-[10px] text-slate-400 flex flex-col gap-1">
                    کلاس ADR
                    <select
                      value={constraints.adrClass}
                      onChange={(e) => updateConstraints({ adrClass: e.target.value, hazmat: e.target.value !== '' })}
                      className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[10px] text-slate-100"
                    >
                      {ADR_CLASSES.map((c) => (
                        <option key={c || 'none'} value={c}>
                          {c || 'بدون کالای خطرناک'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 text-[10px]">
                  <ToggleChip
                    label="حمل ADR فعال"
                    active={constraints.hazmat}
                    onClick={() => updateConstraints({ hazmat: !constraints.hazmat })}
                  />
                  <ToggleChip
                    label="بار یخچالی / زنجیرهٔ سرد"
                    active={constraints.tempControlled}
                    onClick={() => updateConstraints({ tempControlled: !constraints.tempControlled })}
                  />
                  <ToggleChip
                    label={`ظرفیت مفید پروفایل: ${fa(profile.payloadTons)} تن`}
                    active={false}
                    onClick={() => updateConstraints({ weightTons: profile.payloadTons })}
                  />
                </div>

                <p className="text-[10px] text-slate-500 leading-relaxed">
                  با موتور Valhalla این مقادیر به‌صورت مستقیم روی گراف کامیون اعمال می‌شوند و با OpenRouteService (در صورت وجود کلید) به
                  پروفایل HGV فرستاده می‌شوند؛ در حالت OSRM مسیر برآوردی محاسبه و هشدارهای محدودیت نمایش داده می‌شود.
                </p>
              </div>
            )}
          </div>

          {/* Objective weights */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-[var(--cmd-green)] flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              بهینه‌ساز چندهدفه (زمان، هزینه، ریسک، کربن)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {WEIGHT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setWeights({ ...preset.weights })}
                  className="text-[10px] px-2 py-1 rounded-lg border border-slate-800 bg-slate-950/60 text-slate-300 hover:border-teal-500/50 hover:text-teal-200 transition-all"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <WeightSlider label="زمان" icon={<Clock className="w-3 h-3" />} value={weights.time} onChange={(v) => setWeights((w) => ({ ...w, time: v }))} />
            <WeightSlider label="هزینه" icon={<Coins className="w-3 h-3" />} value={weights.cost} onChange={(v) => setWeights((w) => ({ ...w, cost: v }))} />
            <WeightSlider label="ریسک" icon={<ShieldAlert className="w-3 h-3" />} value={weights.risk} onChange={(v) => setWeights((w) => ({ ...w, risk: v }))} />
            <WeightSlider label="کربن" icon={<Leaf className="w-3 h-3" />} value={weights.carbon} onChange={(v) => setWeights((w) => ({ ...w, carbon: v }))} />

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
              <NumberField label="قیمت سوخت (دلار/لیتر)" value={fuelPrice} step={0.01} onChange={setFuelPrice} />
              <NumberField
                label="ضریب بارگیری (۰ تا ۱)"
                value={utilization}
                step={0.05}
                onChange={(v) => setUtilization(Math.max(0.1, Math.min(1, v)))}
              />
            </div>
          </div>

          {/* Provider result meta */}
          {plan && (
            <div className="bg-slate-900/70 border border-slate-700/70 rounded-xl p-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                  <RouteIcon className="w-3.5 h-3.5" />
                  {plan.providerLabel}
                </span>
                <span className="text-[10px] text-slate-400">
                  پروفایل موتور: {plan.costing} · {fa(plan.alternatives.length)} گزینه
                </span>
              </div>
              {plan.degraded && (
                <p className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
                  این پاسخ در حالت پشتیبان محاسبه شده و محدودیت‌های کامیون روی گراف اعمال نشده است.
                </p>
              )}
              {plan.notes.map((note) => (
                <p key={note} className="text-[10px] text-slate-400 leading-relaxed">
                  • {note}
                </p>
              ))}
            </div>
          )}

          {/* Objective leaders */}
          {objectiveLeaders && (
            <div className="grid grid-cols-2 gap-2">
              <LeaderCard title="سریع‌ترین" value={objectiveLeaders.fastest} unit={`${fa(objectiveLeaders.fastest.metrics.totalHours, 1)} ساعت`} />
              <LeaderCard title="ارزان‌ترین" value={objectiveLeaders.cheapest} unit={`${fa(objectiveLeaders.cheapest.metrics.costUsd)} دلار`} />
              <LeaderCard title="کم‌ریسک‌ترین" value={objectiveLeaders.safest} unit={`ریسک ${fa(objectiveLeaders.safest.metrics.riskScore)}`} />
              <LeaderCard title="سبزترین" value={objectiveLeaders.greenest} unit={`${fa(objectiveLeaders.greenest.metrics.co2Kg)} کیلوگرم CO₂`} />
            </div>
          )}

          {/* Alternatives */}
          {evaluated.map((route) => (
            <div key={route.id} className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      route.metrics.rank === 1
                        ? 'tab-active-green'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    رتبهٔ {fa(route.metrics.rank)}
                  </span>
                  <span className="text-[11px] font-bold text-slate-100">{route.label}</span>
                </div>
                <button
                  onClick={() => setVisibleIds((ids) => (ids.includes(route.id) ? ids.filter((i) => i !== route.id) : [...ids, route.id]))}
                  className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
                    visibleIds.includes(route.id)
                      ? 'border-teal-500/50 text-teal-200 bg-[var(--cmd-green-soft)]'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  {visibleIds.includes(route.id) ? 'پنهان از نقشه' : 'نمایش روی نقشه'}
                </button>
              </div>

              {/* Score bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--cmd-green)]"
                    style={{ width: `${Math.max(3, Math.min(100, route.metrics.score))}%` }}
                  />
                </div>
                <span className="text-[10px] text-amber-300 font-bold">{fa(route.metrics.score, 1)}</span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <Stat label="مسافت جاده‌ای" value={`${fa(route.metrics.distanceKm, 1)} km`} tone="text-amber-300" />
                <Stat label="کل زمان در‌به‌در" value={`${fa(route.metrics.totalHours, 1)} ساعت`} tone="text-[var(--cmd-green)]" />
                <Stat label="رانندگی / استراحت" value={`${fa(route.metrics.driveHours, 1)} / ${fa(route.metrics.restHours, 1)} ساعت`} />
                <Stat label="توقف مرزی تخمینی" value={`${fa(route.metrics.borderHours, 1)} ساعت`} />
                <Stat label="مصرف سوخت" value={`${fa(route.metrics.fuelLiters, 1)} لیتر`} tone="text-orange-300" />
                <Stat label="انتشار کربن" value={`${fa(route.metrics.co2Kg, 1)} kg CO₂`} tone="text-lime-300" />
                <Stat label="هزینهٔ کل" value={`${fa(route.metrics.costUsd)} دلار`} tone="text-emerald-300" />
                <Stat label="گذرگاه‌های مرزی" value={`${fa(route.gates.length)} مورد`} />
              </div>

              <div className="flex items-center justify-between text-[10px] bg-slate-950 rounded-lg border border-slate-800 p-2">
                <span className="text-slate-400">
                  سوخت {fa(route.metrics.fuelUsd)}$ · راننده {fa(route.metrics.driverUsd)}$ · عوارض {fa(route.metrics.tollUsd)}$ ·
                  استهلاک {fa(route.metrics.maintenanceUsd)}$ · مرز {fa(route.metrics.borderUsd)}$
                </span>
                <span className={`px-2 py-0.5 rounded-full border ${RISK_CLASS[route.metrics.riskLevel]}`}>
                  ریسک {route.metrics.riskLevel} ({fa(route.metrics.riskScore)})
                </span>
              </div>

              {route.gates.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-slate-400">گذرگاه‌های نزدیک مسیر:</span>
                  <div className="flex flex-wrap gap-1">
                    {route.gates.slice(0, 6).map((gate) => (
                      <button
                        key={`${route.id}-${gate.id}`}
                        onClick={() => onFocusGate(gate.id)}
                        className="text-[10px] bg-slate-950/80 hover:bg-slate-800 border border-slate-800 rounded-lg px-2 py-1 text-slate-300"
                      >
                        {gate.name} · {gate.country}
                        {gate.clearHours ? ` · ترخیص ≈ ${fa(gate.clearHours, 1)} ساعت` : ''}
                      </button>
                    ))}
                    {route.gates.length > 6 && (
                      <span className="text-[10px] text-slate-500 px-2 py-1">
                        + {fa(route.gates.length - 6)} گذرگاه دیگر
                      </span>
                    )}
                  </div>
                </div>
              )}

              {(route.violations.length > 0 || route.metrics.riskReasons.length > 0) && (
                <details className="text-[10px] text-slate-400">
                  <summary className="cursor-pointer text-amber-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {route.violations.length > 0
                      ? `${fa(route.violations.length)} هشدار محدودیت فیزیکی/مقرراتی`
                      : 'تحلیل ریسک مسیر'}
                  </summary>
                  <ul className="mt-1 space-y-1 pr-3">
                    {[...route.violations, ...route.metrics.riskReasons].slice(0, 6).map((reason, idx) => (
                      <li key={`${route.id}-reason-${idx}`} className="list-disc leading-relaxed">
                        {reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  onClick={() => handleSaveRoute(route)}
                  className="flex items-center gap-1 text-[10px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-2 py-1.5 rounded-lg"
                >
                  <Save className="w-3 h-3" />
                  ذخیره به‌عنوان مسیر سازمانی
                </button>
                <button
                  onClick={() =>
                    onOpenAiGrounding(
                      `وضعیت لحظه‌ای جاده، محدودیت‌های فصلی و صف مرزی در مسیر ${origin.name} به ${destination.name} با پروفایل ${
                        profile.label
                      }`
                    )
                  }
                  className="flex items-center gap-1 text-[10px] bg-[var(--cmd-green-soft)] border border-[var(--cmd-green-ring)] text-[var(--cmd-green)] px-2 py-1.5 rounded-lg"
                >
                  <Sparkles className="w-3 h-3" />
                  استعلام هوشمند مسیر
                </button>
              </div>
            </div>
          ))}

          {best && (
            <div className="bg-[var(--cmd-green-soft)] border border-[var(--cmd-green-ring)] rounded-xl p-3 text-[10px] text-teal-200 leading-relaxed">
              <b className="text-[var(--cmd-green)]">پیشنهاد نهایی: </b>
              گزینهٔ «{best.label}» با امتیاز {fa(best.metrics.score, 1)} از ۱۰۰ بر پایهٔ وزن‌های فعلی شما انتخاب شد؛ مسافت{' '}
              {fa(best.metrics.distanceKm, 1)} کیلومتر، زمان {fa(best.metrics.totalHours, 1)} ساعت و هزینهٔ برآوردی{' '}
              {fa(best.metrics.costUsd)} دلار.
            </div>
          )}
        </>
      )}

      {subTab === 'iso' && (
        <>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2.5">
            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              ایزوکرون دسترسی ۲ تا ۱۲ ساعته
            </span>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              محدوده‌ای که از مرکز انتخاب‌شده با پروفایل «{isoHgv ? 'کامیون سنگین (HGV)' : profile.label}» در بازهٔ زمانی مشخص قابل دسترسی است. محاسبه به‌صورت
              پیش‌فرض با Valhalla (بدون کلید) و در صورت خطا با OpenRouteService انجام می‌شود.
              {isoHgv && ' پروفایل کامیون سنگین فعال است؛ با کلید ORS_API_KEY از موتور HGV سازمانی OpenRouteService محاسبه می‌شود.'}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {(['origin', 'destination'] as const).map((target) => (
                <button
                  key={target}
                  onClick={() => setIsoCenter(target)}
                  className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
                    isoCenter === target
                      ? 'border-teal-500/60 bg-[var(--cmd-green-soft)] text-teal-200 font-bold'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300'
                  }`}
                >
                  {target === 'origin' ? `مبدأ: ${origin.name}` : `مقصد: ${destination.name}`}
                </button>
              ))}
              {/* C3: سوییچ کامیون سنگین (HGV) — با کلید ORS: OpenRouteService؛ بدون کلید: Valhalla/ماتریس OSRM */}
              <button
                onClick={() => setIsoHgv((prev) => !prev)}
                title="ایزوکرون پروفایل کامیون سنگین — با کلید ORS_API_KEY موتور OpenRouteService فعال می‌شود"
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-all ${
                  isoHgv
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-200 font-bold'
                    : 'border-slate-800 bg-slate-950/60 text-slate-300'
                }`}
              >
                <Truck className="w-3 h-3" />
                کامیون سنگین {isoHgv ? 'روشن' : 'خاموش'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[2, 3, 4, 6, 8, 10, 12].map((h) => (
                <button
                  key={h}
                  onClick={() =>
                    setIsoHours((prev) => (prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h].sort((a, b) => a - b)))
                  }
                  className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
                    isoHours.includes(h)
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-200 font-bold'
                      : 'border-slate-800 bg-slate-950/60 text-slate-300'
                  }`}
                >
                  {fa(h)} ساعت
                </button>
              ))}
            </div>

            <button
              onClick={runIsochrone}
              disabled={isoLoading}
              className="flex items-center justify-center gap-1.5 btn-cmd-green disabled:opacity-60 font-bold py-2 rounded-lg text-xs"
            >
              {isoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
              <span>{isoLoading ? 'در حال محاسبه…' : 'محاسبهٔ ایزوکرون و نمایش روی نقشه'}</span>
            </button>

            {isoError && (
              <p className="text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2 leading-relaxed">
                {isoError}
              </p>
            )}
            {isoNote && <p className="text-[10px] text-slate-400 leading-relaxed">• {isoNote}</p>}
          </div>

          {isoOverlays.length > 0 && (
            <div className="bg-slate-900/70 border border-slate-700/70 rounded-xl p-3 flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-[var(--cmd-green)]">بازه‌های محاسبه‌شده</span>
              {isoOverlays.map((overlay) => (
                <div key={overlay.id} className="flex items-center justify-between text-[10px] bg-slate-950 rounded-lg border border-slate-800 p-2">
                  <span className="flex items-center gap-1.5 text-slate-200">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: overlay.color }} />
                    {overlay.label}
                  </span>
                  <span className="text-slate-500">
                    {overlay.geometry?.type === 'Polygon' ? 'بازهٔ یکپارچه' : 'چندبازه'}
                  </span>
                </div>
              ))}
              <button
                onClick={() => {
                  setIsoOverlays([]);
                  onDrawIsochrones([]);
                }}
                className="mt-1 text-[10px] text-slate-400 hover:text-rose-300"
              >
                پاک کردن لایه‌های ایزوکرون
              </button>
            </div>
          )}
        </>
      )}

      {subTab === 'basket' && (
        <LoadBasketPanel
          cities={cities}
          defaultOrigin={origin.name}
          defaultOriginCoords={{ lat: origin.lat, lng: origin.lng }}
          onPlanItem={(item: LoadBasketItem) => {
            setOrigin({ name: item.origin || origin.name, lat: item.originCoords?.lat ?? origin.lat, lng: item.originCoords?.lng ?? origin.lng });
            setDestination({
              name: item.destination || destination.name,
              lat: item.destinationCoords?.lat ?? destination.lat,
              lng: item.destinationCoords?.lng ?? destination.lng,
            });
            setConstraints((prev) => ({ ...prev, weightTons: item.weightTons || prev.weightTons, hazmat: item.hazmat }));
            setSubTab('plan');
          }}
        />
      )}

      {subTab === 'schedule' && (
        <ScheduleBoard
          roadRoute={best}
          weightTons={weightTonsInput}
          profile={profile}
          hint={`${origin.name} ${destination.name}`}
        />
      )}

      {subTab === 'draw' && (
        <ManualRoutePanel
          crossings={crossings}
          profile={profile}
          profileId={profileId}
          constraints={constraints}
          fuelPrice={fuelPrice}
          utilization={utilization}
          weights={weights}
          draftPath={draftPath}
          drawMode={drawMode}
          onToggleDraw={onToggleDraw}
          onUndoDraw={onUndoDraw}
          onClearDraw={onClearDraw}
          savedRoutes={savedRoutes}
          onSavedRoutesChange={onSavedRoutesChange}
          onShowGeometry={(coords, label) =>
            onDrawOverlays([{ id: `saved-${label}`, label, color: '#f472b6', coordinates: coords, width: 4 }])
          }
        />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * اجزای کوچک
 * ------------------------------------------------------------------ */

const EngineBadge: React.FC<{ title: string; ok: boolean | null; hint: string }> = ({ title, ok, hint }) => (
  <div
    className={`rounded-lg border p-1.5 flex flex-col gap-0.5 ${
      ok === null
        ? 'border-slate-800 bg-slate-950/60 text-slate-400'
        : ok
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-200'
    }`}
    title={hint}
  >
    <span className="font-bold">{title}</span>
    <span className="text-[9px] opacity-80">{ok === null ? 'نامشخص' : ok ? 'فعال' : 'غیرفعال'}</span>
  </div>
);

const Stat: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone }) => (
  <div className="bg-slate-950 rounded-lg border border-slate-800 p-1.5">
    <span className="block text-[9px] text-slate-500">{label}</span>
    <b className={`text-[11px] ${tone || 'text-slate-200'}`}>{value}</b>
  </div>
);

const LeaderCard: React.FC<{ title: string; value: EvaluatedRoute; unit: string }> = ({ title, value, unit }) => (
  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2">
    <span className="block text-[9px] text-slate-500">{title}</span>
    <b className="text-[10px] text-slate-200">{unit}</b>
    <span className="block text-[9px] text-slate-500 mt-0.5 truncate">{value.label}</span>
  </div>
);

const WeightSlider: React.FC<{
  label: string;
  icon: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
}> = ({ label, icon, value, onChange }) => (
  <label className="flex items-center gap-2 text-[10px] text-slate-300">
    <span className="flex items-center gap-1 w-16 shrink-0">
      {icon}
      {label}
    </span>
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1 accent-teal-400"
    />
    <span className="w-8 text-left text-slate-400">{fa(value)}</span>
  </label>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
}> = ({ label, value, step, onChange }) => (
  <label className="text-[10px] text-slate-400 flex flex-col gap-1">
    {label}
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[10px] text-slate-100"
    />
  </label>
);

const ToggleChip: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-2 py-1 rounded-lg border transition-all ${
      active ? 'border-amber-500/60 bg-amber-500/10 text-amber-200 font-bold' : 'border-slate-800 bg-slate-950/60 text-slate-400'
    }`}
  >
    {label}
  </button>
);

const EndpointRow: React.FC<{
  title: string;
  value: { name: string } & LatLng;
  cities: { label: string; name: string; country: string; lat: number; lng: number }[];
  onSelectCity: (city: { label: string; name: string; country: string; lat: number; lng: number }) => void;
  onPick: () => void;
  picking: boolean;
}> = ({ title, value, cities, onSelectCity, onPick, picking }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-400">{title}</span>
      <span className="text-[9px] text-slate-500 flex items-center gap-1">
        <MapPin className="w-3 h-3" />
        {value.lat.toFixed(3)}°, {value.lng.toFixed(3)}°
      </span>
    </div>
    <div className="flex gap-1.5">
      <select
        value={cities.some((c) => c.label === value.name) ? value.name : ''}
        onChange={(e) => {
          const city = cities.find((c) => c.label === e.target.value);
          if (city) onSelectCity(city);
        }}
        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
      >
        <option value="">{value.name}</option>
        {cities.map((c) => (
          <option key={`${title}-${c.label}`} value={c.label}>
            {c.label}
          </option>
        ))}
      </select>
      <button
        onClick={onPick}
        className={`text-[10px] px-2 rounded-lg border transition-all shrink-0 ${
          picking ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-slate-700 text-slate-300 hover:border-teal-500/50'
        }`}
      >
        {picking ? 'انتخاب روی نقشه…' : 'از نقشه'}
      </button>
    </div>
  </div>
);

import React, { useMemo, useState } from 'react';
import {
  Boxes,
  CalendarClock,
  Container,
  PencilRuler,
  Plane,
  Plus,
  Ship,
  Snowflake,
  Sparkles,
  Trash2,
  TriangleAlert,
  Truck,
  TrainFront,
} from 'lucide-react';
import {
  Crossing,
  EvaluatedRoute,
  LoadBasketItem,
  ObjectiveWeights,
  RouteConstraints,
  RouteProfileId,
  SavedRoute,
  TransportSchedule,
  VehicleProfile,
} from '../types';
import { CARGO_TYPES, nextDeparture } from '../data/transportData';
import {
  buildModeComparison,
  deleteOrganizationalRoute,
  evaluateManualGeometry,
  newId,
  optimizeConsolidation,
  saveOrganizationalRoute,
  schedulesByMode,
} from '../services/routeEngine';

export interface CityOption {
  label: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

const fa = (value: number, digits = 0) =>
  value.toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

const MODE_ICON: Record<'road' | 'rail' | 'sea' | 'air', React.ReactNode> = {
  road: <Truck className="w-3.5 h-3.5" />,
  rail: <TrainFront className="w-3.5 h-3.5" />,
  sea: <Ship className="w-3.5 h-3.5" />,
  air: <Plane className="w-3.5 h-3.5" />,
};

/* ------------------------------------------------------------------ *
 * سبد بار چندمبدأ/چندمقصد و ادغام بار
 * ------------------------------------------------------------------ */

interface LoadBasketPanelProps {
  cities: CityOption[];
  defaultOrigin: string;
  defaultOriginCoords: { lat: number; lng: number };
  onPlanItem: (item: LoadBasketItem) => void;
}

export const LoadBasketPanel: React.FC<LoadBasketPanelProps> = ({
  cities,
  defaultOrigin,
  defaultOriginCoords,
  onPlanItem,
}) => {
  const [items, setItems] = useState<LoadBasketItem[]>(() => [
    {
      id: newId('item'),
      origin: defaultOrigin,
      destination: 'استانبول',
      originCoords: defaultOriginCoords,
      destinationCoords: null,
      weightTons: 18,
      volumeM3: 52,
      cargo: 'کالای عمومی',
      hazmat: false,
      tempControlled: false,
    },
    {
      id: newId('item'),
      origin: 'تبریز',
      destination: 'استانبول',
      originCoords: null,
      destinationCoords: null,
      weightTons: 12,
      volumeM3: 38,
      cargo: 'مصالح ساختمانی',
      hazmat: false,
      tempControlled: false,
    },
    {
      id: newId('item'),
      origin: 'اصفهان',
      destination: 'هرات',
      originCoords: null,
      destinationCoords: null,
      weightTons: 9,
      volumeM3: 30,
      cargo: 'کالای یخچالی و فاسدشدنی',
      hazmat: false,
      tempControlled: true,
    },
  ]);

  const [origin, setOrigin] = useState(defaultOrigin);
  const [destination, setDestination] = useState('بغداد');
  const [weight, setWeight] = useState(16);
  const [volume, setVolume] = useState(45);
  const [cargo, setCargo] = useState(CARGO_TYPES[0]);
  const [hazmat, setHazmat] = useState(false);
  const [tempControlled, setTempControlled] = useState(false);

  const findCity = (label: string) => cities.find((c) => c.label === label || c.name === label);

  const plan = useMemo(() => optimizeConsolidation(items), [items]);

  const totalTons = items.reduce((s, i) => s + i.weightTons, 0);
  const totalVolume = items.reduce((s, i) => s + i.volumeM3, 0);

  const addItem = () => {
    if (!origin.trim() || !destination.trim()) return;
    const originCity = findCity(origin);
    const destinationCity = findCity(destination);
    setItems((prev) => [
      ...prev,
      {
        id: newId('item'),
        origin: origin.trim(),
        destination: destination.trim(),
        originCoords: originCity ? { lat: originCity.lat, lng: originCity.lng } : null,
        destinationCoords: destinationCity ? { lat: destinationCity.lat, lng: destinationCity.lng } : null,
        weightTons: Math.max(0, weight),
        volumeM3: Math.max(0, volume),
        cargo,
        hazmat,
        tempControlled,
      },
    ]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5">
        <span className="text-[11px] font-bold text-[var(--tone-amber)] flex items-center gap-1.5">
          <Boxes className="w-3.5 h-3.5" />
          سبد بار چندمبدأ / چندمقصد
        </span>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          محموله‌ها را ثبت کنید تا خودروی مورد نیاز، ضریب بارگیری و صرفه‌جویی ادغام بار (تعداد سفر، هزینه و CO₂) محاسبه شود.
        </p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
        <span className="text-[11px] font-bold text-[var(--cmd-green)]">افزودن محموله</span>
        <datalist id="basket-city-list">
          {cities.map((c) => (
            <option key={c.label} value={c.label} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-slate-400 flex flex-col gap-1">
            مبدأ
            <input
              list="basket-city-list"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
            />
          </label>
          <label className="text-[10px] text-slate-400 flex flex-col gap-1">
            مقصد
            <input
              list="basket-city-list"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
            />
          </label>
          <label className="text-[10px] text-slate-400 flex flex-col gap-1">
            وزن (تن)
            <input
              type="number"
              min={0}
              step={0.5}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value) || 0)}
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
            />
          </label>
          <label className="text-[10px] text-slate-400 flex flex-col gap-1">
            حجم (متر مکعب)
            <input
              type="number"
              min={0}
              step={1}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value) || 0)}
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
            />
          </label>
          <label className="text-[10px] text-slate-400 flex flex-col gap-1 col-span-2">
            نوع کالا
            <select
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
            >
              {CARGO_TYPES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <button
            onClick={() => setHazmat((v) => !v)}
            className={`px-2 py-1 rounded-lg border ${
              hazmat ? 'border-rose-500/60 bg-rose-500/10 text-rose-200 font-bold' : 'border-slate-800 bg-slate-950/60 text-slate-400'
            }`}
          >
            <TriangleAlert className="w-3 h-3 inline ml-1" />
            کالای خطرناک (ADR)
          </button>
          <button
            onClick={() => setTempControlled((v) => !v)}
            className={`px-2 py-1 rounded-lg border ${
              tempControlled ? 'border-sky-500/60 bg-sky-500/10 text-sky-200 font-bold' : 'border-slate-800 bg-slate-950/60 text-slate-400'
            }`}
          >
            <Snowflake className="w-3 h-3 inline ml-1" />
            بار یخچالی
          </button>
        </div>

        <button
          onClick={addItem}
          className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 py-2 rounded-lg text-[11px] font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          افزودن به سبد بار
        </button>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>{fa(items.length)} محموله</span>
          <span>
            جمع: {fa(totalTons, 1)} تن · {fa(totalVolume, 1)} م³
          </span>
        </div>
        {items.map((item) => (
          <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-lg p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-200">
                {item.origin} ← {item.destination}
              </span>
              <button
                onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                className="text-slate-500 hover:text-rose-300"
                title="حذف محموله"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[9px] text-slate-400">
              <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{fa(item.weightTons, 1)} تن</span>
              <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{fa(item.volumeM3, 1)} م³</span>
              <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{item.cargo}</span>
              {item.hazmat && <span className="bg-rose-500/15 text-rose-300 px-1.5 py-0.5 rounded">ADR</span>}
              {item.tempControlled && <span className="bg-sky-500/15 text-sky-300 px-1.5 py-0.5 rounded">یخچالی</span>}
            </div>
            <button
              onClick={() => onPlanItem(item)}
              className="self-start text-[10px] text-[var(--cmd-green)] hover:text-teal-200 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              ارسال این محموله به مسیریاب
            </button>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/70 border border-slate-700/70 rounded-xl p-3 flex flex-col gap-2">
        <span className="text-[11px] font-bold text-emerald-400">بهینه‌سازی ادغام بار</span>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="bg-slate-950 rounded-lg border border-slate-800 p-2">
            <span className="block text-[9px] text-slate-500">خودروی مورد نیاز (ادغام‌شده)</span>
            <b className="text-[var(--cmd-green)] text-[12px]">{fa(plan.vehicles)}</b>
          </div>
          <div className="bg-slate-950 rounded-lg border border-slate-800 p-2">
            <span className="block text-[9px] text-slate-500">بدون ادغام (تک‌محموله‌ای)</span>
            <b className="text-slate-200 text-[12px]">{fa(plan.soloVehicles)}</b>
          </div>
          <div className="bg-slate-950 rounded-lg border border-slate-800 p-2">
            <span className="block text-[9px] text-slate-500">صرفه‌جویی هزینه</span>
            <b className="text-emerald-300 text-[12px]">{fa(plan.savedCostUsd)} دلار</b>
          </div>
          <div className="bg-slate-950 rounded-lg border border-slate-800 p-2">
            <span className="block text-[9px] text-slate-500">صرفه‌جویی کربن</span>
            <b className="text-lime-300 text-[12px]">{fa(plan.savedCo2Kg)} kg CO₂</b>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span>ضریب بارگیری میانگین:</span>
          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-[var(--cmd-green)]" style={{ width: `${plan.averageUtilization}%` }} />
          </div>
          <span className="text-slate-300">{fa(plan.averageUtilization)}%</span>
        </div>

        {plan.groups.map((group) => (
          <div key={group.destination} className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">{group.destination}</span>
              <span className="text-slate-500">
                {fa(group.items)} محموله · {fa(group.vehicles)} خودرو
              </span>
            </div>
            <div className="text-slate-400 mt-1">
              {fa(group.totalTons, 1)} تن · {fa(group.totalVolumeM3, 1)} م³ · بارگیری {fa(group.averageUtilization)}%
              {group.soloVehicles > group.vehicles && (
                <span className="text-emerald-300"> · {fa(group.soloVehicles - group.vehicles)} سفر کمتر</span>
              )}
            </div>
          </div>
        ))}

        {plan.notes.map((note) => (
          <p key={note} className="text-[10px] text-slate-400 leading-relaxed">
            • {note}
          </p>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * زمان‌بندی خطوط ریلی، کشتیرانی و بار هوایی
 * ------------------------------------------------------------------ */

interface ScheduleBoardProps {
  roadRoute: EvaluatedRoute | null;
  weightTons: number;
  profile: VehicleProfile;
  hint: string;
}

export const ScheduleBoard: React.FC<ScheduleBoardProps> = ({ roadRoute, weightTons, profile, hint }) => {
  const [sortBy, setSortBy] = useState<'cost' | 'time' | 'carbon'>('cost');
  const [modeFilter, setModeFilter] = useState<'all' | 'rail' | 'sea' | 'air'>('all');

  const rows = useMemo(
    () => buildModeComparison({ roadRoute, weightTons, profile, hint }),
    [roadRoute, weightTons, profile, hint]
  );

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    if (sortBy === 'cost') copy.sort((a, b) => a.totalUsd - b.totalUsd);
    else if (sortBy === 'time') copy.sort((a, b) => a.transitDays - b.transitDays);
    else copy.sort((a, b) => a.co2Kg - b.co2Kg);
    return modeFilter === 'all' ? copy : copy.filter((r) => r.mode === modeFilter);
  }, [rows, sortBy, modeFilter]);

  const timetable: TransportSchedule[] = useMemo(() => {
    const modes = modeFilter === 'all' ? (['rail', 'sea', 'air'] as const) : ([modeFilter] as const);
    return modes.flatMap((mode) => schedulesByMode(mode));
  }, [modeFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5">
        <span className="text-[11px] font-bold text-[var(--tone-amber)] flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" />
          مقایسهٔ چهار شیوهٔ حمل با تناژ {fa(weightTons)} تن
        </span>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          ردیف جاده‌ای از مسیر محاسبه‌شدهٔ جاری می‌آید و ردیف‌های ریلی، کشتیرانی و <b className="text-[var(--tone-amber)]">بار هوایی</b> (گزینهٔ
          چهارم زنجیره) از برنامهٔ زمان‌بندی خطوط استخراج می‌شوند.
        </p>
        {!roadRoute && (
          <p className="text-[10px] text-[var(--tone-amber)] bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
            برای درج ردیف جاده‌ای، ابتدا از تب «مسیر و مقایسه» یک مسیر محاسبه کنید.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(['all', 'rail', 'sea', 'air'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setModeFilter(mode)}
            className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
              modeFilter === mode
                ? 'border-teal-500/60 bg-[var(--cmd-green-soft)] text-teal-200 font-bold'
                : 'border-slate-800 bg-slate-950/60 text-slate-300'
            }`}
          >
            {mode === 'all' ? 'همه' : mode === 'rail' ? 'ریلی' : mode === 'sea' ? 'کشتیرانی' : 'هوایی'}
          </button>
        ))}
        <span className="text-[10px] text-slate-500 mr-auto">مرتب‌سازی:</span>
        {(['cost', 'time', 'carbon'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
              sortBy === key
                ? 'border-amber-500/60 bg-amber-500/10 text-amber-200 font-bold'
                : 'border-slate-800 bg-slate-950/60 text-slate-300'
            }`}
          >
            {key === 'cost' ? 'هزینه' : key === 'time' ? 'زمان' : 'کربن'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {sortedRows.map((row) => (
          <div key={`${row.mode}-${row.scheduleId || 'road'}`} className="bg-slate-900/70 border border-slate-700/70 rounded-xl p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: row.color }}>
                {MODE_ICON[row.mode]}
                {row.label}
              </span>
              <span className="text-[10px] text-slate-400">{row.operator}</span>
            </div>
            <div className="text-[10px] text-slate-300">{row.title}</div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <Cell label="زمان ترانزیت" value={`${fa(row.transitDays, 1)} روز`} />
              <Cell label={`هزینهٔ کل (${fa(weightTons)} تن)`} value={`${fa(row.totalUsd)} دلار`} />
              <Cell label="نرخ هر تن" value={`${fa(row.pricePerTon)} دلار`} />
              <Cell label="انتشار کربن" value={`${fa(row.co2Kg)} kg CO₂`} />
              <Cell label="ظرفیت" value={row.capacity} />
              <Cell label="ریسک" value={row.risk} />
            </div>
            <div className="text-[10px] text-slate-400">
              <b className="text-slate-300">حرکت بعدی: </b>
              {row.nextDeparture}
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">{row.notes}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
        <span className="text-[11px] font-bold text-[var(--cmd-green)] flex items-center gap-1.5">
          <Container className="w-3.5 h-3.5" />
          برنامهٔ کامل خطوط ({fa(timetable.length)} سرویس)
        </span>
        {timetable.map((schedule) => {
          const next = nextDeparture(schedule);
          return (
            <div key={schedule.id} className="bg-slate-950 border border-slate-800 rounded-lg p-2 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-200 flex items-center gap-1.5">
                  {MODE_ICON[schedule.mode]}
                  {schedule.from} ← {schedule.to}
                </span>
                <span className="text-[9px] text-slate-500">{schedule.operator}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[9px] text-slate-400">
                <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">حرکت: {next.dateLabel}</span>
                <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">ساعت {schedule.departTime}</span>
                <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">ترانزیت {fa(schedule.transitDays)} روز</span>
                <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{fa(schedule.priceUsdPerTon)} دلار/تن</span>
                <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{fa(schedule.co2KgPerTon)} kg CO₂/تن</span>
                <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{schedule.capacity}</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">{schedule.notes}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Cell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-950 rounded-lg border border-slate-800 p-1.5">
    <span className="block text-[9px] text-slate-500">{label}</span>
    <b className="text-[11px] text-slate-200">{value}</b>
  </div>
);

/* ------------------------------------------------------------------ *
 * ترسیم دستی مسیر و ذخیرهٔ مسیر سازمانی
 * ------------------------------------------------------------------ */

interface ManualRoutePanelProps {
  crossings: Crossing[];
  profile: VehicleProfile;
  profileId: RouteProfileId;
  constraints: RouteConstraints;
  fuelPrice: number;
  utilization: number;
  weights: ObjectiveWeights;
  draftPath: [number, number][];
  drawMode: boolean;
  onToggleDraw: (active: boolean) => void;
  onUndoDraw: () => void;
  onClearDraw: () => void;
  savedRoutes: SavedRoute[];
  onSavedRoutesChange: (routes: SavedRoute[]) => void;
  onShowGeometry: (coordinates: [number, number][], label: string) => void;
}

export const ManualRoutePanel: React.FC<ManualRoutePanelProps> = ({
  crossings,
  profile,
  profileId,
  constraints,
  fuelPrice,
  utilization,
  weights,
  draftPath,
  drawMode,
  onToggleDraw,
  onUndoDraw,
  onClearDraw,
  savedRoutes,
  onSavedRoutesChange,
  onShowGeometry,
}) => {
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [cargo, setCargo] = useState(CARGO_TYPES[0]);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const metrics = useMemo(() => {
    if (draftPath.length < 2) return null;
    return evaluateManualGeometry(
      draftPath,
      { profile, constraints, fuelPriceUsdPerLiter: fuelPrice, utilization, crossings, weights },
      profileId
    );
  }, [draftPath, profile, constraints, fuelPrice, utilization, crossings, weights, profileId]);

  const handleSave = () => {
    if (!metrics || draftPath.length < 2) {
      setMessage('برای ذخیره، حداقل دو نقطه روی نقشه ترسیم کنید.');
      return;
    }
    const saved: SavedRoute = {
      id: newId('route'),
      name: name.trim() || `مسیر دستی ${new Date().toLocaleDateString('fa-IR')}`,
      owner: owner.trim() || 'کاربر اطلس',
      createdAt: new Date().toISOString(),
      source: 'manual',
      profile: profileId,
      originLabel: 'ترسیم دستی',
      destinationLabel: 'ترسیم دستی',
      distanceKm: metrics.metrics.distanceKm,
      durationHours: metrics.metrics.totalHours,
      fuelLiters: metrics.metrics.fuelLiters,
      co2Kg: metrics.metrics.co2Kg,
      costUsd: metrics.metrics.costUsd,
      cargo,
      notes: notes.trim(),
      geometry: draftPath,
    };
    onSavedRoutesChange(saveOrganizationalRoute(saved));
    setName('');
    setNotes('');
    setMessage('مسیر سازمانی ذخیره شد و در فهرست زیر قابل فراخوانی است.');
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5">
        <span className="text-[11px] font-bold text-[var(--tone-amber)] flex items-center gap-1.5">
          <PencilRuler className="w-3.5 h-3.5" />
          ترسیم دستی مسیر روی نقشه
        </span>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          با فعال‌سازی حالت ترسیم، روی نقشه کلیک کنید تا مسیر سازمانی شما نقطه‌به‌نقطه ساخته شود؛ مسافت، زمان، سوخت و کربن به‌صورت
          زنده محاسبه و می‌توانید آن را با نام سازمانی ذخیره کنید.
        </p>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => onToggleDraw(!drawMode)}
            className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border font-bold transition-all ${
              drawMode
                ? 'border-rose-500/60 bg-rose-500/15 text-rose-200'
                : 'border-teal-500/50 bg-[var(--cmd-green-soft)] text-teal-200'
            }`}
          >
            <PencilRuler className="w-3.5 h-3.5" />
            {drawMode ? 'پایان حالت ترسیم' : 'شروع ترسیم روی نقشه'}
          </button>
          <button
            onClick={onUndoDraw}
            disabled={draftPath.length === 0}
            className="text-[10px] px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-50"
          >
            حذف آخرین نقطه
          </button>
          <button
            onClick={onClearDraw}
            disabled={draftPath.length === 0}
            className="text-[10px] px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-50"
          >
            پاک کردن ترسیم
          </button>
        </div>        <span className="text-[10px] text-slate-400">
          تعداد نقاط ثبت‌شده: {fa(draftPath.length)}
        </span>
      </div>

      {metrics && (
        <div className="bg-slate-900/70 border border-slate-700/70 rounded-xl p-3 flex flex-col gap-2">
          <span className="text-[11px] font-bold text-[var(--cmd-green)]">سنجه‌های مسیر ترسیم‌شده</span>
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <Cell label="مسافت" value={`${fa(metrics.metrics.distanceKm, 1)} km`} />
            <Cell label="زمان کل" value={`${fa(metrics.metrics.totalHours, 1)} ساعت`} />
            <Cell label="مصرف سوخت" value={`${fa(metrics.metrics.fuelLiters, 1)} لیتر`} />
            <Cell label="انتشار کربن" value={`${fa(metrics.metrics.co2Kg, 1)} kg CO₂`} />
            <Cell label="هزینهٔ برآوردی" value={`${fa(metrics.metrics.costUsd)} دلار`} />
            <Cell label="ریسک" value={`${metrics.metrics.riskLevel} (${fa(metrics.metrics.riskScore)})`} />
          </div>
          {metrics.gates.length > 0 && (
            <div className="flex flex-wrap gap-1 text-[9px] text-slate-400">
              گذرگاه‌های نزدیک:
              {metrics.gates.slice(0, 5).map((gate) => (
                <span key={gate.id} className="bg-slate-800/70 px-1.5 py-0.5 rounded">
                  {gate.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
        <span className="text-[11px] font-bold text-emerald-400">ذخیره به‌عنوان مسیر سازمانی</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-slate-400 flex flex-col gap-1">
            نام مسیر
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: مسیر تدارکاتی مرز بازرگان"
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
            />
          </label>
          <label className="text-[10px] text-slate-400 flex flex-col gap-1">
            واحد سازمانی / مالک
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="مثال: معاونت ترانزیت"
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
            />
          </label>
          <label className="text-[10px] text-slate-400 flex flex-col gap-1 col-span-2">
            محموله
            <select
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
            >
              {CARGO_TYPES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] text-slate-400 flex flex-col gap-1 col-span-2">
            یادداشت عملیاتی
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-[11px] text-slate-100"
            />
          </label>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center justify-center gap-1.5 btn-cmd-green font-bold py-2 rounded-lg text-[11px]"
        >
          <Sparkles className="w-3.5 h-3.5" />
          ذخیرهٔ مسیر سازمانی
        </button>
        {message && <p className="text-[10px] text-teal-200 leading-relaxed">{message}</p>}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
        <span className="text-[11px] font-bold text-slate-200">
          مسیرهای سازمانی ذخیره‌شده ({fa(savedRoutes.length)})
        </span>
        {savedRoutes.length === 0 && (
          <p className="text-[10px] text-slate-500 leading-relaxed">
            هنوز مسیری ذخیره نشده است. مسیر ترسیم‌شده یا گزینه‌های محاسبه‌شده در تب «مسیر و مقایسه» را ذخیره کنید.
          </p>
        )}
        {savedRoutes.map((route) => (
          <div key={route.id} className="bg-slate-950 border border-slate-800 rounded-lg p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-200">{route.name}</span>
              <button
                onClick={() => onSavedRoutesChange(deleteOrganizationalRoute(route.id))}
                className="text-slate-500 hover:text-rose-300"
                title="حذف مسیر"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[9px] text-slate-400">
              <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{route.owner}</span>
              <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{route.source === 'manual' ? 'ترسیم دستی' : 'محاسبه‌شده'}</span>
              <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{route.profile}</span>
              <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{fa(route.distanceKm, 1)} km</span>
              <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{fa(route.durationHours, 1)} ساعت</span>
              <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">{fa(route.co2Kg)} kg CO₂</span>
              <span className="bg-slate-800/70 px-1.5 py-0.5 rounded">
                {new Date(route.createdAt).toLocaleDateString('fa-IR')}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => onShowGeometry(route.geometry, route.name)}
                className="text-[10px] text-[var(--cmd-green)] hover:text-teal-200"
              >
                نمایش روی نقشه
              </button>
              {route.notes && <span className="text-[10px] text-slate-500">— {route.notes}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

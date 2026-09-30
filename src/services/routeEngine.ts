/**
 * موتور مسیریابی و ارزیابی حمل‌ونقل
 * ---------------------------------
 * ۱) مسیریابی واقعی جاده‌ای: OSRM (بدون کلید) و Valhalla (نمونهٔ عمومی یا خودمیزبان)
 * ۲) پروفایل کامیون سازمانی و اعمال محدودیت فیزیکی با OpenRouteService (کلید ORS_API_KEY)
 * ۳) ایزوکرون دسترسی ۲ تا ۱۲ ساعته
 * ۴) سنجه‌های سوخت، CO₂، هزینه، ریسک و بهینه‌سازی چندهدفه با وزن‌دهی کاربر
 * ۵) کشف گذرگاه‌های مرزی روی مسیر با استفاده از دادهٔ اطلس
 * ۶) سبد بار چندمبدأ/چندمقصد و بهینه‌سازی ادغام بار
 * ۷) مقایسهٔ شیوه‌های حمل (جاده/ریل/دریا/هوا)
 * ۸) ذخیره‌سازی مسیرهای سازمانی در حافظهٔ محلی
 */

import {
  Crossing,
  ConsolidationGroup,
  ConsolidationPlan,
  EvaluatedRoute,
  IsochroneOverlay,
  LatLng,
  LoadBasketItem,
  ObjectiveWeights,
  RouteAlternative,
  RouteConstraints,
  RouteEngineStatus,
  RouteMetrics,
  RoutePlanResponse,
  RouteProfileId,
  RouteProviderId,
  SavedRoute,
  TransportMode,
  TransportSchedule,
  VehicleProfile,
} from '../types';
import { ROUTE_PRESETS, TRANSPORT_SCHEDULES, getVehicleProfile, nextDeparture } from '../data/transportData';

/* ------------------------------------------------------------------ *
 * تنظیمات پیش‌فرض
 * ------------------------------------------------------------------ */

export const DEFAULT_CONSTRAINTS: RouteConstraints = {
  heightM: 4,
  weightTons: 40,
  widthM: 2.55,
  lengthM: 16.5,
  axleLoadTons: 11.5,
  adrClass: '',
  hazmat: false,
  tempControlled: false,
};

export const DEFAULT_WEIGHTS: ObjectiveWeights = { time: 35, cost: 30, risk: 20, carbon: 15 };

export const WEIGHT_PRESETS: { id: string; label: string; weights: ObjectiveWeights }[] = [
  { id: 'balanced', label: 'متعادل', weights: { time: 25, cost: 25, risk: 25, carbon: 25 } },
  { id: 'fastest', label: 'سریع‌ترین', weights: { time: 70, cost: 15, risk: 10, carbon: 5 } },
  { id: 'cheapest', label: 'اقتصادی‌ترین', weights: { time: 15, cost: 65, risk: 10, carbon: 10 } },
  { id: 'safest', label: 'کم‌ریسک‌ترین', weights: { time: 15, cost: 15, risk: 60, carbon: 10 } },
  { id: 'greenest', label: 'سبزترین', weights: { time: 10, cost: 15, risk: 10, carbon: 65 } },
];

/** سرعت میانگین برآوردی برای مسیرهای ترسیم‌شدهٔ دستی و برآوردهای پشتیبان (km/h) */
const FALLBACK_SPEED_KMH: Record<RouteProfileId, number> = {
  car: 78,
  bus: 62,
  truck: 56,
  truck_adr: 50,
  pedestrian: 4.5,
};

const PROVIDER_COLORS = ['#22d3ee', '#f59e0b', '#a78bfa', '#34d399', '#fb7185', '#facc15'];

export const ROUTE_PRESET_LIST = ROUTE_PRESETS;

export function providerColor(index: number): string {
  return PROVIDER_COLORS[index % PROVIDER_COLORS.length];
}

/* ------------------------------------------------------------------ *
 * ابزارهای جغرافیایی
 * ------------------------------------------------------------------ */

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function polylineLengthKm(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineKm(
      { lat: points[i - 1][1], lng: points[i - 1][0] },
      { lat: points[i][1], lng: points[i][0] }
    );
  }
  return total;
}

/** کاهش حجم هندسه برای محاسبات سنگین (فاصله تا گذرگاه‌ها) */
function subsample(points: [number, number][], maxPoints = 900): [number, number][] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: [number, number][] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

/** فاصلهٔ نقطه تا پاره‌خط (تقریب مسطح) به کیلومتر */
function pointToSegmentKm(
  lat: number,
  lng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  const px = lng * kx;
  const py = lat * ky;
  const ax = aLng * kx;
  const ay = aLat * ky;
  const bx = bLng * kx;
  const by = bLat * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}

export interface RouteGateHit {
  crossing: Crossing;
  distanceKm: number;
}

/** گذرگاه‌های مرزی نزدیک به مسیر (پنجرهٔ ۴۰ کیلومتری) */
export function gatesAlongRoute(
  geometry: [number, number][],
  crossings: Crossing[],
  maxKm = 40
): RouteGateHit[] {
  if (geometry.length < 2) return [];
  const line = subsample(geometry);
  const hits: RouteGateHit[] = [];

  crossings.forEach((crossing) => {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 1; i < line.length; i += 1) {
      const d = pointToSegmentKm(
        crossing.lat,
        crossing.lng,
        line[i - 1][1],
        line[i - 1][0],
        line[i][1],
        line[i][0]
      );
      if (d < best) best = d;
      if (best <= 1) break;
    }
    if (best <= maxKm) hits.push({ crossing, distanceKm: Math.round(best * 10) / 10 });
  });

  return hits.sort((a, b) => a.distanceKm - b.distanceKm);
}

export function nearestCrossing(point: LatLng, crossings: Crossing[], maxKm = 50): Crossing | null {
  let best: Crossing | null = null;
  let bestDist = maxKm;
  crossings.forEach((c) => {
    const d = haversineKm(point, { lat: c.lat, lng: c.lng });
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  });
  return best;
}

/* ------------------------------------------------------------------ *
 * فراخوانی موتورهای مسیریابی
 * ------------------------------------------------------------------ */

export interface RoutePlanParams {
  origin: LatLng;
  destination: LatLng;
  profile: RouteProfileId;
  provider: RouteProviderId;
  constraints: RouteConstraints;
  alternatives?: boolean;
}

function canUseDirectOsrm(profile: RouteProfileId): boolean {
  return profile !== 'truck_adr';
}

async function directOsrm(params: RoutePlanParams): Promise<RoutePlanResponse> {
  const osrmProfile = params.profile === 'pedestrian' ? 'foot' : 'driving';
  const withAlternatives = params.alternatives !== false ? 3 : 'false';

  const attempt = async (profileName: string) => {
    const url =
      `https://router.project-osrm.org/route/v1/${profileName}/${params.origin.lng},${params.origin.lat};` +
      `${params.destination.lng},${params.destination.lat}?overview=full&geometries=geojson&steps=false&alternatives=${withAlternatives}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`OSRM پاسخ ناموفق (${res.status})`);
    const data: any = await res.json();
    if (data?.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      throw new Error(data?.message || 'OSRM مسیری بازنگرداند');
    }
    return data;
  };

  let data: any;
  const notes: string[] = [];
  let degraded = false;
  try {
    data = await attempt(osrmProfile);
  } catch (error) {
    if (osrmProfile === 'driving') throw error;
    degraded = true;
    notes.push('پروفایل پیاده در نمونهٔ عمومی OSRM فعال نبود؛ هندسهٔ خودرویی استفاده و زمان پیاده برآورد شد.');
    data = await attempt('driving');
  }

  const alternatives: RouteAlternative[] = data.routes.slice(0, 3).map((route: any, idx: number) => ({
    id: `osrm-direct-${idx + 1}`,
    label: idx === 0 ? 'سریع‌ترین مسیر OSRM' : `مسیر جایگزین ${idx + 1} (OSRM)`,
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
    durationHours: Math.round((route.duration / 3600) * 100) / 100,
    geometry: (route.geometry?.coordinates || []) as [number, number][],
    kind: 'road',
  }));

  return {
    success: true,
    provider: 'osrm-direct',
    providerLabel: 'OSRM عمومی (اتصال مستقیم مرورگر، بدون کلید)',
    costing: osrmProfile === 'foot' ? 'پیاده' : 'خودرویی',
    alternatives,
    notes,
    degraded,
  };
}

export async function planRoute(params: RoutePlanParams): Promise<RoutePlanResponse> {
  const body = {
    origin: params.origin,
    destination: params.destination,
    profile: params.profile,
    provider: params.provider,
    constraints: params.constraints,
    alternatives: params.alternatives !== false,
  };

  let serverError: string | null = null;

  try {
    const res = await fetch('/api/route/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      throw new Error(errorData?.error || `خطای سرور مسیریابی (${res.status})`);
    }

    const data = (await res.json()) as RoutePlanResponse;
    if (!data?.alternatives?.length) throw new Error('پاسخی از موتور مسیریابی دریافت نشد.');
    return data;
  } catch (error: any) {
    serverError = error?.message || String(error);
    if (!canUseDirectOsrm(params.profile)) throw error;
  }

  const direct = await directOsrm(params);
  direct.notes = [
    'واسط سرور در دسترس نبود؛ مسیر مستقیماً از سرویس عمومی OSRM دریافت شد (نیازمند اتصال اینترنت).',
    ...(serverError ? [`جزئیات: ${serverError}`] : []),
    ...direct.notes,
  ];
  return direct;
}

export interface IsochroneResult {
  provider: string;
  providerLabel: string;
  overlays: IsochroneOverlay[];
  notes: string[];
}

export async function planIsochrone(params: {
  center: LatLng;
  hours: number[];
  profile: RouteProfileId;
}): Promise<IsochroneResult> {
  try {
    const res = await fetch('/api/route/isochrone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.details || data?.error || `خطای سرور ایزوکرون (${res.status})`);
    }

    const overlays: IsochroneOverlay[] = (data.features || []).map((feature: any, idx: number) => ({
      id: `iso-${feature.hours}-${idx}`,
      label: `${feature.hours} ساعت`,
      color: feature.color || '#38bdf8',
      hours: feature.hours,
      geometry: feature.geometry,
    }));

    return {
      provider: data.provider,
      providerLabel: data.providerLabel,
      overlays,
      notes: data.notes || [],
    };
  } catch (serverError: any) {
    // پشتیبان: فراخوانی مستقیم نمونهٔ عمومی Valhalla از مرورگر
    try {
      const costing = getVehicleProfile(params.profile).engine.valhalla;
      const colors = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];
      const res = await fetch('https://valhalla1.openstreetmap.de/isochrone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: [{ lat: params.center.lat, lon: params.center.lng }],
          costing,
          contours: params.hours.map((h, idx) => ({ time: h * 60, color: colors[idx % colors.length] })),
          polygons: true,
          denoise: 0.25,
        }),
      });
      if (!res.ok) throw new Error(`Valhalla پاسخ ناموفق (${res.status})`);
      const data: any = await res.json();
      const overlays: IsochroneOverlay[] = (data.features || []).map((feature: any, idx: number) => ({
        id: `iso-direct-${idx}`,
        label: `${Math.round((Number(feature.properties?.contour || params.hours[idx] * 60) / 60) * 10) / 10} ساعت`,
        color: feature.properties?.color || colors[idx % colors.length],
        hours: Math.round((Number(feature.properties?.contour || params.hours[idx] * 60) / 60) * 10) / 10,
        geometry: feature.geometry,
      }));
      return {
        provider: 'valhalla-direct',
        providerLabel: 'Valhalla عمومی (اتصال مستقیم مرورگر)',
        overlays,
        notes: ['واسط سرور در دسترس نبود؛ ایزوکرون مستقیماً از نمونهٔ عمومی Valhalla دریافت شد.'],
      };
    } catch (directError: any) {
      throw new Error(
        `${serverError?.message || 'خطای سرور'} — همچنین اتصال مستقیم به Valhalla ممکن نشد (${
          directError?.message || directError
        }).`
      );
    }
  }
}

export async function fetchRouteEngineStatus(): Promise<RouteEngineStatus | null> {
  try {
    const res = await fetch('/api/route/status');
    if (!res.ok) return null;
    return (await res.json()) as RouteEngineStatus;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * ارزیابی مسیر: سوخت، CO₂، هزینه، ریسک و امتیاز چندهدفه
 * ------------------------------------------------------------------ */

export interface EvaluateOptions {
  profile: VehicleProfile;
  constraints: RouteConstraints;
  fuelPriceUsdPerLiter: number;
  /** ضریب بارگیری ۰ تا ۱ */
  utilization: number;
  crossings: Crossing[];
  weights: ObjectiveWeights;
}

function riskLevelOf(score: number): RouteMetrics['riskLevel'] {
  if (score >= 65) return 'بحرانی';
  if (score >= 45) return 'بالا';
  if (score >= 25) return 'متوسط';
  return 'کم';
}

export function constraintViolations(profile: VehicleProfile, constraints: RouteConstraints): string[] {
  const out: string[] = [];
  if (constraints.heightM > profile.maxHeightM) {
    out.push(
      `ارتفاع اعلامی ${constraints.heightM} متر از سقف پروفایل ${profile.label} (${profile.maxHeightM} متر) بیشتر است.`
    );
  }
  if (constraints.weightTons > profile.maxTons) {
    out.push(
      `وزن کل ${constraints.weightTons} تن از وزن مجاز این پروفایل (${profile.maxTons} تن) فراتر می‌رود.`
    );
  } else if (constraints.weightTons > profile.payloadTons) {
    out.push(
      `بار ${constraints.weightTons} تن بیشتر از ظرفیت مفید یک سفر (${profile.payloadTons} تن) است؛ نیاز به مجوز حمل فوق سنگین یا تقسیم بار.`
    );
  }
  if (constraints.widthM > profile.maxWidthM + 0.01) {
    out.push(`عرض بار ${constraints.widthM} متر از حد پروفایل (${profile.maxWidthM} متر) بیشتر است؛ نیاز به مجوز و اسکورت.`);
  }
  if (constraints.adrClass && !constraints.hazmat) {
    out.push('کلاس کالای خطرناک انتخاب شده اما گزینهٔ حمل ADR فعال نیست؛ وضعیت پلاک و بیمهٔ ADR را بررسی کنید.');
  }
  if (constraints.tempControlled && profile.fuelType === 'none') {
    out.push('بار یخچالی با پروفایل پیاده قابل حمل نیست.');
  }
  return out;
}

function metricsForRoute(
  alternative: RouteAlternative,
  options: EvaluateOptions
): { metrics: RouteMetrics; gates: RouteGateHit[]; violations: string[] } {
  const { profile, constraints, fuelPriceUsdPerLiter, utilization, crossings } = options;
  const gates = gatesAlongRoute(alternative.geometry, crossings);

  const borderHours = Math.min(
    60,
    gates.reduce((sum, hit) => sum + Math.min(12, hit.crossing.clear_est || 4) * 0.6, 0)
  );

  const driveHours = alternative.durationHours * profile.durationFactor;
  const shifts = profile.maxDailyDriveHours > 0 ? Math.ceil(driveHours / profile.maxDailyDriveHours) : 1;
  const restHours = Math.max(0, shifts - 1) * profile.restHours;
  const totalHours = driveHours + restHours + borderHours;

  const loadFactor = profile.fuelType === 'none' ? 0 : 0.78 + 0.3 * Math.max(0, Math.min(1, utilization));
  const fuelLiters = (alternative.distanceKm / 100) * profile.fuelPer100Km * loadFactor;
  const co2Kg = fuelLiters * profile.co2PerLiter;

  const fuelUsd = fuelLiters * fuelPriceUsdPerLiter;
  const driverUsd = totalHours * profile.driverPerHour;
  const tollUsd = alternative.distanceKm * profile.tollPerKm;
  const maintenanceUsd = alternative.distanceKm * profile.costPerKm;
  const borderUsd =
    gates.length * 120 + borderHours * (profile.driverPerHour + profile.costPerKm * 8);
  const costUsd = fuelUsd + driverUsd + tollUsd + maintenanceUsd + borderUsd;

  const violations = [...constraintViolations(profile, constraints)];
  const riskReasons: string[] = [];

  let risk = Math.min(22, (alternative.distanceKm / 1000) * 6);
  if (alternative.distanceKm > 1200) riskReasons.push('مسیر بسیار طولانی؛ ریسک خرابی و تأخیر تجمعی');

  gates.slice(0, 8).forEach((hit) => {
    const clear = hit.crossing.clear_est || 4;
    risk += Math.min(11, clear * 1.1);
    risk += Math.min(8, (hit.crossing.trucks_est || 0) / 150);
    if (clear >= 12) {
      riskReasons.push(`ترخیص طولانی در ${hit.crossing.name} (≈ ${clear} ساعت)`);
    }
  });

  if (constraints.hazmat || constraints.adrClass) {
    risk += 9;
    riskReasons.push('حمل کالای خطرناک: محدودیت تونل، پارکینگ ویژه و هماهنگی پلیس راه');
  }
  if (constraints.tempControlled) {
    risk += 6;
    riskReasons.push('زنجیرهٔ سرد: نیاز به برق اضطراری و پایش دما');
  }
  if (violations.length > 0) {
    risk += violations.length * 14;
    violations.forEach((v) => riskReasons.push(v));
  }
  if (driveHours > profile.maxDailyDriveHours * 2) {
    riskReasons.push(
      `زمان رانندگی ${Math.round(driveHours)} ساعت است؛ ${Math.max(1, shifts - 1)} شیفت استراحت اجباری در برنامه لحاظ شد.`
    );
  }
  if (riskReasons.length === 0) riskReasons.push('شرایط مسیر برای این پروفایل بدون هشدار بحرانی است.');

  const riskScore = Math.max(0, Math.min(100, Math.round(risk)));

  return {
    gates,
    violations,
    metrics: {
      distanceKm: alternative.distanceKm,
      driveHours: Math.round(driveHours * 10) / 10,
      restHours: Math.round(restHours * 10) / 10,
      borderHours: Math.round(borderHours * 10) / 10,
      totalHours: Math.round(totalHours * 10) / 10,
      fuelLiters: Math.round(fuelLiters * 10) / 10,
      co2Kg: Math.round(co2Kg * 10) / 10,
      fuelUsd: Math.round(fuelUsd),
      driverUsd: Math.round(driverUsd),
      tollUsd: Math.round(tollUsd),
      maintenanceUsd: Math.round(maintenanceUsd),
      borderUsd: Math.round(borderUsd),
      costUsd: Math.round(costUsd),
      riskScore,
      riskLevel: riskLevelOf(riskScore),
      riskReasons,
      score: 0,
      rank: 0,
    },
  };
}

/** ارزیابی و رتبه‌بندی چندهدفهٔ گزینه‌های مسیر */
export function evaluateRoutes(
  alternatives: RouteAlternative[],
  options: EvaluateOptions
): EvaluatedRoute[] {
  const evaluated = alternatives.map((alternative) => {
    const { metrics, gates, violations } = metricsForRoute(alternative, options);
    return {
      ...alternative,
      metrics,
      violations,
      gates: gates.map((hit) => ({
        id: hit.crossing.id,
        name: hit.crossing.name,
        country: hit.crossing.country,
        corridor: hit.crossing.corridor,
        clearHours: hit.crossing.clear_est,
        trucksEst: hit.crossing.trucks_est,
        lat: hit.crossing.lat,
        lng: hit.crossing.lng,
      })),
    };
  });

  const weights = options.weights;
  const totalWeight = weights.time + weights.cost + weights.risk + weights.carbon || 1;

  const series: Record<keyof ObjectiveWeights, number[]> = {
    time: evaluated.map((r) => r.metrics.totalHours),
    cost: evaluated.map((r) => r.metrics.costUsd),
    risk: evaluated.map((r) => r.metrics.riskScore),
    carbon: evaluated.map((r) => r.metrics.co2Kg),
  };

  const normalize = (values: number[], value: number) => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max - min < 1e-6) return 1;
    return (max - value) / (max - min);
  };

  evaluated.forEach((route) => {
    const score =
      (weights.time * normalize(series.time, route.metrics.totalHours) +
        weights.cost * normalize(series.cost, route.metrics.costUsd) +
        weights.risk * normalize(series.risk, route.metrics.riskScore) +
        weights.carbon * normalize(series.carbon, route.metrics.co2Kg)) /
      totalWeight;
    route.metrics.score = Math.round(score * 1000) / 10;
  });

  const ranked = [...evaluated].sort((a, b) => b.metrics.score - a.metrics.score);
  ranked.forEach((route, idx) => {
    route.metrics.rank = idx + 1;
  });

  return evaluated;
}

/** برآورد سنجه‌ها برای مسیر ترسیم‌شدهٔ دستی */
export function evaluateManualGeometry(
  geometry: [number, number][],
  options: EvaluateOptions,
  profileId: RouteProfileId
): EvaluatedRoute {
  const distanceKm = Math.round(polylineLengthKm(geometry) * 10) / 10;
  const speed = FALLBACK_SPEED_KMH[profileId] || 55;
  const alternative: RouteAlternative = {
    id: 'manual-draft',
    label: 'مسیر ترسیم‌شدهٔ دستی',
    distanceKm,
    durationHours: Math.round((distanceKm / speed) * 100) / 100,
    geometry,
    kind: 'manual',
  };
  const [evaluated] = evaluateRoutes([alternative], options);
  return evaluated;
}

/* ------------------------------------------------------------------ *
 * سبد بار چندمبدأ/چندمقصد و ادغام بار
 * ------------------------------------------------------------------ */

export const BASKET_VEHICLE_DEFAULTS = { payloadTons: 24, volumeM3: 82 };

export function optimizeConsolidation(
  items: LoadBasketItem[],
  options: { payloadTons?: number; volumeM3?: number; costPerVehicle?: number; co2PerVehicle?: number } = {}
): ConsolidationPlan {
  const payload = options.payloadTons || BASKET_VEHICLE_DEFAULTS.payloadTons;
  const volume = options.volumeM3 || BASKET_VEHICLE_DEFAULTS.volumeM3;
  const costPerVehicle = options.costPerVehicle ?? 1900;
  const co2PerVehicle = options.co2PerVehicle ?? 620;

  const byDestination = new Map<string, LoadBasketItem[]>();
  items.forEach((item) => {
    const key = item.destination.trim() || 'مقصد نامشخص';
    const list = byDestination.get(key) || [];
    list.push(item);
    byDestination.set(key, list);
  });

  const groups: ConsolidationGroup[] = [];
  const notes: string[] = [];
  let vehicles = 0;
  let soloVehicles = 0;

  byDestination.forEach((list, destination) => {
    const hazmatItems = list.filter((i) => i.hazmat);
    const chilled = list.filter((i) => i.tempControlled);
    const general = list.filter((i) => !i.hazmat && !i.tempControlled);

    // سازگاری بار: کالای خطرناک و یخچالی جدا از بار عمومی و از یکدیگر بارگیری می‌شوند
    const buckets: LoadBasketItem[][] = [];
    if (hazmatItems.length) buckets.push(hazmatItems);
    if (chilled.length) buckets.push(chilled);
    if (general.length) buckets.push(general);

    let groupVehicles = 0;
    let groupSoloVehicles = 0;
    let groupTons = 0;
    let groupVolume = 0;

    buckets.forEach((bucket) => {
      const tons = bucket.reduce((s, i) => s + Math.max(0, i.weightTons), 0);
      const vol = bucket.reduce((s, i) => s + Math.max(0, i.volumeM3), 0);
      groupTons += tons;
      groupVolume += vol;
      const needed = Math.max(1, Math.ceil(tons / payload), Math.ceil(vol / volume));
      groupVehicles += needed;
      groupSoloVehicles += bucket.length;
    });

    if (hazmatItems.length && general.length) {
      notes.push(`در مقصد «${destination}» بار خطرناک از بار عمومی جدا نگه داشته شد (الزام ADR).`);
    }
    if (chilled.length) {
      notes.push(`در مقصد «${destination}» محمولهٔ یخچالی با خودروی مجهز به یخچال و ثبت دما برنامه‌ریزی شد.`);
    }

    vehicles += groupVehicles;
    soloVehicles += groupSoloVehicles;

    groups.push({
      destination,
      items: list.length,
      totalTons: Math.round(groupTons * 10) / 10,
      totalVolumeM3: Math.round(groupVolume * 10) / 10,
      vehicles: groupVehicles,
      soloVehicles: groupSoloVehicles,
      averageUtilization:
        groupVehicles > 0 ? Math.min(1, Math.round((groupTons / (groupVehicles * payload)) * 100) ) : 0,
    });
  });

  const totalTons = items.reduce((s, i) => s + Math.max(0, i.weightTons), 0);
  const totalVolume = items.reduce((s, i) => s + Math.max(0, i.volumeM3), 0);
  const savedVehicles = Math.max(0, soloVehicles - vehicles);

  if (savedVehicles > 0) {
    notes.push(
      `ادغام بار در ${groups.length} گروه مقصد، ${savedVehicles} خودرو کمتر از ارسال تک‌محموله‌ای نیاز دارد.`
    );
  } else if (items.length > 0) {
    notes.push('بارها در وضعیت فعلی قابلیت ادغام بیشتری ندارند؛ محموله‌های تک‌خودرویی بررسی شد.');
  }

  return {
    vehicles,
    soloVehicles,
    savedVehicles,
    savedCostUsd: savedVehicles * costPerVehicle,
    savedCo2Kg: Math.round(savedVehicles * co2PerVehicle),
    averageUtilization:
      vehicles > 0 ? Math.min(100, Math.round((totalTons / (vehicles * payload)) * 100)) : 0,
    groups,
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * مقایسهٔ شیوه‌های حمل (جاده/ریل/دریا/هوا)
 * ------------------------------------------------------------------ */

export interface ModeComparisonRow {
  mode: TransportMode;
  label: string;
  color: string;
  operator: string;
  title: string;
  transitDays: number;
  pricePerTon: number;
  totalUsd: number;
  co2Kg: number;
  risk: string;
  nextDeparture: string;
  capacity: string;
  notes: string;
  scheduleId?: string;
}

function pickSchedule(mode: TransportSchedule['mode'], hint: string): TransportSchedule | undefined {
  const candidates = TRANSPORT_SCHEDULES.filter((s) => s.mode === mode);
  if (candidates.length === 0) return undefined;
  const normalized = hint.toLowerCase();
  const matched = candidates.find(
    (s) =>
      normalized.includes(s.from.toLowerCase().slice(0, 6)) ||
      normalized.includes(s.to.toLowerCase().slice(0, 6)) ||
      s.countries.some((c) => normalized.includes(c))
  );
  if (mode === 'air') {
    return matched || [...candidates].sort((a, b) => a.priceUsdPerTon - b.priceUsdPerTon)[0];
  }
  return matched || candidates[0];
}

/** جدول مقایسهٔ چهار شیوهٔ حمل برای تناژ مشخص */
export function buildModeComparison(params: {
  roadRoute: EvaluatedRoute | null;
  weightTons: number;
  profile: VehicleProfile;
  hint: string;
}): ModeComparisonRow[] {
  const { roadRoute, weightTons, profile, hint } = params;
  const tons = Math.max(1, weightTons);
  const rows: ModeComparisonRow[] = [];

  if (roadRoute) {
    const pricePerTon = Math.max(1, Math.round(roadRoute.metrics.costUsd / tons));
    rows.push({
      mode: 'road',
      label: 'جاده‌ای',
      color: '#2dd4bf',
      operator: profile.label,
      title: roadRoute.label,
      transitDays: Math.max(1, Math.round((roadRoute.metrics.totalHours / 24) * 10) / 10),
      pricePerTon,
      totalUsd: roadRoute.metrics.costUsd,
      co2Kg: roadRoute.metrics.co2Kg,
      risk: roadRoute.metrics.riskLevel,
      nextDeparture: 'بدون برنامهٔ زمانی — حرکت آزاد',
      capacity: `${profile.payloadTons} تن در هر سفر`,
      notes: `${roadRoute.metrics.distanceKm.toLocaleString('fa-IR')} کیلومتر، ${roadRoute.gates.length} گذرگاه مرزی در مسیر`,
    });
  }

  (['rail', 'sea', 'air'] as const).forEach((mode) => {
    const schedule = pickSchedule(mode, hint);
    if (!schedule) return;
    const next = nextDeparture(schedule);
    rows.push({
      mode,
      label: mode === 'rail' ? 'ریلی' : mode === 'sea' ? 'کشتیرانی' : 'بار هوایی',
      color: mode === 'rail' ? '#a78bfa' : mode === 'sea' ? '#38bdf8' : '#f59e0b',
      operator: schedule.operator,
      title: schedule.title,
      transitDays: schedule.transitDays,
      pricePerTon: schedule.priceUsdPerTon,
      totalUsd: schedule.priceUsdPerTon * tons,
      co2Kg: schedule.co2KgPerTon * tons,
      risk: schedule.risk,
      nextDeparture: `${next.dateLabel} — ساعت ${schedule.departTime} (${next.dayLabel})`,
      capacity: schedule.capacity,
      notes: schedule.notes,
      scheduleId: schedule.id,
    });
  });

  return rows;
}

export function schedulesByMode(mode: TransportSchedule['mode']): TransportSchedule[] {
  return TRANSPORT_SCHEDULES.filter((s) => s.mode === mode);
}

/* ------------------------------------------------------------------ *
 * ذخیره‌سازی مسیرهای سازمانی (حافظهٔ محلی)
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'atlas.organizational.routes.v1';

export function newId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadOrganizationalRoutes(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedRoute[]) : [];
  } catch {
    return [];
  }
}

function persist(routes: SavedRoute[]): SavedRoute[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  } catch {
    // حافظهٔ محلی در دسترس نیست؛ فهرست فقط در حافظهٔ نشست باقی می‌ماند
  }
  return routes;
}

export function saveOrganizationalRoute(route: SavedRoute): SavedRoute[] {
  const routes = loadOrganizationalRoutes().filter((r) => r.id !== route.id);
  routes.unshift(route);
  return persist(routes.slice(0, 100));
}

export function deleteOrganizationalRoute(id: string): SavedRoute[] {
  return persist(loadOrganizationalRoutes().filter((r) => r.id !== id));
}

export function profileById(id: string): VehicleProfile {
  return getVehicleProfile(id);
}

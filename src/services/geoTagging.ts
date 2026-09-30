/**
 * مکان‌یابی نتایج جستجوی وب روی نقشه
 * ----------------------------------
 * بدون نیاز به هیچ کلید یا سرویس بیرونی: یک «فهرست مکانی» (گازتیر) از داده‌های خود اطلس
 * ساخته می‌شود — گذرگاه‌های مرزی، شهرهای شبکه راه، کشورها و کریدورها — سپس متن هر نتیجهٔ
 * جستجو (عنوان، چکیده، نشانی) با این نام‌ها تطبیق داده می‌شود و بهترین مکان به‌عنوان
 * نشانهٔ نقشه برگردانده می‌شود. الویت‌بندی: گذرگاه مرزی > شهر > کریدور > کشور.
 */

import { Corridor, CountryRoadNetwork, Crossing, GeoTag, GeoTagKind, MapSearchPin } from '../types';
import { ROUTE_PRESETS } from '../data/transportData';

export const GEO_TAG_COLORS: Record<GeoTagKind, string> = {
  crossing: '#f59e0b',
  city: '#2dd4bf',
  corridor: '#a78bfa',
  country: '#94a3b8',
};

export const GEO_TAG_LABELS: Record<GeoTagKind, string> = {
  crossing: 'گذرگاه مرزی',
  city: 'شهر',
  corridor: 'کریدور',
  country: 'کشور',
};

export interface GazetteerEntry {
  id: string;
  label: string;
  kind: GeoTagKind;
  lat: number;
  lng: number;
  weight: number;
  /** نام‌های نرمال‌شده برای تطبیق متنی */
  names: string[];
}

/** یکسان‌سازی متن فارسی/عربی برای تطبیق قابل‌اعتماد */
export function normalizeFa(text: string): string {
  return String(text || '')
    .replace(/[\u064A\u0649]/g, 'ی')
    .replace(/[\u0643]/g, 'ک')
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ؤو]/g, 'و')
    .replace(/[\u0621\u0654\u0655]/g, '')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[\u200c\u200e\u200f]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

const COUNTRY_WEIGHT = 1;
const CORRIDOR_WEIGHT = 2;
const CITY_WEIGHT = 3;
const CROSSING_WEIGHT = 5;

export interface GazetteerInput {
  crossings: Crossing[];
  roadNetwork: Record<string, CountryRoadNetwork>;
  corridors: Corridor[];
}

/** ساخت فهرست مکانی از داده‌های اطلس */
export function buildGazetteer({ crossings, roadNetwork, corridors }: GazetteerInput): GazetteerEntry[] {
  const entries: GazetteerEntry[] = [];
  const seen = new Set<string>();

  const push = (
    id: string,
    label: string,
    names: (string | null | undefined)[],
    lat: number,
    lng: number,
    kind: GeoTagKind,
    weight: number
  ) => {
    if (seen.has(id)) return;
    const normalized = Array.from(
      new Set(names.filter((n): n is string => Boolean(n && n.trim())).map(normalizeFa).filter((n) => n.length >= 3))
    );
    if (normalized.length === 0 || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    seen.add(id);
    entries.push({ id, label, kind, lat, lng, weight, names: normalized });
  };

  // ۱) گذرگاه‌های مرزی (بالاترین اولویت)
  crossings.forEach((crossing) => {
    push(
      `gate-${crossing.id}`,
      crossing.name,
      [crossing.name, crossing.name_en, crossing.opp_name],
      crossing.lat,
      crossing.lng,
      'crossing',
      CROSSING_WEIGHT
    );
  });

  // ۲) شهرهای شبکه راه + تجمیع مختصات برای مرکز کشور
  const countryAccumulator = new Map<string, { lat: number; lng: number; count: number }>();
  Object.entries(roadNetwork || {}).forEach(([country, network]) => {
    network.routes.forEach((route) => {
      route.c.forEach(([cityName, lat, lng]) => {
        const clean = String(cityName).trim();
        push(`city-${country}-${clean}`, clean, [clean], lat, lng, 'city', CITY_WEIGHT);
        const acc = countryAccumulator.get(country) || { lat: 0, lng: 0, count: 0 };
        acc.lat += lat;
        acc.lng += lng;
        acc.count += 1;
        countryAccumulator.set(country, acc);
      });
    });
  });

  crossings.forEach((crossing) => {
    const acc = countryAccumulator.get(crossing.country) || { lat: 0, lng: 0, count: 0 };
    acc.lat += crossing.lat;
    acc.lng += crossing.lng;
    acc.count += 1;
    countryAccumulator.set(crossing.country, acc);
  });

  // ۳) مراکز کشورها
  countryAccumulator.forEach((acc, country) => {
    push(`country-${country}`, country, [country], acc.lat / acc.count, acc.lng / acc.count, 'country', COUNTRY_WEIGHT);
  });

  // ۴) کریدورهای ترانزیتی (میانهٔ نقاط) — توجه: مختصات کریدورها [lat, lng] است
  corridors.forEach((corridor, index) => {
    if (!corridor.points?.length) return;
    const lat = corridor.points.reduce((sum, point) => sum + point[0], 0) / corridor.points.length;
    const lng = corridor.points.reduce((sum, point) => sum + point[1], 0) / corridor.points.length;
    push(`corridor-${index}`, corridor.name, [corridor.name], lat, lng, 'corridor', CORRIDOR_WEIGHT);
  });

  // ۵) گره‌های پیش‌تنظیم کریدورها (بندرها و مرزهای شاخص)
  ROUTE_PRESETS.forEach((preset) => {
    push(`preset-o-${preset.id}`, preset.origin.name, [preset.origin.name], preset.origin.lat, preset.origin.lng, 'city', CITY_WEIGHT);
    push(
      `preset-d-${preset.id}`,
      preset.destination.name,
      [preset.destination.name],
      preset.destination.lat,
      preset.destination.lng,
      'city',
      CITY_WEIGHT
    );
  });

  return entries;
}

/** تطبیق یک متن (عنوان/چکیده/نشانی) با فهرست مکانی و بازگرداندن بهترین مکان‌ها */
export function tagText(text: string, gazetteer: GazetteerEntry[], maxPlaces = 3): GeoTag[] {
  const haystack = ` ${normalizeFa(text)} `;
  if (haystack.trim().length < 4) return [];

  const matches: GeoTag[] = [];

  gazetteer.forEach((entry) => {
    let best = 0;
    entry.names.forEach((name) => {
      // نام‌های بسیار کوتاه (کمتر از ۴ نویسه) نویز زیادی تولید می‌کنند
      if (name.length < 4) return;
      if (haystack.includes(` ${name} `)) best = Math.max(best, name.length + 3);
      else if (haystack.includes(name)) best = Math.max(best, name.length);
    });
    if (best > 0) {
      matches.push({
        id: entry.id,
        label: entry.label,
        kind: entry.kind,
        lat: entry.lat,
        lng: entry.lng,
        score: entry.weight * 100 + best,
      });
    }
  });

  // یکتاسازی بر پایهٔ نام نرمال‌شده تا نام‌های تکراری (شهر در چند مسیر) تکرار نشوند
  const unique: GeoTag[] = [];
  const labelSeen = new Set<string>();
  for (const match of matches.sort((a, b) => b.score - a.score)) {
    const key = normalizeFa(match.label);
    if (labelSeen.has(key)) continue;
    labelSeen.add(key);
    unique.push(match);
    if (unique.length >= maxPlaces) break;
  }

  return unique;
}

export interface TaggedResultInput {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

/** فاصلهٔ هوایی به کیلومتر */
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** فاصلهٔ هوایی (پیش‌فرض) یا جاده‌ای واقعی برای انتخاب نزدیک‌ترین گذرگاه */
export const GEO_DISTANCE_LABELS = { road: 'جاده‌ای', air: 'هوایی' } as const;

/** حداکثر تعداد گذرگاه نامزد که برای محاسبهٔ فاصلهٔ جاده‌ای استعلام می‌شود */
export const ROAD_CANDIDATE_LIMIT = 5;

/** حداکثر تعداد نشانه‌هایی که مسیر واقعی جاده‌ای برایشان رسم می‌شود */
export const ROAD_PATH_LIMIT = 6;

export interface RoadDistanceMatrix {
  /** فاصله به کیلومتر — سطرها به ترتیب مبدأها، ستون‌ها به ترتیب مقصدها */
  distancesKm: (number | null)[][];
  /** زمان به دقیقه */
  durationsMin: (number | null)[][];
  /** نمایهٔ هر مقصد در ماتریس بر پایهٔ کلید مختصات */
  targetIndex: Map<string, number>;
}

const coordKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

/** چند گذرگاه نزدیک بر پایهٔ فاصلهٔ هوایی (نامزدهای محاسبهٔ فاصلهٔ جاده‌ای) */
function nearestCandidates(
  point: { lat: number; lng: number },
  crossings: Crossing[],
  maxKm: number,
  limit: number
): Crossing[] {
  return crossings
    .map((crossing) => ({ crossing, km: distanceKm(point.lat, point.lng, crossing.lat, crossing.lng) }))
    .filter((item) => item.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit)
    .map((item) => item.crossing);
}

/**
 * ماتریس فاصلهٔ واقعی جاده‌ای از واسط سرور (OSRM table).
 * در صورت نبود شبکه یا خطای سرویس، null برگردانده می‌شود تا فاصلهٔ هوایی جایگزین شود.
 */
export async function fetchRoadMatrix(params: {
  sources: { id: string; lat: number; lng: number }[];
  targets: { id: string; lat: number; lng: number }[];
  profile?: string;
}): Promise<RoadDistanceMatrix | null> {
  try {
    const res = await fetch('/api/route/distances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const meters: (number | null)[][] = Array.isArray(data?.distancesMeters) ? data.distancesMeters : [];
    if (meters.length === 0) return null;

    const seconds: (number | null)[][] = Array.isArray(data?.durationsSeconds) ? data.durationsSeconds : [];

    return {
      distancesKm: meters.map((row) => (row || []).map((value) => (typeof value === 'number' ? value / 1000 : null))),
      durationsMin: meters.map((row, i) =>
        (row || []).map((_value, j) => {
          const duration = seconds[i]?.[j];
          return typeof duration === 'number' ? duration / 60 : null;
        })
      ),
      targetIndex: new Map(params.targets.map((target, index) => [coordKey(target.lat, target.lng), index])),
    };
  } catch {
    return null;
  }
}

/** نزدیک‌ترین گذرگاه مرزی به یک مکان (تا سقف شعاع داده‌شده) */
export function closestCrossing(
  point: { lat: number; lng: number },
  crossings: Crossing[],
  maxKm = 600
): { crossing: Crossing; distanceKm: number } | null {
  let best: { crossing: Crossing; distanceKm: number } | null = null;
  crossings.forEach((crossing) => {
    const km = distanceKm(point.lat, point.lng, crossing.lat, crossing.lng);
    if (km <= maxKm && (!best || km < best.distanceKm)) best = { crossing, distanceKm: km };
  });
  return best;
}

export interface GeoTaggedResults {
  /** مکان‌های استخراج‌شده برای هر نتیجه (به ترتیب نتیجه‌ها) */
  tagsByIndex: GeoTag[][];
  /** نشانه‌های یکتای نقشه (هر مکان یک بار) */
  pins: MapSearchPin[];
  /** آیا فاصلهٔ جاده‌ای واقعی برای نشانه‌ها محاسبه شد؟ */
  roadDistanceApplied: boolean;
}

export interface GeoTagOptions {
  /** محاسبهٔ فاصلهٔ واقعی جاده‌ای (OSRM) بهجای فاصلهٔ هوایی */
  roadDistance?: boolean;
  /** سقف شعاع جستجوی گذرگاه (کیلومتر) */
  maxKm?: number;
  /** تعداد گذرگاه نامزد برای استعلام ماتریس جاده‌ای */
  roadCandidates?: number;
  /** پروفایل مسیریابی برای ماتریس جاده‌ای (پیش‌فرض کامیون) */
  profile?: string;
  /**
   * رسم هندسهٔ واقعی مسیر جاده‌ای در همان فراخوانی.
   * پیش‌فرض خاموش است تا نشانه‌ها فوراً نمایش داده شوند؛ برای رسم مسیرها
   * پس از نمایش نشانه‌ها از attachRoadPaths استفاده کنید.
   */
  roadPath?: boolean;
  /** حداکثر تعداد نشانه‌هایی که مسیر واقعی برایشان رسم می‌شود */
  roadPathLimit?: number;
}

export interface RoadLink {
  id: string;
  /** هندسهٔ واقعی مسیر جادهای به ترتیب [lng, lat] (قالب GeoJSON) */
  geometry: [number, number][];
  distanceKm: number;
  durationMin: number;
}

/** هندسهٔ واقعی مسیر جاده‌ای نشانه‌ها تا نزدیک‌ترین گذرگاه (OSRM) */
export async function fetchRoadLinks(params: {
  pairs: { id: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } }[];
  profile?: string;
  limit?: number;
}): Promise<Map<string, RoadLink>> {
  const result = new Map<string, RoadLink>();
  if (params.pairs.length === 0) return result;

  try {
    const res = await fetch('/api/route/road-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) return result;

    const data = await res.json();
    const links: any[] = Array.isArray(data?.links) ? data.links : [];
    links.forEach((link) => {
      if (!Array.isArray(link?.geometry) || link.geometry.length < 2) return;
      result.set(String(link.id), {
        id: String(link.id),
        geometry: link.geometry,
        distanceKm: Number(link.distanceKm) || 0,
        durationMin: Number(link.durationMin) || 0,
      });
    });
  } catch {
    // در دسترس نبودن سرویس: خط مستقیم جایگزین می‌شود
  }

  return result;
}

/**
 * مکان‌یابی مجموعه‌ای از نتایج جستجو و ساخت نشانه‌های نقشه با نزدیک‌ترین گذرگاه مرزی.
 * وقتی roadDistance فعال باشد، ابتدا گذرگاه‌های نامزد با فاصلهٔ هوایی غربال می‌شوند و سپس
 * فاصلهٔ واقعی جاده‌ای آن‌ها با یک درخواست ماتریس OSRM تعیین و نزدیک‌ترین گذرگاه جاده‌ای انتخاب می‌شود.
 */
export async function geoTagResults(
  results: TaggedResultInput[],
  gazetteer: GazetteerEntry[],
  crossings: Crossing[] = [],
  options: GeoTagOptions = {}
): Promise<GeoTaggedResults> {
  const maxKm = options.maxKm ?? 600;
  const candidateLimit = Math.max(1, Math.min(options.roadCandidates ?? ROAD_CANDIDATE_LIMIT, 8));

  const tagsByIndex: GeoTag[][] = [];
  const seenPlaces = new Set<string>();
  const drafts: { pin: MapSearchPin; candidates: Crossing[] }[] = [];

  results.forEach((result, index) => {
    const haystack = `${result.title} ${result.snippet} ${result.url.replace(/[-_/]/g, ' ')}`;
    const tags = tagText(haystack, gazetteer, 3);
    tagsByIndex.push(tags);

    const best = tags[0];
    if (!best) return;
    const placeKey = normalizeFa(best.label);
    if (seenPlaces.has(placeKey)) return;
    seenPlaces.add(placeKey);

    const nearest = crossings.length ? closestCrossing({ lat: best.lat, lng: best.lng }, crossings, maxKm) : null;

    drafts.push({
      candidates: nearestCandidates({ lat: best.lat, lng: best.lng }, crossings, maxKm, candidateLimit),
      pin: {
        id: `pin-${best.id}`,
        label: best.label,
        url: result.url,
        source: result.source,
        lat: best.lat,
        lng: best.lng,
        rank: index + 1,
        color: GEO_TAG_COLORS[best.kind],
        kind: best.kind,
        title: result.title,
        nearestGateId: nearest ? nearest.crossing.id : null,
        nearestGateName: nearest ? nearest.crossing.name : null,
        nearestGateLat: nearest ? nearest.crossing.lat : null,
        nearestGateLng: nearest ? nearest.crossing.lng : null,
        nearestGateKm: nearest ? Math.round(nearest.distanceKm * 10) / 10 : null,
        nearestGateRoad: false,
        nearestGateMinutes: null,
        nearestGatePath: null,
      },
    });
  });

  if (!options.roadDistance || drafts.length === 0 || crossings.length === 0) {
    return { tagsByIndex, pins: drafts.map((draft) => draft.pin), roadDistanceApplied: false };
  }

  // یکپارچه‌سازی مقصدها تا همهٔ نشانه‌ها با یک درخواست ماتریس پوشش داده شوند
  const targets = new Map<string, { id: string; lat: number; lng: number }>();
  drafts.forEach((draft) => {
    draft.candidates.forEach((crossing) => {
      const key = coordKey(crossing.lat, crossing.lng);
      if (!targets.has(key)) targets.set(key, { id: key, lat: crossing.lat, lng: crossing.lng });
    });
  });

  const matrix = await fetchRoadMatrix({
    sources: drafts.map((draft, index) => ({ id: String(index), lat: draft.pin.lat, lng: draft.pin.lng })),
    targets: Array.from(targets.values()),
    profile: options.profile,
  });

  if (!matrix) return { tagsByIndex, pins: drafts.map((draft) => draft.pin), roadDistanceApplied: false };

  drafts.forEach((draft, index) => {
    let best: { crossing: Crossing; km: number; minutes: number | null } | null = null;

    draft.candidates.forEach((crossing) => {
      const column = matrix.targetIndex.get(coordKey(crossing.lat, crossing.lng));
      if (column === undefined) return;
      const km = matrix.distancesKm[index]?.[column];
      if (typeof km !== 'number' || !Number.isFinite(km) || km > maxKm) return;
      if (!best || km < best.km) {
        const minutes = matrix.durationsMin[index]?.[column] ?? null;
        best = { crossing, km, minutes };
      }
    });

    if (!best) return;
    const winner = best as { crossing: Crossing; km: number; minutes: number | null };
    draft.pin.nearestGateId = winner.crossing.id;
    draft.pin.nearestGateName = winner.crossing.name;
    draft.pin.nearestGateLat = winner.crossing.lat;
    draft.pin.nearestGateLng = winner.crossing.lng;
    draft.pin.nearestGateKm = Math.round(winner.km * 10) / 10;
    draft.pin.nearestGateRoad = true;
    draft.pin.nearestGateMinutes = winner.minutes === null ? null : Math.round(winner.minutes);
  });

  const pins = drafts.map((draft) => draft.pin);

  if (options.roadPath) {
    const withPaths = await attachRoadPaths(pins, {
      limit: options.roadPathLimit,
      profile: options.profile,
    });
    return { tagsByIndex, pins: withPaths, roadDistanceApplied: true };
  }

  return { tagsByIndex, pins, roadDistanceApplied: true };
}

/**
 * رسم هندسهٔ واقعی مسیر جاده‌ای تا نزدیک‌ترین گذرگاه برای نشانه‌های داده‌شده.
 * جدا از geoTagResults است تا نشانه‌ها فوراً روی نقشه بیایند و مسیرها در پس‌زمینه پس‌چسب شوند.
 */
export async function attachRoadPaths(
  pins: MapSearchPin[],
  options: { limit?: number; profile?: string } = {}
): Promise<MapSearchPin[]> {
  const pathLimit = Math.max(1, Math.min(options.limit ?? ROAD_PATH_LIMIT, 10));
  const eligible = pins.filter(
    (pin) =>
      pin.nearestGateLat !== null &&
      pin.nearestGateLng !== null &&
      (pin.nearestGateKm || 0) >= 5 &&
      !(pin.nearestGatePath && pin.nearestGatePath.length >= 2)
  );
  if (eligible.length === 0) return pins;

  const targets = eligible.slice(0, pathLimit);
  const links = await fetchRoadLinks({
    pairs: targets.map((pin) => ({
      id: pin.id,
      from: { lat: pin.lat, lng: pin.lng },
      to: { lat: pin.nearestGateLat as number, lng: pin.nearestGateLng as number },
    })),
    profile: options.profile,
    limit: pathLimit,
  });

  if (links.size === 0) return pins;

  return pins.map((pin) => {
    const link = links.get(pin.id);
    return link ? { ...pin, nearestGatePath: link.geometry } : pin;
  });
}

/* ------------------------------------------------------------------ *
 * خروجی GeoJSON قابل دانلود و اشتراک‌گذاری
 * ------------------------------------------------------------------ */

export interface SearchGeoJsonInput {
  query: string;
  provider: string;
  results: TaggedResultInput[];
  pins: MapSearchPin[];
  tagsByIndex: GeoTag[][];
}

/** ساخت مجموعهٔ عارضهٔ GeoJSON از نتایج مکانی‌یابی‌شده و خطوط اتصال به گذرگاه‌ها */
export function buildSearchGeoJSON(input: SearchGeoJsonInput) {
  const features: any[] = [];

  input.pins.forEach((pin) => {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
      properties: {
        kind: 'search-pin',
        place: pin.label,
        place_kind: pin.kind,
        rank: pin.rank,
        title: pin.title,
        url: pin.url,
        source: pin.source,
        nearest_gate: pin.nearestGateName || '',
        nearest_gate_km: pin.nearestGateKm ?? null,
        nearest_gate_distance: pin.nearestGateRoad ? 'road' : 'air',
        nearest_gate_minutes: pin.nearestGateMinutes ?? null,
      },
    });

    if (pin.nearestGateLat !== null && pin.nearestGateLng !== null && (pin.nearestGateKm || 0) >= 5) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pin.nearestGateLng, pin.nearestGateLat] },
        properties: {
          kind: 'nearest-gate',
          name: pin.nearestGateName || '',
          gate_id: pin.nearestGateId,
          distance_km: pin.nearestGateKm,
          distance_type: pin.nearestGateRoad ? 'road' : 'air',
          travel_minutes: pin.nearestGateMinutes ?? null,
        },
      });
      const hasRoadPath = Array.isArray(pin.nearestGatePath) && pin.nearestGatePath.length >= 2;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: hasRoadPath
            ? pin.nearestGatePath
            : [
                [pin.lng, pin.lat],
                [pin.nearestGateLng, pin.nearestGateLat],
              ],
        },
        properties: {
          kind: 'connector',
          from: pin.label,
          to: pin.nearestGateName || '',
          distance_km: pin.nearestGateKm,
          distance_type: pin.nearestGateRoad ? 'road' : 'air',
          travel_minutes: pin.nearestGateMinutes ?? null,
          geometry_source: hasRoadPath ? 'osrm-road' : 'straight-line',
        },
      });
    }
  });

  input.results.forEach((result, index) => {
    (input.tagsByIndex[index] || []).forEach((tag) => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [tag.lng, tag.lat] },
        properties: {
          kind: 'place-tag',
          place: tag.label,
          place_kind: tag.kind,
          result_index: index + 1,
          result_title: result.title,
          result_url: result.url,
        },
      });
    });
  });

  return {
    type: 'FeatureCollection' as const,
    properties: {
      query: input.query,
      provider: input.provider,
      generated_at: new Date().toISOString(),
      source: 'اطلس شبکه جاده‌ای، گذرگاه‌های مرزی و ترانزیت ایران و اوراسیا',
      crs: 'EPSG:4326',
    },
    features,
  };
}

/** دانلود فایل GeoJSON در مرورگر */
export function downloadGeoJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.geojson') ? filename : `${filename}.geojson`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

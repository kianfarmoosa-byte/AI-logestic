import React, { useEffect, useMemo, useRef, useState } from 'react';
import { reportClientError } from '../services/clientErrorReport';
import type * as H3Namespace from 'h3-js';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreglWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { BorderParkSnapshot } from '../services/borderPark';
import { MapLiveLegend } from './MapLiveLegend';

/* h3-js (~۵۰۰kB) به‌صورت لَزی همراه deck.gl بارگذاری می‌شود — تایپ‌ها از namespace استاتیک */
let h3Promise: Promise<typeof H3Namespace> | null = null;
let h3Module: typeof H3Namespace | null = null;
const ensureH3 = (): Promise<typeof H3Namespace> => {
  if (!h3Promise) {
    h3Promise = import('h3-js').then((m) => {
      h3Module = m;
      return m;
    });
  }
  return h3Promise;
};
/** دسترسی سنکرون پس از ensureH3 — فقط برای readهای داخلی لایه‌های H3 */
const h3 = () => {
  if (!h3Module) throw new Error('h3-js not loaded yet');
  return h3Module;
};
import {
  Crossing,
  Corridor,
  CountryRoadNetwork,
  IsochroneOverlay,
  MapFocusTarget,
  MapSearchPin,
  RouteOverlay,
} from '../types';

// Configure MapLibre Web Worker URL for Vite environment
try {
  setWorkerUrl(maplibreglWorkerUrl);
} catch (e) {
  console.warn('Failed to set worker URL, using default:', e);
}

interface MapAtlasProps {
  crossings: Crossing[];
  corridors: Corridor[];
  roadNetwork: Record<string, CountryRoadNetwork>;
  filteredCrossings: Crossing[];
  activeCorridors: boolean[];
  darkTheme: boolean;
  onSelectCrossing: (crossing: Crossing) => void;
  pickMode?: 'origin' | 'destination' | null;
  onPickLocation?: (lat: number, lng: number, name?: string) => void;
  selectedRoutePath?: [number, number][]; // [lng, lat]
  highlightedGateId?: number | null;
  /** مسیرهای محاسبه‌شده/جایگزین برای نمایش همزمان روی نقشه */
  routeOverlays?: RouteOverlay[];
  /** لایه‌های ایزوکرون دسترسی */
  isochroneOverlays?: IsochroneOverlay[];
  /** حالت ترسیم دستی مسیر: کلیک روی نقشه نقطه اضافه می‌کند */
  drawMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  /** مسیر در حال ترسیم (پیش‌نویس) */
  draftPath?: [number, number][];
  /** نشانه‌های نتایج جستجوی وب پس از مکان‌یابی */
  searchPins?: MapSearchPin[];
  /** درخواست تمرکز نقشه روی یک نقطه (مثلاً یک نتیجهٔ جستجو) */
  focusTarget?: MapFocusTarget | null;
  onOpenSearchResult?: (pin: MapSearchPin) => void;
  /** عرض اشغال‌شدهٔ پنل کناری (پیکسل) تا دوربین نقشه زیر پنل پنهان نشود */
  panelOffset?: number;
  /** وضعیت زندهٔ صف گمرکات (سامانهٔ نوبتدهی Border Park) برای رنگ/اندازهٔ زندهٔ حباب‌ها */
  liveGates?: BorderParkSnapshot[];
}

/* ------------------------------------------------------------------ *
 * نقشه‌های پایه حرفه‌ای، رایگان و منبع‌باز (بدون کلید API و بدون ثبت‌نام)
 *  - OpenFreeMap  : وکتور منبع‌باز، داده OpenStreetMap، قابل خودمیزبانی
 *  - OpenTopoMap  : نقشه توپوگرافی و کوه‌نگاری برای گردنه‌ها و شیب مسیر
 *  - HOT OSM      : کاشی بشردوستانه با پوشش بهتر در مناطق کم‌برخوردار
 *  - CARTO Positron: نقشه پایه مینیمال برای تحلیل داده و چاپ
 *  - CyclOSM      : مسیرهای دوچرخه و پیاده (کاربردی برای پیادهٔ مرزی)
 *  - Esri Imagery : تصویر ماهواره‌ای رایگان با ذکر منبع برای بررسی گذرگاه‌ها
 * ------------------------------------------------------------------ */
export type BasemapId =
  | 'dark'
  | 'bright'
  | 'osm'
  | 'topo'
  | 'humanitarian'
  | 'positron'
  | 'cyclosm'
  | 'satellite';

const OPENFREEMAP_DARK = 'https://tiles.openfreemap.org/styles/dark';
const OPENFREEMAP_BRIGHT = 'https://tiles.openfreemap.org/styles/bright';

const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles · داده‌ها: OpenStreetMap';
const OSM_ATTRIBUTION = '© مشارکت‌کنندگان OpenStreetMap (ODbL)';

export interface BasemapDef {
  id: BasemapId;
  label: string;
  hint: string;
  attribution: string;
  /** اگر تعریف شده باشد، نقشه پایه شطرنجی است و از این کاشی‌ها ساخته می‌شود */
  tiles?: string[];
  maxzoom?: number;
}

export const BASEMAPS: BasemapDef[] = [
  { id: 'dark', label: 'تیکه', hint: 'OpenFreeMap Dark (وکتور منبع‌باز)', attribution: OPENFREEMAP_ATTRIBUTION },
  { id: 'bright', label: 'روشن', hint: 'OpenFreeMap Bright (وکتور منبع‌باز)', attribution: OPENFREEMAP_ATTRIBUTION },
  {
    id: 'topo',
    label: 'توپوگرافی',
    hint: 'OpenTopoMap — نقشه ارتفاعی، گردنه و شیب (CC-BY-SA)',
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
    maxzoom: 17,
    attribution: '© OpenTopoMap (CC-BY-SA) · داده‌ها: OpenStreetMap',
  },
  {
    id: 'satellite',
    label: 'تصویر هوایی',
    hint: 'تصویر ماهواره‌ای Esri World Imagery (رایگان با ذکر منبع)',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 19,
    attribution: 'تصویر: Esri, Maxar, Earthstar Geographics',
  },
  {
    id: 'osm',
    label: 'OSM',
    hint: 'کاشی شطرنجی کلاسیک OpenStreetMap',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: OSM_ATTRIBUTION,
  },
  {
    id: 'humanitarian',
    label: 'بشردوستانه',
    hint: 'HOT OSM — پوشش بهتر در مناطق کمتر توسعه‌یافته',
    tiles: ['https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: '© مشارکت‌کنندگان OpenStreetMap · کاشی HOT (OpenStreetMap France)',
  },
  {
    id: 'positron',
    label: 'سادهٔ روشن',
    hint: 'CARTO Positron — نقشه پایه مینیمال برای تحلیل و چاپ',
    tiles: ['https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: '© OpenStreetMap contributors © CARTO',
  },
  {
    id: 'cyclosm',
    label: 'دوچرخه و پیاده',
    hint: 'CyclOSM — مسیرهای دوچرخه و پیاده، کاربردی برای عبور پیادهٔ مرزی',
    tiles: ['https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'],
    maxzoom: 19,
    attribution: '© CyclOSM · © مشارکت‌کنندگان OpenStreetMap',
  },
];

/* ------------------------------------------------------------------ *
 * لایه‌های تحلیلی روی نقشه (همه رایگان و بدون کلید)
 * ------------------------------------------------------------------ */
export type MapOverlayId = 'railways' | 'seamarks' | 'hillshade';

interface MapOverlayDef {
  id: MapOverlayId;
  label: string;
  hint: string;
  tiles: string[];
  kind: 'raster' | 'hillshade';
  opacity: number;
  maxzoom: number;
  tileSize: number;
  attribution: string;
  /** در نقشه‌های پایهٔ برداری از دادهٔ OpenMapTiles رسم می‌شود (بدون محدودیت نرخ کاشی شطرنجی) */
  vectorRail?: boolean;
}

export const MAP_OVERLAYS: MapOverlayDef[] = [
  {
    id: 'railways',
    label: 'راه‌آهن',
    hint: 'شبکه ریلی، ایستگاه‌ها و نقاط تغییر بوژی — روی نقشهٔ برداری از دادهٔ خود نقشه و در غیر آن از OpenRailwayMap',
    // تنها زیردامنه‌های بررسی‌شده (c و d پاسخ نمی‌دهند) و به‌عنوان جایگزین نقشهٔ برداری
    tiles: [
      'https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
      'https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
    ],
    kind: 'raster',
    opacity: 0.85,
    vectorRail: true,
    maxzoom: 19,
    tileSize: 256,
    attribution: '© مشارکت‌کنندگان OpenStreetMap · OpenRailwayMap (CC-BY-SA)',
  },
  {
    id: 'seamarks',
    label: 'بندر و دریا',
    hint: 'OpenSeaMap — علائم دریایی، لنگرگاه‌ها و بندرها',
    tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
    kind: 'raster',
    opacity: 0.9,
    maxzoom: 18,
    tileSize: 256,
    attribution: '© مشارکت‌کنندگان OpenStreetMap · OpenSeaMap (CC-BY-SA)',
  },
  {
    id: 'hillshade',
    label: 'سایهٔ ارتفاع',
    hint: 'سایه‌نگاری ارتفاع زمین از Mapterhorn (دادهٔ ارتفاع رایگان، بدون کلید)',
    tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
    kind: 'hillshade',
    opacity: 1,
    maxzoom: 12,
    tileSize: 512,
    attribution: '© Mapterhorn (داده ارتفاع رایگان)',
  },
];

/* برچسب کوتاه هر کریدور برای نمایش روی خط (به ترتیب DATA.corridors در atlasData.ts) */
const CORRIDOR_SHORT_LABELS = [
  'کریدور غرب/اروپا',
  'کریدور چین',
  'کریدور شبه‌قاره',
  'کریدور قفقاز',
  'هلال عربی',
  'INSTC شمال–جنوب',
];

const corridorShortLabel = (i: number) => CORRIDOR_SHORT_LABELS[i] || `کریدور بین‌المللی ${i + 1}`;

/* ------------------------------------------------------------------ *
 * B2 — ضخامت متناسب کریدور با تردد تجمیعی
 * تردد تجمیعی هر کریدور = مجموع trucks_est گذرگاه‌هایی که مختصات شروع/پایانِ
 * نقاط polyline آن کریدور در DATA.corridors است (معیار: فاصلهٔ هوایی < ۴۵ کیلومتر
 * از ابتدای یا انتهای خط). این مقادیر در getCorridorsGeoJSON به‌عنوان property
 * تجمع و widthBase تزریق می‌شوند تا line-width دیتادریو شود و hover/popup هم از
 * همان عدد استفاده کند.
 * ------------------------------------------------------------------ */
const B2_MAX_SUM = 8000; // سقف تجربه‌ای برای نرمال‌سازی — مجموع تردد روزانهٔ گیت‌های کریدور اروپا

const B2_GATE_TOLERANCE_KM = 45;

/** مجموع تردد روزانهٔ گذرگاه‌های نزدیک به دو سر خط کریدور */
function corridorAggregatedTraffic(corridor: Corridor, gates: Crossing[]): number {
  if (!corridor.points.length || !gates.length) return 0;
  const first = corridor.points[0];
  const last = corridor.points[corridor.points.length - 1];
  let sum = 0;
  gates.forEach((gate) => {
    const volume = Number(gate.trucks_est) || 0;
    if (volume <= 0) return;
    const dStart = calculateDistanceRaw(first[0], first[1], gate.lat, gate.lng);
    const dEnd = calculateDistanceRaw(last[0], last[1], gate.lat, gate.lng);
    if (dStart <= B2_GATE_TOLERANCE_KM || dEnd <= B2_GATE_TOLERANCE_KM) sum += volume;
  });
  return sum;
}

/** فاصلهٔ هوایی کیلومتری (هابرثین) — نسخهٔ مستقل از خطوط جزئی‌نگاشت MapLibre */
function calculateDistanceRaw(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * شدت رنگ پایدار بر پایهٔ نام استان (هش کاراکتری) برای کوروپلت نمایشی C4.
 * مقدار بازگشتی در بازهٔ ۰ تا ۸ است و با interpolate رنگ لایهٔ fill نگاشت می‌شود.
 */
function provinceHeat(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 997;
  return Math.round(((h % 9) + 1) * 10) / 10;
}

/*
 * توالی dasharray برای انیمیشن «جریان متحرک» روی کریدورها (الگوی رسمی MapLibre):
 * هر قدم، پنجرهٔ dash یک جایگاه جلو می‌رود و حس حرکت پیوستهٔ ترانزیت می‌سازد.
 */
const corridorDashSequence: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

function rasterStyle(
  tiles: string[],
  attribution: string,
  maxzoom: number
): maplibregl.StyleSpecification {
  return {
    version: 8,
    // گلیف‌ها برای لایه‌های symbol (برچسب فارسی کریدورها) روی بیس‌مپ‌های شطرنجی
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      raster: {
        type: 'raster',
        tiles,
        tileSize: 256,
        maxzoom,
        attribution,
      },
    },
    layers: [
      {
        id: 'raster-base',
        type: 'raster',
        source: 'raster',
      },
    ],
  };
}

function styleFor(basemap: BasemapId): string | maplibregl.StyleSpecification {
  const def = BASEMAPS.find((item) => item.id === basemap);
  if (!def) return OPENFREEMAP_DARK;
  if (def.tiles) return rasterStyle(def.tiles, def.attribution, def.maxzoom || 19);
  return basemap === 'dark' ? OPENFREEMAP_DARK : OPENFREEMAP_BRIGHT;
}

/* ------------------------------------------------------------------ *
 * G8 — ماتریس ریسک چندلایه: نمرهٔ ترکیبی ۰ تا ۱۰۰ هر گیت از چهار عامل
 *   ۱) صف زندهٔ Border Park (ساعت انتظار) — ۰ تا ۴۰
 *   ۲) ناهنجاری ثبت‌شدهٔ جریان مرزی (جهش/سقوط/تعارض/غیرواقعی) — ۰ تا ۲۵
 *   ۳) درجهٔ اطمینان دادهٔ اطلس (بالا/متوسط/پایین) — ۰ تا ۲۰
 *   ۴) تردد روزانهٔ گزارش‌شده (فشار ساختاری) — ۰ تا ۱۵
 * رنگ حباب از interpolate سبز → کهربایی → سرخ نگاشت می‌شود و تفکیک عوامل
 * در tooltip لایهٔ ریسک نشان داده می‌شود.
 * ------------------------------------------------------------------ */
interface AnomalyLite {
  gateId: number;
  severity: 'critical' | 'warning' | 'info';
  kind: string;
}

/** جریان OD بین دو گیت (مختصات lng/lat) با حجم تجمعی */
interface OdFlow {
  key: string;
  origin: [number, number];
  dest: [number, number];
  magnitude: number;
  originName: string;
  destName: string;
  corridorLabel: string;
}

/** سلول H3 با فشار تجمیعی گیت‌های داخلش */
interface H3Cell {
  id: string;
  pressure: number;
  gates: string[];
}

function multiLayerRiskScore(
  gate: Crossing,
  live: BorderParkSnapshot | undefined,
  anomalies: AnomalyLite[]
): { score: number; parts: { queue: number; anomaly: number; confidence: number; traffic: number } } {
  const parts = { queue: 0, anomaly: 0, confidence: 0, traffic: 0 };

  // ۱) صف زنده (۴۰): بدون داده = بدون جریمه، صادقانه خنثی
  if (live) {
    const h = Math.max(0, live.maxWaitHours || 0);
    parts.queue = Math.min(40, (h / 240) * 40);
  }

  // ۲) ناهنجاری (۲۵): بدترین شدت ثبت‌شده
  if (anomalies.length) {
    const worst = anomalies.some((a) => a.severity === 'critical')
      ? 25
      : anomalies.some((a) => a.severity === 'warning')
        ? 15
        : 6;
    parts.anomaly = worst;
  }

  // ۳) اطمینان داده (۲۰): پایین = ریسک بالا
  const conf = gate.confidence || 'متوسط';
  parts.confidence = conf === 'بالا' ? 4 : conf === 'متوسط' ? 11 : 20;

  // ۴) تردد روزانه (۱۵): لگاریتمی تا سقف ۶ هزار کامیون
  const tr = Number(gate.trucks_est) || 0;
  parts.traffic = tr > 0 ? Math.min(15, (Math.log10(tr + 1) / Math.log10(6000)) * 15) : 0;

  const score = Math.round(parts.queue + parts.anomaly + parts.confidence + parts.traffic);
  return { score, parts };
}

/* ------------------------------------------------------------------ *
 * H5 — صحنه‌های آمادهٔ حالت روایت (Story mode)
 * هر صحنه: دوربین (center/zoom/pitch)، متن روایت و لایه‌هایی که باید روشن باشند.
 * اجرای صحنه: flyTo + فعال‌سازی لایه از طریق ref callback های MapAtlas.
 * ------------------------------------------------------------------ */
interface StoryScene {
  id: string;
  title: string;
  text: string;
  center: [number, number];
  zoom: number;
  pitch: number;
  duration: number;
  corridor?: number; // ایندکس کریدوری که در این صحنه باید پرواز نمایشی بگیرد
  province?: boolean; // کوروپلت استان‌ها روشن شود؟
}

const STORY_SCENES: StoryScene[] = [
  {
    id: 'born',
    title: 'تولد اطلس',
    text: 'شبکهٔ جاده‌ای و گذرگاه‌های مرزی ایران در قلب اوراسیا — شش کریدور بین‌المللی، ده‌ها دروازهٔ زمینی.',
    center: [54, 34],
    zoom: 3.6,
    pitch: 0,
    duration: 3500,
    province: false,
  },
  {
    id: 'west',
    title: 'دروازهٔ غرب: بازرگان',
    text: 'گذرگاه بازرگان-گوربولاک، پرترددترین مرز ایران و ترکیه؛ جریان کامیون‌ها در کریدور غرب/اروپا.',
    center: [44.38, 39.38],
    zoom: 7.2,
    pitch: 42,
    duration: 5500,
    corridor: 0,
  },
  {
    id: 'instc',
    title: 'کریدور شمال–جنوب: INSTC',
    text: 'مسیر آستارا تا بندرعباس — ستون فقرات ترانزیت ایران به روسیه و هند از کریدور بین‌المللی شمال–جنوب.',
    center: [48.87, 38.44],
    zoom: 6.4,
    pitch: 45,
    duration: 5500,
    corridor: 5,
  },
  {
    id: 'east',
    title: 'صف شرق: دوغارون',
    text: 'مرز دوغارون-اسلام‌قلعه؛ طولانی‌ترین صف انتظار ثبت‌شدهٔ سامانه — کانون فشار ترانزیت افغانستان.',
    center: [61.16, 36.55],
    zoom: 7,
    pitch: 40,
    duration: 5500,
    corridor: 1,
  },
  {
    id: 'risk',
    title: 'نقشهٔ ریسک سرزمین',
    text: 'کوروپلت استان‌ها + ماتریس ریسک چندلایه: صف، ناهنجاری، اطمینان داده و تردد در یک نگاه.',
    center: [54, 32.5],
    zoom: 4.6,
    pitch: 0,
    duration: 4000,
    province: true,
  },
];

/* ------------------------------------------------------------------ *
 * H3 + flowmap.gl — لایه‌های «کانون فشار» و «قوس‌های جریان OD»
 * OD: بین هر جفت گیت سر/تهٔ کریدور فعال یک جریان با حجم تجمعی B2 ساخته
 * می‌شود و با ArcLayer (روحیهٔ flowmap.gl) رسم می‌شود؛ H3HexagonLayer هم
 * صف زنده/تردد را در سلول‌های شش‌ضلعی H3 (res 4) تجمیع می‌کند.
 * ------------------------------------------------------------------ */
const OD_FLOW_COLORS = {
  /** رنگ سر قوس: مبدأ سبز امضایی، مقصد سرخ معنایی */
  arcSource: [116, 162, 30, 200] as [number, number, number, number],
  arcTarget: [190, 30, 45, 200] as [number, number, number, number],
};

/** استنتاج جریان‌های OD از کریدورهای فعال: هر جفت گیت دو سر کریدور یک جریان */
function buildOdFlows(corridors: Corridor[], activeCorridors: boolean[], gates: Crossing[]): OdFlow[] {
  const flows: OdFlow[] = [];
  corridors.forEach((corridor, idx) => {
    if (!activeCorridors[idx] || corridor.points.length < 2) return;
    const first = corridor.points[0];
    const last = corridor.points[corridor.points.length - 1];
    const pick = (pt: [number, number]) =>
      gates
        .map((g) => ({ g, d: calculateDistanceRaw(pt[0], pt[1], g.lat, g.lng) }))
        .sort((a, b) => a.d - b.d)[0];
    const o = pick(first);
    const d = pick(last);
    if (!o || !d || o.g.id === d.g.id) return;
    const magnitude = corridorAggregatedTraffic(corridor, gates);
    if (magnitude <= 0) return;
    flows.push({
      key: `od-${idx}-${o.g.id}-${d.g.id}`,
      origin: [o.g.lng, o.g.lat] as [number, number],
      dest: [d.g.lng, d.g.lat] as [number, number],
      magnitude,
      originName: o.g.name,
      destName: d.g.name,
      corridorLabel: corridorShortLabel(idx),
    });
  });
  return flows;
}

/** تجمیع فشار (صف زنده × وزن انتظار + تردد پایه) در سلول‌های H3 res 4 — لَزی همراه بارگذاری h3-js */
async function buildH3Pressure(gates: Crossing[], live: BorderParkSnapshot[] | undefined): Promise<H3Cell[]> {
  const h3 = await ensureH3();
  const liveByGate = new Map<number, BorderParkSnapshot>();
  (live || []).forEach((g) => {
    if (g.gateId != null) liveByGate.set(g.gateId, g);
  });
  const cells = new Map<string, H3Cell>();
  gates.forEach((g) => {
    const cellId = h3.latLngToCell(g.lat, g.lng, 4);
    const snap = liveByGate.get(g.id);
    // فشار = تردد پایه + ۸ برابر هر تریلر در صف × ضریب شدت انتظار
    const waitFactor = snap ? (snap.maxWaitHours >= 200 ? 2 : snap.maxWaitHours >= 72 ? 1.5 : 1) : 1;
    const pressure = (g.trucks_est || 0) + (snap ? snap.totalQueue * 8 * waitFactor : 0);
    const prev = cells.get(cellId);
    if (prev) {
      prev.pressure += pressure;
      prev.gates.push(g.name);
    } else {
      cells.set(cellId, { id: cellId, pressure, gates: [g.name] });
    }
  });
  return [...cells.values()];
}

/** یافتن نقطهٔ واقع در طول مسیر polyline (درصدی از ۰ تا ۱) با درون‌یابی خطی — انیمیشن کاروان B8 */
function pointAlongPolyline(line: [number, number][], t: number): [number, number] {
  if (!line.length) return [0, 0];
  if (line.length === 1) return line[0];
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i += 1) {
    const dx = line[i][0] - line[i - 1][0];
    const dy = line[i][1] - line[i - 1][1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    segs.push(len);
    total += len;
  }
  const target = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 1; i < line.length; i += 1) {
    if (acc + segs[i - 1] >= target) {
      const k = (target - acc) / segs[i - 1];
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * k, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * k];
    }
    acc += segs[i - 1];
  }
  return line[line.length - 1];
}

interface OverlayData {
  crossings: any;
  corridors: any;
  roads: any;
  route: any;
  alternatives: any;
  isochrones: any;
  draft: any;
  draftPoints: any;
  searchPins: any;
  searchLinks: any;
  searchGates: any;
}

export const MapAtlas: React.FC<MapAtlasProps> = ({
  crossings,
  corridors,
  roadNetwork,
  filteredCrossings,
  activeCorridors,
  darkTheme,
  onSelectCrossing,
  pickMode,
  onPickLocation,
  selectedRoutePath,
  highlightedGateId,
  routeOverlays,
  isochroneOverlays,
  drawMode,
  onMapClick,
  draftPath,
  searchPins,
  focusTarget,
  onOpenSearchResult,
  panelOffset = 0,
  liveGates,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>(darkTheme ? 'dark' : 'bright');
  const skipInitialStyle = useRef(true);
  const crossingsRef = useRef(crossings);
  crossingsRef.current = crossings;
  /** دسترسی هندلرهای نقشه به آخرین فهرست کریدورها (برای popup اطلاعات کریدور) */
  const corridorPointsRef = useRef(corridors);
  corridorPointsRef.current = corridors;
  const panelOffsetRef = useRef(panelOffset);
  panelOffsetRef.current = panelOffset;

  /** پدینگ دوربین تا نقشه زیر پنل کناری و نوار بالا پنهان نشود */
  const cameraPadding = (offset: number) => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const right = Math.max(0, Math.min(offset || 0, width * 0.55));
    return { top: 0, right, bottom: 0, left: 0 };
  };
  const [activeOverlays, setActiveOverlays] = useState<MapOverlayId[]>(['railways']);
  const overlayState = useRef<MapOverlayId[]>(activeOverlays);
  overlayState.current = activeOverlays;

  /**
   * افزودن/حذف لایه‌های تحلیلی شطرنجی و سایه‌نگاری ارتفاع روی هر استایل نقشه.
   * بدون آماده‌بودن استایل، addSource/addLayer خطای «Style is not done loading» می‌دهد؛
   * در آن حالت کاری انجام نمی‌شود چون هندلر style.load همین لایه‌ها را اعمال می‌کند.
   */
  const applyRasterOverlays = (map: maplibregl.Map, force = false) => {
    // در مسیر رویداد style.load اعمال اجباری است؛ این رویداد پیش از آماده‌شدن کامل منابع رخ می‌دهد
    if (!force && !map.isStyleLoaded()) return;

    MAP_OVERLAYS.forEach((def) => {
      const sourceId = `ovl-src-${def.id}`;
      const layerId = `ovl-${def.id}`;
      const vectorLayerId = `${layerId}-vector`;
      const isActive = overlayState.current.includes(def.id);

      const removeVariants = () => {
        if (map.getLayer(vectorLayerId)) map.removeLayer(vectorLayerId);
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      };

      if (!isActive) {
        removeVariants();
        return;
      }

      /*
       * راه‌آهن روی نقشه‌های پایهٔ برداری از لایهٔ transportation منبع OpenMapTiles رسم می‌شود:
       * بدون کلید، بدون محدودیت نرخ و با کیفیت در تمام زوم‌ها. کاشی شطرنجی OpenRailwayMap
       * فقط جایگزین است، چون سرور عمومی آن پس از چند درخواست پاسخ ۴۰۳ می‌دهد.
       */
      if (def.vectorRail && map.getSource('openmaptiles')) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        if (!map.getLayer(vectorLayerId)) {
          map.addLayer({
            id: vectorLayerId,
            type: 'line',
            source: 'openmaptiles',
            'source-layer': 'transportation',
            filter: [
              'all',
              ['==', ['geometry-type'], 'LineString'],
              ['in', ['get', 'class'], ['literal', ['rail', 'transit']]],
            ],
            paint: {
              'line-color': '#c084fc',
              'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 6, 1, 10, 1.6, 14, 2.4],
              'line-opacity': 0.9,
              'line-dasharray': ['literal', [3, 2]],
            },
            layout: { 'line-cap': 'butt', 'line-join': 'round' },
          });
        }
        return;
      }

      // نقشه‌های پایهٔ شطرنجی: استفاده از کاشی OpenRailwayMap
      if (map.getLayer(vectorLayerId)) map.removeLayer(vectorLayerId);

      if (!map.getSource(sourceId)) {
        if (def.kind === 'hillshade') {
          map.addSource(sourceId, {
            type: 'raster-dem',
            tiles: def.tiles,
            tileSize: def.tileSize,
            encoding: 'terrarium',
            maxzoom: def.maxzoom,
            attribution: def.attribution,
          });
        } else {
          map.addSource(sourceId, {
            type: 'raster',
            tiles: def.tiles,
            tileSize: def.tileSize,
            maxzoom: def.maxzoom,
            attribution: def.attribution,
          });
        }
      }

      if (!map.getLayer(layerId)) {
        if (def.kind === 'hillshade') {
          map.addLayer({
            id: layerId,
            type: 'hillshade',
            source: sourceId,
            paint: {
              'hillshade-exaggeration': 0.45,
              'hillshade-shadow-color': '#0b1220',
              'hillshade-highlight-color': '#f8fafc',
              'hillshade-accent-color': '#334155',
            },
          });
        } else {
          map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: { 'raster-opacity': def.opacity },
          });
        }
      }
    });
  };

  // Build GeoJSONs
  /** نقشهٔ دادهٔ زندهٔ صف بر پایهٔ شناسهٔ گذرگاه */
  const liveByGateId = new Map<number, BorderParkSnapshot>();
  (liveGates || []).forEach((g) => {
    if (g.gateId != null) liveByGateId.set(g.gateId, g);
  });

  const getCrossingsGeoJSON = () => {
    return {
      type: 'FeatureCollection',
      features: filteredCrossings.map((c) => {
        const feature = {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] as [number, number] },
          properties: {
            id: c.id,
            name: c.name,
            name_en: c.name_en || '',
            country: c.country,
            layer: c.layer,
            iran: c.country === 'ایران' ? 1 : 0,
            tr: c.trucks_est || 0,
            type: c.type,
            status: c.status || '',
            // دادهٔ زندهٔ صف گمرک (در نبود داده، رنگ از نوع گذرگاه می‌آید)
            live: 0,
            totalQueue: 0,
            maxWait: 0,
            conf: '',
            updated: '',
            // G8: نمرهٔ ریسک ترکیبی و تفکیک عوامل (در Tooltip لایهٔ ریسک نمایش داده می‌شود)
            risk: 0,
            riskQ: 0,
            riskA: 0,
            riskC: 0,
            riskT: 0,
          },
        };
        const snap = liveByGateId.get(c.id);
        if (snap && snap.confidence !== 'low') {
          feature.properties.live = 1;
          feature.properties.totalQueue = snap.totalQueue;
          feature.properties.maxWait = snap.maxWaitHours;
          feature.properties.conf = snap.confidence;
          feature.properties.updated = snap.sourceUpdatedAt || '';
        }
        const gateAnomalies = anomaliesRef.current.filter((a) => a.gateId === c.id);
        const risk = multiLayerRiskScore(c, snap, gateAnomalies);
        feature.properties.risk = risk.score;
        feature.properties.riskQ = risk.parts.queue;
        feature.properties.riskA = risk.parts.anomaly;
        feature.properties.riskC = risk.parts.confidence;
        feature.properties.riskT = risk.parts.traffic;
        return feature;
      }),
    };
  };

  const getCorridorsGeoJSON = () => {
    return {
      type: 'FeatureCollection',
      features: corridors.map((k, i) => {
        // B2: تردد تجمیعی گیت‌های ابتدا/انتهای کریدور → ضخامت و اطلاعات پاپ‌آپ
        const trafficSum = corridorAggregatedTraffic(k, crossings);
        const widthBase = 2.2 + Math.min(1, trafficSum / B2_MAX_SUM) * 4.3; // بازهٔ ۲٫۲ تا ۶٫۵
        return {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: k.points.map((p) => [p[1], p[0]]),
          },
          properties: {
            i,
            color: k.color,
            on: activeCorridors[i] ? 1 : 0,
            label: corridorShortLabel(i),
            traffic: trafficSum,
            widthBase,
          },
        };
      }),
    };
  };

  const getRoadsGeoJSON = () => {
    const features: any[] = [];
    Object.entries(roadNetwork).forEach(([cn, co]) => {
      co.routes.forEach((r, ri) => {
        features.push({
          type: 'Feature',
          properties: {
            country: cn,
            name: r.n,
            ref: r.ref,
            color: co.color,
            id: `${cn}|${ri}`,
          },
          geometry: {
            type: 'LineString',
            coordinates: r.c.map((p) => [p[2], p[1]]),
          },
        });
      });
    });
    return { type: 'FeatureCollection', features };
  };

  const getSelectedRouteGeoJSON = () => {
    if (!selectedRoutePath || selectedRoutePath.length < 2) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: selectedRoutePath,
          },
          properties: {},
        },
      ],
    };
  };

  const getAlternativeRoutesGeoJSON = () => ({
    type: 'FeatureCollection',
    features: (routeOverlays || [])
      .filter((overlay) => overlay.coordinates && overlay.coordinates.length > 1)
      .map((overlay) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: overlay.coordinates },
        properties: {
          id: overlay.id,
          label: overlay.label,
          color: overlay.color,
          dash: overlay.dash ? 1 : 0,
          width: overlay.width || 3.5,
        },
      })),
  });

  const getIsochronesGeoJSON = () => ({
    type: 'FeatureCollection',
    features: (isochroneOverlays || [])
      .filter((overlay) => overlay.geometry)
      .map((overlay) => ({
        type: 'Feature',
        geometry: overlay.geometry,
        properties: { id: overlay.id, label: overlay.label, color: overlay.color, hours: overlay.hours },
      })),
  });

  const getDraftGeoJSON = () => {
    const points = draftPath || [];
    return {
      type: 'FeatureCollection',
      features:
        points.length > 1
          ? [
              {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: points },
                properties: {},
              },
            ]
          : [],
    };
  };

  const getDraftPointsGeoJSON = () => ({
    type: 'FeatureCollection',
    features: (draftPath || []).map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: point },
      properties: {},
    })),
  });

  /**
   * خطوط اتصال نشانه‌های جستجو به نزدیک‌ترین گذرگاه مرزی.
   * اگر هندسهٔ واقعی جاده‌ای در دست باشد مسیر جاده رسم می‌شود؛ در غیر این صورت خط مستقیم.
   */
  const getSearchLinksGeoJSON = () => ({
    type: 'FeatureCollection',
    features: (searchPins || [])
      .filter(
        (pin) => pin.nearestGateLat !== null && pin.nearestGateLng !== null && (pin.nearestGateKm || 0) >= 5
      )
      .map((pin) => {
        const hasRoadPath = Array.isArray(pin.nearestGatePath) && pin.nearestGatePath.length >= 2;
        return {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: hasRoadPath
              ? (pin.nearestGatePath as [number, number][])
              : [
                  [pin.lng, pin.lat],
                  [pin.nearestGateLng as number, pin.nearestGateLat as number],
                ],
          },
          properties: {
            color: pin.color,
            label: pin.label,
            gate: pin.nearestGateName || '',
            km: pin.nearestGateKm || 0,
            road: pin.nearestGateRoad ? 1 : 0,
            path: hasRoadPath ? 1 : 0,
          },
        };
      }),
  });

  const getSearchGatesGeoJSON = () => ({
    type: 'FeatureCollection',
    features: (searchPins || [])
      .filter(
        (pin) => pin.nearestGateLat !== null && pin.nearestGateLng !== null && (pin.nearestGateKm || 0) >= 5
      )
      .map((pin) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pin.nearestGateLng as number, pin.nearestGateLat as number] },
        properties: {
          name: pin.nearestGateName || '',
          km: pin.nearestGateKm || 0,
          road: pin.nearestGateRoad ? 1 : 0,
          minutes: pin.nearestGateMinutes || 0,
        },
      })),
  });

  const getSearchPinsGeoJSON = () => ({
    type: 'FeatureCollection',
    features: (searchPins || []).map((pin) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
      properties: {
        id: pin.id,
        label: pin.label,
        title: pin.title,
        url: pin.url,
        source: pin.source,
        color: pin.color,
        rank: pin.rank,
        gate: pin.nearestGateName || '',
        km: pin.nearestGateKm || 0,
        road: pin.nearestGateRoad ? 1 : 0,
      },
    })),
  });

  // Latest overlay payload, so overlays can be rebuilt with fresh data after a style swap
  const overlayBuilder = useRef<(() => OverlayData) | null>(null);
  overlayBuilder.current = () => ({
    crossings: getCrossingsGeoJSON(),
    corridors: getCorridorsGeoJSON(),
    roads: getRoadsGeoJSON(),
    route: getSelectedRouteGeoJSON(),
    alternatives: getAlternativeRoutesGeoJSON(),
    isochrones: getIsochronesGeoJSON(),
    draft: getDraftGeoJSON(),
    draftPoints: getDraftPointsGeoJSON(),
    searchPins: getSearchPinsGeoJSON(),
    searchLinks: getSearchLinksGeoJSON(),
    searchGates: getSearchGatesGeoJSON(),
  });

  // آخرین حالت تعامل نقشه (برای هندلرهای یک‌بارهٔ MapLibre)
  const interaction = useRef({ pickMode, onPickLocation, drawMode, onMapClick, searchPins, onOpenSearchResult });
  interaction.current = { pickMode, onPickLocation, drawMode, onMapClick, searchPins, onOpenSearchResult };

  /** دسترسی هندلرهای نقشه به آخرین وضعیت زندهٔ صف گمرک */
  const liveGatesRef = useRef<BorderParkSnapshot[] | undefined>(liveGates);
  liveGatesRef.current = liveGates;

  /**
   * حلقهٔ انیمیشن مشترک نقشه: تپش حلقهٔ گیت‌های بحرانی (انتظار ≥ ۲۰۰ ساعت)
   * و جریان متحرک dash روی کریدورها (B1). در هر فریم آماده‌بودن استایل سنجیده می‌شود؛
   * پس از تعویض بیس‌مپ، لایه‌ها توسط هندلر style.load بازساخته می‌شوند و انیمیشن ادامه می‌یابد.
   */
  const pulseRef = useRef<number>(0);
  const flowStepRef = useRef(0);

  /* کنترل انیمیشن جریان کریدورها (B1+) — از طریق ref به حلقهٔ rAF می‌رسد تا هر فریم رندر نشود */
  const [flowEnabled, setFlowEnabled] = useState(true);
  const [flowSpeed, setFlowSpeed] = useState(1); // ضریب سرعت: ۰٫۵ آهسته / ۱ عادی / ۲ تند
  const flowEnabledRef = useRef(flowEnabled);
  flowEnabledRef.current = flowEnabled;

  /** G8: وضعیت لایهٔ ریسک برای بازساخت پس از تعویض سبک نقشه */
  const riskLayerOnRef = useRef(false);
  const flowSpeedRef = useRef(150);
  flowSpeedRef.current = Math.round(150 / Math.max(0.25, flowSpeed));

  /* C4 — کوروپلت استان‌ها: منبع GeoJSON به‌صورت لَزی هنگام فعال‌شدن سوییچ واکشی می‌شود */
  const [showProvinces, setShowProvinces] = useState(false);
  const [provinceStatus, setProvinceStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const provincesRef = useRef<any>(null); // آخرین FeatureCollection واکشی‌شده (برای style.load)
  const provincesStatusRef = useRef<'idle' | 'loading' | 'ready' | 'error'>('idle');
  provincesStatusRef.current = provinceStatus;

  /** واکشی یک‌بارهٔ هندسهٔ استان‌ها از سرور (پروکسی geoBoundaries) و افزودن لایهٔ کوروپلت */
  const ensureProvinces = async () => {
    const map = mapRef.current;
    if (!map) return;
    if (provincesRef.current) {
      addProvincesLayer(map, provincesRef.current);
      setProvinceStatus('ready');
      return;
    }
    setProvinceStatus('loading');
    try {
      const res = await fetch('/api/provinces');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.geojson) throw new Error(data?.error || `خطای سرور استان‌ها (${res.status})`);
      provincesRef.current = data.geojson;
      if (mapRef.current === map) {
        addProvincesLayer(map, data.geojson);
        setProvinceStatus('ready');
      }
    } catch (error) {
      console.warn('provinces fetch failed:', error);
      setProvinceStatus('error');
    }
  };

  const toggleProvinces = () => {
    const next = !showProvinces;
    setShowProvinces(next);
    const map = mapRef.current;
    if (!map) return;
    if (next) {
      void ensureProvinces();
    } else {
      try {
        if (map.getLayer('province-fill')) map.removeLayer('province-fill');
        if (map.getLayer('province-line')) map.removeLayer('province-line');
        if (map.getLayer('province-hover')) map.removeLayer('province-hover');
        if (map.getSource('provinces')) map.removeSource('provinces');
      } catch (error) {
        console.warn('provinces layer removal failed:', error);
      }
    }
  };

  /* A6 — ستون‌های سه‌بعدی صف گمرک: deck.gl به‌صورت لَزی ایمپورت و روی نقشه سوار می‌شود */
  const [showQueueColumns, setShowQueueColumns] = useState(false);
  const deckRef = useRef<{ overlay: any } | null>(null);
  const liveGatesDeckRef = useRef<BorderParkSnapshot[] | undefined>(liveGates);
  liveGatesDeckRef.current = liveGates;

  // وضعیت سه toggle لایه‌های deck.gl + کش لایه‌های لَزی و داده‌های مشتق
  const showQueueColumnsRef = useRef(false);
  showQueueColumnsRef.current = showQueueColumns;
  const [h3PressureOn, setH3PressureOn] = useState(false);
  const h3PressureRef = useRef(false);
  h3PressureRef.current = h3PressureOn;
  const h3CellsRef = useRef<H3Cell[]>([]);
  const [odFlowsOn, setOdFlowsOn] = useState(false);
  const odFlowsRef = useRef(false);
  odFlowsRef.current = odFlowsOn;
  const activeCorridorsRef = useRef(activeCorridors);
  activeCorridorsRef.current = activeCorridors;
  const ColumnLayerRef = useRef<any>(null);
  const H3HexagonLayerRef = useRef<any>(null);
  const ArcLayerRef = useRef<any>(null);
  /** popupهای tooltip لایه‌های H3 و OD (پایهٔ MapLibre، سبک مشترک پوسته) */
  const h3PopupRef = useRef<maplibregl.Popup | null>(null);
  const odPopupRef = useRef<maplibregl.Popup | null>(null);
  useEffect(() => {
    h3PopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: 8, maxWidth: '240px' });
    odPopupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: 8, maxWidth: '240px' });
    return () => {
      h3PopupRef.current?.remove();
      odPopupRef.current?.remove();
      h3PopupRef.current = null;
      odPopupRef.current = null;
    };
  }, []);

  /** اطمینان از وجود overlay (وقتی یکی از toggleهای دیگر اول روشن می‌شود) — همراه بارگذاری لَزی h3-js */
  const toggleQueueColumnsHelpers = {
    ensureOverlay: async () => {
      const map = mapRef.current;
      if (!map || deckRef.current) return;
      try {
        const [{ MapboxOverlay }, { ColumnLayer: col }, { H3HexagonLayer: hex }, { ArcLayer: arc }] = await Promise.all([
          import('@deck.gl/mapbox'),
          import('@deck.gl/layers'),
          import('@deck.gl/geo-layers'),
          import('@deck.gl/layers'),
          ensureH3(),
        ]);
        if (mapRef.current !== map) return;
        ColumnLayerRef.current = col;
        H3HexagonLayerRef.current = hex;
        ArcLayerRef.current = arc;
        const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
        map.addControl(overlay as any);
        deckRef.current = { overlay };
        // بدون این sync، اگر اولین toggle روشن‌شده H3 یا OD باشد، لایه تا toggle بعدی رندر نمیشد
        syncDeckLayers();
      } catch (error) {
        console.warn('deck.gl overlay init failed:', error);
      }
    },
  };

  /** بازسازی لایه‌های deck.gl مطابق وضعیت سه toggle — بعد از addControl یا هر toggle فراخوانی می‌شود */
  const syncDeckLayers = () => {
    const overlay = deckRef.current?.overlay;
    if (!overlay) return;
    const ColumnLayer = ColumnLayerRef.current;
    const H3HexagonLayer = H3HexagonLayerRef.current;
    const ArcLayer = ArcLayerRef.current;
    if (!ColumnLayer || !H3HexagonLayer || !ArcLayer) return;
    const layers: any[] = [];

    if (showQueueColumnsRef.current) {
      layers.push(new ColumnLayer({
        id: 'queue-columns',
        data: (liveGatesDeckRef.current || [])
          .filter((g) => g.gateId != null && g.totalQueue > 0)
          .map((g) => {
            const crossing = crossingsRef.current.find((c) => c.id === g.gateId);
            return {
              position: [crossing?.lng ?? 0, crossing?.lat ?? 0] as [number, number],
              totalQueue: g.totalQueue,
              maxWait: g.maxWaitHours,
              name: g.gateNameFa,
            };
          }),
        diskRadius: 1,
        radius: 38000,
        extruded: true,
        wireframe: false,
        filled: true,
        getPosition: (d: any) => d.position,
        getElevation: (d: any) => Math.min(900000, d.totalQueue * 9500),
        getFillColor: (d: any) =>
          d.maxWait >= 200 ? [251, 113, 133, 235] : d.maxWait >= 72 ? [251, 191, 36, 235] : [45, 212, 191, 235],
        pickable: true,
        autoHighlight: true,
        material: { ambient: 0.64, diffuse: 0.6, shininess: 32, specularColor: [255, 255, 255] },
      }));
    }

    if (h3PressureRef.current) {
      const maxPressure = Math.max(1, ...h3CellsRef.current.map((c) => c.pressure));
      layers.push(new H3HexagonLayer({
        id: 'h3-pressure',
        data: h3CellsRef.current,
        getHexagon: (d: H3Cell) => d.id,
        extruded: true,
        filled: true,
        stroked: false,
        coverage: 0.86,
        elevationScale: 60,
        getElevation: (d: H3Cell) => (d.pressure / maxPressure) * 60000,
        getFillColor: (d: H3Cell) => {
          const t = d.pressure / maxPressure;
          return t >= 0.66 ? [251, 113, 133, 130] : t >= 0.33 ? [251, 191, 36, 120] : [116, 162, 30, 105];
        },
        pickable: true,
        autoHighlight: true,
        material: { ambient: 0.7, diffuse: 0.5, shininess: 16, specularColor: [255, 255, 255] },
        onHover: (info: any) => {
          if (!info.object || !mapRef.current) return;
          const cell = info.object as H3Cell;
          const gatesIn = cell.gates.slice(0, 5).join('، ');
          h3PopupRef.current
            ?.setLngLat(info.lngLat)
            .setHTML(
              `<div class="text-right font-['Vazirmatn']" style="min-width:170px">
                <div class="font-bold text-xs text-[#74a21e]">کانون فشار H3</div>
                <div class="text-[10px] text-slate-300 mt-1">فشار تجمیعی: <b style="color:${cell.pressure >= maxPressure * 0.66 ? '#fb7185' : cell.pressure >= maxPressure * 0.33 ? '#fbbf24' : '#74a21e'}">${Math.round(cell.pressure).toLocaleString('fa-IR')}</b></div>
                <div class="text-[9px] text-slate-400 mt-0.5 leading-relaxed">گیت‌ها: ${gatesIn}${cell.gates.length > 5 ? ` و ${cell.gates.length - 5} گیت دیگر` : ''}</div>
                <div class="text-[9px] text-teal-300 mt-1">برای پرواز کلیک کنید</div>
              </div>`
            )
            .addTo(mapRef.current);
        },
        onClick: (info: any) => {
          const map = mapRef.current;
          if (!info.object || !map) return;
          const cell = info.object as H3Cell;
          const center = h3().cellToLatLng(cell.id);
          (map as any).__cameraLog = `h3-fly cell=${cell.id}`;
          map.flyTo({ center: [center[1], center[0]], zoom: Math.max(map.getZoom(), 6.5), pitch: 45, duration: 1400 });
          h3PopupRef.current?.remove();
        },
      }));
    }

    if (odFlowsRef.current) {
      const flows = buildOdFlows(corridorPointsRef.current, activeCorridorsRef.current, crossingsRef.current);
      const maxMag = Math.max(1, ...flows.map((f) => f.magnitude));
      layers.push(new ArcLayer({
        id: 'od-arc-flows',
        data: flows,
        getSourcePosition: (d: OdFlow) => d.origin,
        getTargetPosition: (d: OdFlow) => d.dest,
        getSourceColor: OD_FLOW_COLORS.arcSource,
        getTargetColor: OD_FLOW_COLORS.arcTarget,
        getWidth: (d: OdFlow) => 1.2 + (d.magnitude / maxMag) * 6.5,
        widthUnits: 'pixels',
        greatCircle: true,
        getHeight: 0.55,
        pickable: true,
        autoHighlight: true,
        onHover: (info: any) => {
          if (!info.object || !mapRef.current) return;
          const flow = info.object as OdFlow;
          odPopupRef.current
            ?.setLngLat(info.lngLat)
            .setHTML(
              `<div class="text-right font-['Vazirmatn']" style="min-width:180px">
                <div class="font-bold text-xs text-[#74a21e]">جریان ${flow.corridorLabel}</div>
                <div class="text-[10px] text-slate-300 mt-1">${flow.originName} ← <span style="color:#fb7185">${flow.destName}</span></div>
                <div class="text-[10px] text-slate-400 mt-0.5">حجم تجمعی: ≈ <b class="text-slate-200">${Math.round(flow.magnitude).toLocaleString('fa-IR')}</b> کامیون/روز</div>
              </div>`
            )
            .addTo(mapRef.current);
        },
      }));
    }

    overlay.setProps({ layers });
  };

  const toggleQueueColumns = async () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !showQueueColumns;
    setShowQueueColumns(next);
    if (!next) {
      // اگر هیچ لایهٔ دیگری از overlay فعال نمانده، کل کنترل برداشته می‌شود
      if (!h3PressureRef.current && !odFlowsRef.current) {
        try {
          if (deckRef.current) map.removeControl(deckRef.current.overlay as any);
        } catch { /* نقشه ممکن است از قبل دور ریخته شده باشد */ }
        deckRef.current = null;
      } else {
        syncDeckLayers();
      }
      return;
    }
    if (!deckRef.current) {
      try {
        const [{ MapboxOverlay }, { ColumnLayer: col }, { H3HexagonLayer: hex }, { ArcLayer: arc }] = await Promise.all([
          import('@deck.gl/mapbox'),
          import('@deck.gl/layers'),
          import('@deck.gl/geo-layers'),
          import('@deck.gl/layers'),
          ensureH3(),
        ]);
        if (mapRef.current !== map) return; // نقشه در فاصلهٔ ایمپورت دور ریخته شده
        ColumnLayerRef.current = col;
        H3HexagonLayerRef.current = hex;
        ArcLayerRef.current = arc;
        const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
        // MapboxOverlay در deck.gl v9 اینترفیس IControl را پیاده می‌کند؛ در MapLibre با addControl سوار می‌شود
        map.addControl(overlay as any);
        deckRef.current = { overlay };
      } catch (error) {
        console.warn('deck.gl overlay init failed:', error);
        setShowQueueColumns(false);
        return;
      }
    }
    syncDeckLayers();
  };

  /** toggle لایهٔ کانون فشار H3 — سلول‌ها پس از بارگذاری لَزی h3-js محاسبه می‌شوند */
  const toggleH3Pressure = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !h3PressureOn;
    setH3PressureOn(next);
    if (next) {
      buildH3Pressure(crossingsRef.current, liveGatesDeckRef.current)
        .then((cells) => {
          h3CellsRef.current = cells;
          syncDeckLayers();
        })
        .catch((error) => {
          console.warn('h3-js load failed:', error);
          setH3PressureOn(false);
        });
    }
    if (!next && !showQueueColumns && !odFlowsRef.current) {
      try {
        if (deckRef.current) map.removeControl(deckRef.current.overlay as any);
      } catch { /* دور ریخته */ }
      deckRef.current = null;
    } else {
      void toggleQueueColumnsHelpers.ensureOverlay();
      syncDeckLayers();
    }
  };

  /** toggle لایهٔ قوس‌های جریان OD */
  const toggleOdFlows = () => {
    const map = mapRef.current;
    if (!map) return;
    const next = !odFlowsOn;
    setOdFlowsOn(next);
    if (!next && !showQueueColumns && !h3PressureRef.current) {
      try {
        if (deckRef.current) map.removeControl(deckRef.current.overlay as any);
      } catch { /* دور ریخته */ }
      deckRef.current = null;
    } else {
      void toggleQueueColumnsHelpers.ensureOverlay();
      syncDeckLayers();
    }
  };

  /* ------------------------------------------------------------------
   * H2 — نمای کرهٔ زمین (گلو): MapLibre v6 پروجکشن globe داخلی دارد؛
   * برای مقیاس اوراسیا و «تولد اطلس». سوییچ از پنل نقشه.
   * ------------------------------------------------------------------ */
  const [globeMode, setGlobeMode] = useState(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setProjection({ type: globeMode ? 'globe' : 'mercator' });
      if (globeMode) {
        // نمای اولیهٔ کره: تمام اوراسیا در قاب
        map.flyTo({ center: [54, 34], zoom: 1.6, duration: 1600, pitch: 0 });
      }
    } catch (error) {
      console.warn('projection switch failed:', error);
    }
  }, [globeMode]);

  /* ------------------------------------------------------------------
   * H4 — تور پروازی کریدور: دوربین در طول خط کریدور پرواز می‌کند (flyAlong با easing)
   * B8 — انیمیشن کاروان: نقاط متحرک نمونهٔ کامیون روی کریدور فعال در حلقهٔ rAF مشترک
   * ------------------------------------------------------------------ */
  const [tourCorridor, setTourCorridor] = useState<number | null>(null);
  const tourRef = useRef<{ idx: number; cancelled: boolean } | null>(null);
  const [tourPlaying, setTourPlaying] = useState(false);
  const tourTimers = useRef<number[]>([]); // تایمرهای گام‌های تور برای لغو قطعی هنگام توقف
  const [caravanEnabled, setCaravanEnabled] = useState(false);
  const [caravanProgress, setCaravanProgress] = useState(0);
  const caravanProgressRef = useRef(0);
  caravanProgressRef.current = caravanProgress;
  const caravanCorridorRef = useRef<number>(0); // کاروان روی اولین کریدور فعال
  const tourStageRef = useRef<{ scene: StoryScene | null; at: number }>({ scene: null, at: 0 });

  /** نمای رویداد تور: هر فریم دوربین کمی جلو می‌رود؛ بین گام‌ها easing نرم */
  const startTour = (corridorIdx: number) => {
    const map = mapRef.current;
    const corridor = corridors[corridorIdx];
    if (!map || !corridor || corridor.points.length < 2) return;
    setTourCorridor(corridorIdx);
    setTourPlaying(true);
    tourRef.current = { idx: 0, cancelled: false };

    const line: [number, number][] = corridor.points.map((p) => [p[1], p[0]]);
    const stepMs = 1300; // هر گام ۱٫۳ ثانیه؛ بین هر دو نقطهٔ کریدور یک پرش نرم
    const play = () => {
      const state = tourRef.current;
      if (!state || state.cancelled || !mapRef.current) return;
      if (state.idx >= line.length) {
        setTourPlaying(false);
        tourRef.current = null;
        return;
      }
      const [lng, lat] = line[state.idx];
      (mapRef.current as any).__cameraLog = `tour c${corridorIdx} step${state.idx} to=${lng},${lat}`;
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 6.2,
        pitch: 46,
        bearing: (state.idx * 37) % 360,
        duration: stepMs,
        easing: (t: number) => t * (2 - t), // ease-out نرم
        essential: true,
      });
      state.idx += 1;
      tourTimers.current.push(window.setTimeout(play, stepMs + 120));
    };
    play();
  };

  const stopTour = () => {
    if (tourRef.current) tourRef.current.cancelled = true;
    tourRef.current = null;
    tourTimers.current.forEach((t) => window.clearTimeout(t));
    tourTimers.current = [];
    setTourPlaying(false);
    setTourCorridor(null);
  };

  /** زیرنویس گیت نزدیک به موقعیت جاری تور/کاروان (برای نمایش در نوار پایین نقشه) */
  const tourSubtitle = useMemo(() => {
    if (tourCorridor == null || !tourPlaying) return null;
    const corridor = corridors[tourCorridor];
    if (!corridor) return null;
    const near = crossings
      .map((gate) => ({ gate, dist: Math.min(...corridor.points.map((p) => calculateDistanceRaw(p[0], p[1], gate.lat, gate.lng))) }))
      .sort((a, b) => a.dist - b.dist)[0];
    if (!near) return corridor.name;
    return `${corridor.name} — نزدیک‌ترین گیت: ${near.gate.name} (${near.gate.country}) · ${Math.round(near.dist)} کیلومتر`;
  }, [tourCorridor, tourPlaying, corridors, crossings]);

  /* ------------------------------------------------------------------
   * H5 — حالت روایت: پخش صحنه‌های آماده با دوربین + لایه‌های هم‌افزا
   * ------------------------------------------------------------------ */
  const [storyIdx, setStoryIdx] = useState<number | null>(null);
  const [storyText, setStoryText] = useState<string | null>(null);
  const storyTimerRef = useRef<number | null>(null);

  const applyStoryScene = (scene: StoryScene) => {
    const map = mapRef.current;
    if (!map) return;
    (map as any).__cameraLog = `story ${scene.id} to=${scene.center[0]},${scene.center[1]} z=${scene.zoom}`;
    map.flyTo({ center: scene.center, zoom: scene.zoom, pitch: scene.pitch, duration: Math.min(scene.duration, 4000), essential: true });
    setStoryText(scene.text);

    // لایه‌های صحنه: کوروپلت استان‌ها + پرواز نمایشی کریدور
    if (scene.province && !showProvinces) {
      setShowProvinces(true);
      void ensureProvinces();
    }
    if (typeof scene.corridor === 'number') {
      // بازآغاز تور برای صحنه‌های کریدور محور
      stopTour();
      window.setTimeout(() => startTour(scene.corridor as number), 250);
    } else if (!scene.province) {
      stopTour();
    }
  };

  const startStory = () => {
    stopStory();
    setStoryIdx(0);
    applyStoryScene(STORY_SCENES[0]);
    const schedule = (idx: number) => {
      storyTimerRef.current = window.setTimeout(() => {
        const next = idx + 1;
        if (next >= STORY_SCENES.length) {
          stopStory();
          return;
        }
        setStoryIdx(next);
        applyStoryScene(STORY_SCENES[next]);
        schedule(next);
      }, STORY_SCENES[idx].duration);
    };
    schedule(0);
  };

  const stopStory = () => {
    if (storyTimerRef.current) window.clearTimeout(storyTimerRef.current);
    storyTimerRef.current = null;
    setStoryIdx(null);
    setStoryText(null);
    stopTour();
  };

  useEffect(() => () => {
    if (storyTimerRef.current) window.clearTimeout(storyTimerRef.current);
  }, []);

  /* ------------------------------------------------------------------
   * G8 — ماتریس ریسک چندلایه: ناهنجاری‌های جریان مرزی یک‌بار در mount از سرور
   * گرفته می‌شوند و در getCrossingsGeoJSON به‌عنوان ویژگی risk/parts تزریق می‌شوند؛
   * لایهٔ دایرهٔ ریسک (pts-risk) رنگ سبز→کهربایی→سرخ می‌گیرد و tooltip تفکیک عوامل دارد.
   * ------------------------------------------------------------------ */
  const [riskReady, setRiskReady] = useState(false);
  const anomaliesRef = useRef<AnomalyLite[]>([]);
  useEffect(() => {
    let alive = true;
    fetch('/api/border-flow/anomalies')
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!alive || !payload) return;
        const items = Array.isArray(payload.anomalies) ? payload.anomalies : [];
        anomaliesRef.current = items
          .filter((a: any) => a && typeof a.gateId === 'number')
          .map((a: any) => ({
            gateId: a.gateId as number,
            severity: (['critical', 'warning', 'info'].includes(a.severity) ? a.severity : 'info') as AnomalyLite['severity'],
            kind: String(a.kind || ''),
          }));
        setRiskReady(true);
      })
      .catch(() => {
        // بدون شبکهٔ خبری: نمرهٔ ریسک بدون عامل ناهنجاری محاسبه می‌شود (صادقانه)
        if (alive) setRiskReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  /* ------------------------------------------------------------------
   * B8 — انیمیشن کاروان: چند کامیون نمونه روی کریدور فعال در حلقهٔ rAF جابه‌جا می‌شوند؛
   * منبع GeoJSON کاروان در addOverlays ساخته می‌شود و اینجا پیشرفت/کریدور/حلقه نگه داشته می‌شود.
   * ------------------------------------------------------------------ */
  const caravanEnabledRef = useRef(false);
  const [riskLayerOn, setRiskLayerOn] = useState(false); // لایهٔ ریسک ترکیبی G8
  const caravanDataRef = useRef<maplibregl.GeoJSONSource | null>(null);
  const caravanPhaseRef = useRef(0);
  const lastCaravanPushRef = useRef(0);

  /** روشن/خاموش کردن کاروان و پاک‌کردن نقطه‌ها هنگام توقف */
  const toggleCaravan = () => {
    const next = !caravanEnabled;
    setCaravanEnabled(next);
    caravanEnabledRef.current = next;
    if (next) {
      // کریدور کاروان: اولین کریدور فعال (اگر هیچ‌کدام فعال نباشد، کریدور ۰)
      const firstActive = activeCorridors.findIndex(Boolean);
      caravanCorridorRef.current = firstActive >= 0 ? firstActive : 0;
    } else {
      try {
        caravanDataRef.current?.setData({ type: 'FeatureCollection', features: [] } as any);
      } catch { /* سبک در حال تعویض */ }
    }
  };

  /** روشن/خاموش کردن لایهٔ ریسک ترکیبی G8 (هر دو لایهٔ دایره و hit) */
  const toggleRiskLayer = () => {
    const next = !riskLayerOn;
    setRiskLayerOn(next);
    riskLayerOnRef.current = next;
    const map = mapRef.current;
    if (!map) return;
    try {
      if (map.getLayer('pts-risk')) {
        map.setLayoutProperty('pts-risk', 'visibility', next ? 'visible' : 'none');
      }
      if (map.getLayer('pts-risk-hit')) {
        map.setLayoutProperty('pts-risk-hit', 'visibility', next ? 'visible' : 'none');
      }
    } catch (error) {
      console.warn('risk layer toggle failed:', error);
    }
  };

  /**
   * افزودن/بروزرسانی لایهٔ کوروپلت استان‌ها. شدت رنگ (heat) یک‌بار در JS از هش نام
   * استان ساخته و به ویژگی‌ها تزریق می‌شود تا عبارت نقشه ساده و معتبر بماند.
   */
  const addProvincesLayer = (map: maplibregl.Map, geojson: any) => {
    try {
      const enriched: any = {
        type: 'FeatureCollection',
        features: (geojson?.features || []).map((f: any, idx: number) => ({
          ...f,
          properties: { ...f.properties, heat: provinceHeat(f?.properties?.name || `استان ${idx}`) },
        })),
      };
      const existing = map.getSource('provinces') as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(enriched);
      } else {
        map.addSource('provinces', { type: 'geojson', data: enriched });
      }
      if (!map.getLayer('province-fill')) {
        map.addLayer({
          id: 'province-fill',
          type: 'fill',
          source: 'provinces',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'heat'],
              0, 'rgba(45,212,191,0.04)',
              8, 'rgba(45,212,191,0.26)',
            ],
          },
        });
        map.addLayer({
          id: 'province-line',
          type: 'line',
          source: 'provinces',
          paint: {
            'line-color': 'rgba(94,234,212,0.4)',
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 7, 1.4],
          },
        });
        map.addLayer({
          id: 'province-hover',
          type: 'fill',
          source: 'provinces',
          paint: { 'fill-color': 'rgba(251,191,36,0.22)' },
          filter: ['==', ['get', 'name'], ''],
        });
      }
    } catch (error) {
      console.warn('provinces layer add failed:', error);
      setProvinceStatus('error');
    }
  };
  useEffect(() => {
    let raf = 0;
    let lastDashAt = 0;
    const tick = (now: number) => {
      const map = mapRef.current;
      if (map && map.isStyleLoaded()) {
        pulseRef.current = (pulseRef.current + 0.014) % 1;
        try {
          if (map.getLayer('pts-live-critical')) {
            const t = pulseRef.current;
            // ضربان: ضخامت و شفافیت حلقه بر پایهٔ فاز سینوسی (بدون تکیه بر ویژگی داده)
            const phase = (1 - Math.cos(t * Math.PI * 2)) / 2;
            map.setPaintProperty('pts-live-critical', 'circle-stroke-width', 1.2 + phase * 2.3);
            map.setPaintProperty('pts-live-critical', 'circle-stroke-opacity', 0.75 - phase * 0.6);
          }
        } catch {
          // نقشه ممکن است در حال تعویض سبک باشد
        }

      // B1: جریان متحرک — جلو بردن توالی dash با نرخ پویا (کنترل پنل: روشن/خاموش + سرعت)
      const interval = flowSpeedRef.current;
      if (flowEnabledRef.current && interval > 0 && now - lastDashAt >= interval) {
        lastDashAt = now;
        flowStepRef.current = (flowStepRef.current + 1) % corridorDashSequence.length;
        try {
          if (map.getLayer('corridor-flow')) {
            map.setPaintProperty('corridor-flow', 'line-dasharray', corridorDashSequence[flowStepRef.current]);
          }
        } catch {
          // در حال تعویض سبک؛ قدم بعدی جبران می‌کند
        }
      }

      // B8: انیمیشن کاروان — نقطه‌های متحرک روی polyline کریدور فعال (هر ~۱۰۰ms آپدیت)
      if (caravanEnabledRef.current && now - lastCaravanPushRef.current >= 100) {
        lastCaravanPushRef.current = now;
        const corridor = corridorPointsRef.current[caravanCorridorRef.current] || corridorPointsRef.current[0];
        if (corridor && corridor.points.length > 1) {
          const line: [number, number][] = corridor.points.map((p) => [p[1], p[0]]);
          caravanPhaseRef.current = (caravanPhaseRef.current + 0.008) % 1;
          const base = caravanPhaseRef.current;
          const features = [0, 1, 2, 3, 4].map((k) => {
            const t = (base + k * 0.14) % 1;
            const [lng, lat] = pointAlongPolyline(line, t);
            return {
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: [lng, lat] as [number, number] },
              properties: { k, label: k === 0 ? corridor.name : '' },
            };
          });
          try {
            if (caravanDataRef.current) {
              caravanDataRef.current.setData({ type: 'FeatureCollection', features } as any);
            }
          } catch {
            // در حال تعویض سبک؛ قدم بعدی جبران می‌کند
          }
        }
      }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const addOverlays = (map: maplibregl.Map, force = false) => {
    if (!force && !map.isStyleLoaded()) return;
    const data = overlayBuilder.current ? overlayBuilder.current() : null;
    if (!data) return;
    // ادغام دادهٔ زندهٔ صف انجام شده است: getCrossingsGeoJSON خودش ویژگی‌های زنده را تزریق می‌کند

    const source = (id: string, payload: any) => {
      const existing = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (existing) existing.setData(payload);
      else map.addSource(id, { type: 'geojson', data: payload });
    };

    source('corridors', data.corridors);
    source('roads', data.roads);
    source('selected-route', data.route);
    source('alt-routes', data.alternatives);
    source('isochrones', data.isochrones);
    source('draft-route', data.draft);
    source('draft-points', data.draftPoints);
    source('search-pins', data.searchPins);
    source('search-links', data.searchLinks);
    source('search-gates', data.searchGates);
    source('crossings', data.crossings);

    // B8: منبع کاروان (خالی؛ در حلقهٔ rAF پر می‌شود) — باید بعد از سبک‌سوییچ هم بازساخته شود
    const caravanSrc = map.getSource('caravan-points') as maplibregl.GeoJSONSource | undefined;
    if (caravanSrc) {
      caravanDataRef.current = caravanSrc;
    } else {
      map.addSource('caravan-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      caravanDataRef.current = map.getSource('caravan-points') as maplibregl.GeoJSONSource;
      if (!map.getLayer('caravan-dot')) {
        map.addLayer({
          id: 'caravan-dot',
          type: 'circle',
          source: 'caravan-points',
          paint: {
            'circle-radius': 4,
            'circle-color': '#fbbf24',
            'circle-stroke-color': 'rgba(251,191,36,0.55)',
            'circle-stroke-width': 3,
            'circle-stroke-opacity': 0.55,
          },
        });
      }
    }

    // G8: لایهٔ دایرهٔ ریسک ترکیبی — بالای pts، زیر برچسب‌ها؛ فقط وقتی toggle روشن است دیده می‌شود
    if (!map.getLayer('pts-risk')) {
      map.addLayer({
        id: 'pts-risk',
        type: 'circle',
        source: 'crossings',
        layout: { visibility: riskLayerOnRef.current ? 'visible' : 'none' },
        paint: {
          'circle-radius': ['+', ['*', ['sqrt', ['max', ['get', 'tr'], 25]], 0.34], 5],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'risk'],
            0, '#2dd4bf',
            45, '#fbbf24',
            70, '#fb7185',
          ],
          'circle-opacity': 0.4,
          'circle-stroke-color': [
            'interpolate',
            ['linear'],
            ['get', 'risk'],
            0, '#2dd4bf',
            45, '#fbbf24',
            70, '#fb7185',
          ],
          'circle-stroke-width': 1.8,
          'circle-stroke-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'pts-risk-hit',
        type: 'circle',
        source: 'crossings',
        layout: { visibility: riskLayerOnRef.current ? 'visible' : 'none' },
        paint: { 'circle-radius': 18, 'circle-color': 'rgba(0,0,0,0)' },
      });
    }

    if (!map.getLayer('corridor-glow')) {
      map.addLayer({
        id: 'corridor-glow',
        type: 'line',
        source: 'corridors',
        filter: ['==', ['get', 'on'], 1],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 8,
          'line-opacity': 0.2,
          'line-blur': 4,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      map.addLayer({
        id: 'corridor-base',
        type: 'line',
        source: 'corridors',
        filter: ['==', ['get', 'on'], 1],
        paint: {
          'line-color': ['get', 'color'],
          // B2: ضخامت متناسب با تردد تجمیعی گیت‌های کریدور
          'line-width': ['coalesce', ['get', 'widthBase'], 2.5],
          'line-opacity': 0.75,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // B1: جریان متحرک روی کریدورها — dashهای کهربایی که با rAF در جهت مسیر جلو می‌روند
      map.addLayer({
        id: 'corridor-flow',
        type: 'line',
        source: 'corridors',
        filter: ['==', ['get', 'on'], 1],
        paint: {
          'line-color': '#fbbf24',
          'line-width': ['interpolate', ['linear'], ['coalesce', ['get', 'widthBase'], 2.5], 2.2, 1.6, 6.5, 3],
          'line-opacity': 0.9,
          'line-dasharray': corridorDashSequence[0],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Internal road network
      map.addLayer({
        id: 'rn-lines',
        type: 'line',
        source: 'roads',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.8,
          'line-opacity': 0.65,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // لایه‌های ایزوکرون دسترسی (۲ تا ۱۲ ساعت)
      map.addLayer({
        id: 'iso-fill',
        type: 'fill',
        source: 'isochrones',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.1,
        },
      });

      map.addLayer({
        id: 'iso-line',
        type: 'line',
        source: 'isochrones',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.1,
          'line-opacity': 0.55,
        },
      });

      // مسیرهای جایگزین محاسبه‌شده (مقایسهٔ همزمان)
      map.addLayer({
        id: 'alt-route-line',
        type: 'line',
        source: 'alt-routes',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': 0.9,
          'line-dasharray': ['case', ['==', ['get', 'dash'], 1], ['literal', [2, 2]], ['literal', [1, 0]]],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // پیش‌نویس ترسیم دستی مسیر
      map.addLayer({
        id: 'draft-route-line',
        type: 'line',
        source: 'draft-route',
        paint: {
          'line-color': '#f472b6',
          'line-width': 3,
          'line-opacity': 0.95,
          'line-dasharray': ['literal', [1.5, 1.5]],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      map.addLayer({
        id: 'draft-point-circles',
        type: 'circle',
        source: 'draft-points',
        paint: {
          'circle-radius': 5,
          'circle-color': '#f472b6',
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 1.5,
        },
      });

      // Selected active route
      map.addLayer({
        id: 'selected-route-glow',
        type: 'line',
        source: 'selected-route',
        paint: {
          'line-color': '#2dd4bf',
          'line-width': 9,
          'line-opacity': 0.35,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      map.addLayer({
        id: 'selected-route-line',
        type: 'line',
        source: 'selected-route',
        paint: {
          'line-color': '#10b981',
          'line-width': 4.5,
          'line-opacity': 0.95,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // Iranian border halo
      map.addLayer({
        id: 'iran-halo',
        type: 'circle',
        source: 'crossings',
        filter: ['==', ['get', 'iran'], 1],
        paint: {
          'circle-radius': ['+', ['*', ['sqrt', ['max', ['get', 'tr'], 25]], 0.42], 8],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#eab308',
          'circle-stroke-width': 1.6,
          'circle-stroke-opacity': 0.9,
        },
      });

      // نشانه‌های نتایج جستجوی مکان‌یابی‌شده + خط اتصال به نزدیک‌ترین گذرگاه مرزی
      // مسیر واقعی جاده‌ای (خط ممتد) وقتی هندسهٔ OSRM در دست است
      map.addLayer({
        id: 'search-road-link',
        type: 'line',
        source: 'search-links',
        filter: ['==', ['get', 'path'], 1],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.2,
          'line-opacity': 0.85,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      // خط مستقیم (تخمینی) تنها برای نشانه‌هایی که مسیر جاده‌ای برایشان محاسبه نشده
      map.addLayer({
        id: 'search-link-line',
        type: 'line',
        source: 'search-links',
        filter: ['!=', ['get', 'path'], 1],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 1.4,
          'line-opacity': 0.6,
          'line-dasharray': ['literal', [2, 2]],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });

      map.addLayer({
        id: 'search-gate-dot',
        type: 'circle',
        source: 'search-gates',
        paint: {
          'circle-radius': 5,
          'circle-color': '#fbbf24',
          'circle-stroke-color': '#0b1220',
          'circle-stroke-width': 1.5,
        },
      });

      map.addLayer({
        id: 'search-pin-halo',
        type: 'circle',
        source: 'search-pins',
        paint: {
          'circle-radius': 16,
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.18,
        },
      });

      map.addLayer({
        id: 'search-pin',
        type: 'circle',
        source: 'search-pins',
        paint: {
          'circle-radius': 7.5,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#0b1220',
          'circle-stroke-width': 2,
        },
      });

      // Points of crossings
      map.addLayer({
        id: 'pts',
        type: 'circle',
        source: 'crossings',
        paint: {
          'circle-radius': ['+', ['*', ['sqrt', ['max', ['get', 'tr'], 25]], 0.42], 3],
          // گیت با دادهٔ زنده: رنگ بر پایهٔ ساعت انتظار؛ بقیه: رنگ نوع گذرگاه
          'circle-color': [
            'case',
            ['==', ['get', 'live'], 1],
            [
              'case',
              ['>=', ['get', 'maxWait'], 200],
              '#fb7185',
              ['>=', ['get', 'maxWait'], 72],
              '#fbbf24',
              ['>=', ['get', 'maxWait'], 12],
              '#2dd4bf',
              '#94a3b8',
            ],
            [
              'match',
              ['get', 'layer'],
              'road',
              '#3b82f6',
              'combined',
              '#a855f7',
              '#64748b',
            ],
          ],
          'circle-opacity': 0.92,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 0.8,
        },
      });

      // هالهٔ تناسبی صف زنده (اندازه = تعداد تریلر در صف گمرک)
      map.addLayer({
        id: 'pts-live-halo',
        type: 'circle',
        source: 'crossings',
        filter: ['==', ['get', 'live'], 1],
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['sqrt', ['max', ['get', 'totalQueue'], 0]],
            0, 6, 30, 22, 80, 38,
          ],
          'circle-color': '#f59e0b',
          'circle-opacity': 0.14,
          'circle-stroke-color': '#f59e0b',
          'circle-stroke-width': 1.2,
          'circle-stroke-opacity': 0.45,
        },
      });

      // حلقهٔ تپندهٔ گیت بحرانی (انتظار ≥ ۲۰۰ ساعت)
      map.addLayer({
        id: 'pts-live-critical',
        type: 'circle',
        source: 'crossings',
        filter: ['all', ['==', ['get', 'live'], 1], ['>=', ['get', 'maxWait'], 200]],
        paint: {
          'circle-radius': ['+', ['*', ['sqrt', ['max', ['get', 'tr'], 25]], 0.42], 6],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': '#fb7185',
          'circle-stroke-width': 1.2,
          'circle-stroke-opacity': 0.75,
        },
      });

      // نقطهٔ شفاف بالای هر گیت: هدف کلیک برای بازکردن popup گیج صف
      map.addLayer({
        id: 'pts-live-hit',
        type: 'circle',
        source: 'crossings',
        filter: ['==', ['get', 'live'], 1],
        paint: { 'circle-radius': 16, 'circle-color': 'rgba(0,0,0,0)' },
      });

      // A4: برچسب زندهٔ شمار تریلر بالای گیت‌های دارای دادهٔ صف Border Park
      map.addLayer({
        id: 'pts-live-counts',
        type: 'symbol',
        source: 'crossings',
        filter: ['all', ['==', ['get', 'live'], 1], ['>', ['get', 'totalQueue'], 0]],
        layout: {
          'symbol-placement': 'point',
          'text-field': [
            'concat',
            ['number-format', ['get', 'totalQueue'], { locale: 'fa-IR', 'min-fraction-digits': 0, 'max-fraction-digits': 0 }],
            ' تریلر',
          ],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 9, 6, 11.5],
          'text-offset': [0, -1.35],
          'text-anchor': 'center',
          'text-letter-spacing': 0.05,
          'text-allow-overlap': false,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#fcd34d',
          'text-halo-color': 'rgba(8,14,26,0.95)',
          'text-halo-width': 1.6,
        },
      });

      // B10: برچسب نام کوتاه کریدورهای بین‌المللی روی خود خط (بالاترین لایه برای خوانایی)
      map.addLayer({
        id: 'corridor-labels',
        type: 'symbol',
        source: 'corridors',
        filter: ['==', ['get', 'on'], 1],
        layout: {
          'symbol-placement': 'line-center',
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 4.5, 11, 6, 13],
          'text-letter-spacing': 0.08,
        },
        paint: {
          'text-color': ['get', 'color'],
          'text-halo-color': 'rgba(8,14,26,0.92)',
          'text-halo-width': 1.6,
        },
      });
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleFor(darkTheme ? 'dark' : 'bright'),
      center: [54, 34],
      zoom: 4.3,
      attributionControl: {
        compact: true,
        customAttribution: 'نقشه پایه منبع‌باز · بدون کلید API',
      },
    });

    map.on('error', (e: any) => {
      const message = e?.error?.message || String(e?.error || e || '');
      const detail = e?.sourceId || e?.url || e?.resource?.url || '';
      console.warn('MapLibre map event:', e?.error || e);

      // خطاهای واقعی نقشه (کاشی، سبک، کارگر) برای بررسی گزارش می‌شوند
      if (/abort/i.test(message) || !message) return;
      reportClientError({
        message: `MapLibre: ${message}`,
        stack: detail ? `resource: ${detail}` : null,
        source: /worker/i.test(message) ? 'maplibre-worker' : 'maplibre',
      });
    });

    /*
     * اندازهٔ ظرف ممکن است پس از ساخت نقشه تغییر کند (چیدمان دیرهنگام، جمع/باز شدن پنل یا
     * تغییر اندازهٔ قاب پیش‌نمایش). MapLibre خودکار تغییر اندازه نمی‌دهد، پس اگر نقشه
     * با اندازهٔ صفر ساخته شود هیچ‌وقت نقشه‌ای نشان داده نمی‌شود.
     */
    const container = mapContainer.current;
    let resizeObserver: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (!mapRef.current) return;
        try {
          mapRef.current.resize();
        } catch (error) {
          console.warn('MapLibre resize failed:', error);
        }
      });
      resizeObserver.observe(container);
    }

    // یک بار پس از چیدمان اولیه هم اندازه هم‌گام می‌شود
    const initialResize = window.setTimeout(() => {
      try {
        map.resize();
      } catch (error) {
        console.warn('MapLibre initial resize failed:', error);
      }
    }, 250);

    // تشخیص یک‌بارهٔ وضعیت نقشه: اگر سبک/کاشی/اندازه درست نشده باشد گزارش می‌شود
    window.setTimeout(() => {
      // فقط نقشهٔ زنده گزارش می‌دهد؛ نمونهٔ دورریخته‌شده (مثلاً در حالت StrictMode) نویز است
      if (mapRef.current !== map) return;
      try {
        const canvas = map.getCanvas();
        const width = canvas?.clientWidth || 0;
        const height = canvas?.clientHeight || 0;
        const styleLoaded = map.isStyleLoaded();
        const layers = map.getStyle()?.layers?.length || 0;
        const problems: string[] = [];

        if (width === 0 || height === 0) problems.push(`canvas ${width}x${height}`);
        // سبک ممکن است منابع در حال بارگذاری داشته باشد؛ نبود لایه نشانهٔ واقعی سبک خالی است
        if (layers === 0) problems.push(`no layers (styleLoaded=${styleLoaded})`);

        // نمای اولیه باید گذرگاه‌های اطلس را قاب گرفته باشد
        const gates = crossingsRef.current || [];
        if (gates.length > 1) {
          const center = map.getCenter();
          const lngs = gates.map((gate) => gate.lng);
          const lats = gates.map((gate) => gate.lat);
          const outsideBounds =
            center.lng < Math.min(...lngs) - 15 ||
            center.lng > Math.max(...lngs) + 15 ||
            center.lat < Math.min(...lats) - 15 ||
            center.lat > Math.max(...lats) + 15;
          if (outsideBounds) {
            problems.push(`camera outside gates (${center.lng.toFixed(1)}, ${center.lat.toFixed(1)})`);
          }
        }

        // لایهٔ فعال باید واقعاً روی نقشه ساخته شده باشد
        overlayState.current.forEach((id) => {
          const hasRaster = Boolean(map.getLayer(`ovl-${id}`));
          const hasVector = Boolean(map.getLayer(`ovl-${id}-vector`));
          if (!hasRaster && !hasVector) problems.push(`overlay ${id} missing`);
        });

        // پدینگ دوربین باید با عرض پنل کناری هم‌گام باشد
        const expectedPadding = cameraPadding(panelOffsetRef.current).right;
        const actualPadding = map.getPadding().right || 0;
        if (Math.abs(expectedPadding - actualPadding) > 2) {
          problems.push(`panel padding ${actualPadding} ≠ ${expectedPadding}`);
        }

        if (problems.length > 0) {
          problems.push(`lastCamera=${(map as any).__cameraLog || 'none'}`);
          problems.push(
            `center=${(map.getCenter().toArray() as number[]).map((n) => Math.round(n * 100) / 100).join(',')} zoom=${Math.round(map.getZoom() * 100) / 100} padding=${JSON.stringify(map.getPadding())}`
          );

          // آزمون کارگر نقشه: اگر کارگر پاسخ ندهد سبک هرگز بارگذاری نمی‌شود
          try {
            const probe = new Worker(maplibreglWorkerUrl, { type: 'module' });
            probe.onerror = (event: any) =>
              reportClientError({
                message: 'worker probe error',
                stack: String(event?.message || event?.type || 'unknown'),
                source: 'reachability',
              });
            probe.onmessage = () => {
              reportClientError({ message: 'worker probe ok', stack: maplibreglWorkerUrl, source: 'reachability' });
              probe.terminate();
            };
            probe.postMessage({ type: 'getWorkerUrl' });
            window.setTimeout(() => probe.terminate(), 3000);
          } catch (error: any) {
            reportClientError({
              message: 'worker probe threw',
              stack: `${error?.name}: ${error?.message}`,
              source: 'reachability',
            });
          }

          // آزمون دسترسی مرورگر به منبع بیرونی سبک نقشه (CORS/شبکه)
          const styleUrl = typeof styleFor(basemap) === 'string' ? (styleFor(basemap) as string) : '';
          fetch(styleUrl, { method: 'GET', signal: AbortSignal.timeout(4000) })
            .then((res) =>
              reportClientError({
                message: `reachability: style fetch ${res.status}`,
                stack: `url=${styleUrl} ok=${res.ok} workerUrl=${maplibreglWorkerUrl}`,
                source: 'reachability',
              })
            )
            .catch((error) =>
              reportClientError({
                message: `reachability: style fetch failed`,
                stack: `url=${styleUrl} error=${error?.name}: ${error?.message}`,
                source: 'reachability',
              })
            );

          // زنجیرهٔ والدها: کدام عنصر ارتفاع صفر دارد
          const chain: string[] = [];
          let node: HTMLElement | null = mapContainer.current;
          for (let i = 0; i < 6 && node; i += 1) {
            chain.push(
              `${node.tagName.toLowerCase()}.${(node.className || '').toString().slice(0, 48)} = ${node.clientWidth}x${node.clientHeight} (scroll ${node.scrollHeight}, display ${getComputedStyle(node).display}, pos ${getComputedStyle(node).position})`
            );
            node = node.parentElement;
          }

          reportClientError({
            message: `MapLibre diagnostics: ${problems.join(', ')}`,
            stack: [
              `container=${mapContainer.current?.clientWidth}x${mapContainer.current?.clientHeight}`,
              `window=${window.innerWidth}x${window.innerHeight}`,
              `body=${document.body.clientWidth}x${document.body.clientHeight}`,
              `html=${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
              `zoom=${map.getZoom()} layers=${layers}`,
              'ancestors:',
              ...chain,
            ].join('\n'),
            source: 'maplibre-diagnostics',
          });
        }
      } catch (error) {
        reportClientError({ message: `MapLibre diagnostics failed: ${String(error)}`, source: 'maplibre-diagnostics' });
      }
    }, 10000);

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // پدینگ اولیه: از همان لحظهٔ ساخت، فضای پنل کناری در نظر گرفته می‌شود
    try {
      map.setPadding(cameraPadding(panelOffsetRef.current));
    } catch (error) {
      console.warn('MapLibre initial padding failed:', error);
    }

    // `setStyle` wipes custom sources/layers, so re-add them whenever a style finishes loading
    // ابتدا لایه‌های تحلیلی (زیر داده‌ها) و سپس لایه‌های داده
    map.on('style.load', () => {
      try {
        applyRasterOverlays(map, true);
        addOverlays(map, true);

        // نمای اولیه: قاب‌بندی گذرگاه‌های اطلس با در نظر گرفتن عرض پنل کناری
        // پرچم روی خود نمونهٔ نقشه گذاشته می‌شود تا هر نقشهٔ تازه (از جمله در حالت StrictMode) یک بار فیت شود
        const fitted = map as maplibregl.Map & { __atlasFitted?: boolean };
        if (!fitted.__atlasFitted) {
          fitted.__atlasFitted = true;
          const gates = crossingsRef.current || [];
          if (gates.length > 1) {
            const lngs = gates.map((gate) => gate.lng);
            const lats = gates.map((gate) => gate.lat);
            const bounds = new maplibregl.LngLatBounds(
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)]
            );
            (map as any).__cameraLog = `initial-fit bounds=${JSON.stringify(bounds.toArray())} gates=${gates.length}`;
            // پدینگ اینجا دوباره داده نمی‌شود: خود دوربین نقشه از قبل با عرض پنل هم‌گام است
            // و تکرار آن باعث محاسبهٔ دوباره و زوم اشتباه می‌شود.
            map.fitBounds(bounds, { duration: 0, maxZoom: 6.2 });
          }
        }
      } catch (error) {
        // نقص یک لایه نباید بارگذاری کل اطلس را متوقف کند
        console.warn('MapLibre style setup failed:', error);
      }
    });

    // Popup on hover
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    const livePopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '260px' });
    // پاپ‌آپ‌های کریدور (B2/A4) و استان (C4)
    const corridorHoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    const corridorPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '300px' });
    const provincePopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 6 });

    map.on('mousemove', 'pts', (e) => {
      if (!e.features || !e.features[0]) return;
      const p: any = e.features[0].properties;
      map.getCanvas().style.cursor = 'pointer';
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-right p-1 font-['Vazirmatn']">
            <div class="font-bold text-sm text-amber-400">${p.name} ${p.name_en ? `<span class="text-xs text-gray-400">(${p.name_en})</span>` : ''}</div>
            <div class="text-xs text-gray-300 mt-1">${p.country} · ${p.type}</div>
            ${p.tr > 0 ? `<div class="text-[11px] text-emerald-400 mt-0.5">ظرفیت: ≈ ${Number(p.tr).toLocaleString('fa-IR')} کامیون/روز</div>` : ''}
            ${p.status ? `<div class="text-[10px] text-gray-400">وضعیت: ${p.status}</div>` : ''}
          </div>`
        )
        .addTo(map);
    });

    map.on('mouseleave', 'pts', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    /* ------------------------------------------------------------------ *
     * صف زندهٔ گمرک: گیج SVG در popup هر گیت دارای دادهٔ Border Park
     * ------------------------------------------------------------------ */
    const fmtFa = (n: number) => Number(n || 0).toLocaleString('fa-IR');
    const waitTone = (h: number) => (h >= 200 ? '#fb7185' : h >= 72 ? '#fbbf24' : h >= 12 ? '#2dd4bf' : '#94a3b8');
    const gaugeSvg = (h: number) => {
      const pct = Math.max(0.02, Math.min(1, h / 480));
      const R = 34;
      const cx = 40;
      const cy = 40;
      const arc = (p: number) => {
        const a = Math.PI * (1 - p);
        return `M ${cx - R} ${cy} A ${R} ${R} 0 ${p > 0.5 ? 1 : 0} 1 ${cx + R * Math.cos(a)} ${cy - R * Math.sin(a)}`;
      };
      const color = waitTone(h);
      return `
        <svg width="80" height="46" viewBox="0 0 80 46" style="display:block;margin:0 auto">
          <path d="M 6 40 A 34 34 0 0 1 74 40" fill="none" stroke="#334155" stroke-width="8" stroke-linecap="round"/>
          <path d="${arc(pct)}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/>
          <text x="40" y="38" text-anchor="middle" fill="${color}" font-size="13" font-weight="bold">${fmtFa(Math.round(h))}</text>
          <text x="40" y="46" text-anchor="middle" fill="#94a3b8" font-size="6">ساعت انتظار</text>
        </svg>`;
    };

    const openLivePopup = (e: any) => {
      const p: any = e.features?.[0]?.properties;
      if (!p || p.live !== 1) return;
      const snap = (liveGatesRef.current || []).find((g) => g.gateId === p.id);
      const queueRows = (snap?.queues || [])
        .filter((q) => q.total > 0 || q.called > 0 || q.waitHours > 0)
        .slice(0, 4)
        .map(
          (q) =>
            `<tr><td style="padding:1px 4px">${q.queueTitle}</td><td style="padding:1px 4px;text-align:center;color:#fbbf24;font-weight:700">${fmtFa(q.total)}</td><td style="padding:1px 4px;text-align:center;${q.waitHours >= 200 ? 'color:#fb7185' : q.waitHours >= 72 ? 'color:#fbbf24' : 'color:#2dd4bf'}">${fmtFa(q.waitHours)}</td></tr>`
        )
        .join('');
      livePopup
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="text-right font-['Vazirmatn']" style="min-width:200px">
            <div class="font-bold text-sm text-amber-400">${p.name} ${p.name_en ? `<span class="text-xs text-gray-400">(${p.name_en})</span>` : ''}</div>
            <div class="text-[10px] text-gray-400 mt-0.5">${p.country} · ${p.type} · وضعیت صف زنده</div>
            ${gaugeSvg(p.maxWait)}
            <div class="flex justify-between text-[11px] mt-1 px-1">
              <span class="text-amber-300 font-bold">${fmtFa(p.totalQueue)} تریلی در صف</span>
              <span class="text-slate-400 text-[9px]">${p.updated ? `بهروزرسانی: ${p.updated}` : 'سامانهٔ نوبتدهی رسمی'}</span>
            </div>
            ${queueRows ? `<table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:9px;color:#cbd5e1"><thead><tr style="color:#64748b"><th style="text-align:right;padding:1px 4px">صف</th><th>کل</th><th>انتظار</th></tr></thead><tbody>${queueRows}</tbody></table>` : ''}
          </div>`)
        .addTo(map);
    };

    map.on('click', 'pts-live-hit', openLivePopup);
    map.on('mouseenter', 'pts-live-hit', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'pts-live-hit', () => {
      map.getCanvas().style.cursor = '';
      livePopup.remove();
    });

    map.on('click', 'pts', (e) => {
      if (!e.features || !e.features[0]) return;
      const id = e.features[0].properties.id;
      const crossing = crossings.find((c) => c.id === id);
      if (crossing) {
        onSelectCrossing(crossing);
      }
    });

    // نشانه‌های نتایج جستجو: راهنما روی نگه‌داشتن و باز کردن منبع با کلیک
    const pinPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14 });

    map.on('mousemove', 'search-pin', (e) => {
      if (!e.features || !e.features[0]) return;
      const p: any = e.features[0].properties;
      map.getCanvas().style.cursor = 'pointer';
      pinPopup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-right p-1 font-['Vazirmatn']">
            <div class="font-bold text-xs text-amber-400">${p.label}</div>
            <div class="text-[11px] text-gray-200 mt-0.5 leading-relaxed">${p.title || ''}</div>
            <div class="text-[10px] text-gray-400 mt-1" dir="ltr">${p.source || ''}</div>
            ${p.gate ? `<div class="text-[10px] text-teal-300 mt-1">نزدیک‌ترین گذرگاه مرزی: ${p.gate} — ${p.km} کیلومتر (${p.road ? 'فاصلهٔ جاده‌ای' : 'فاصلهٔ هوایی'})</div>` : ''}
            <div class="text-[10px] text-teal-300 mt-1">برای بازکردن منبع کلیک کنید</div>
          </div>`
        )
        .addTo(map);
    });

    map.on('mouseleave', 'search-pin', () => {
      map.getCanvas().style.cursor = '';
      pinPopup.remove();
    });

    // نشانگر گذرگاه متصل: نام گذرگاه و فاصله تا نشانهٔ جستجو
    map.on('mousemove', 'search-gate-dot', (e) => {
      if (!e.features || !e.features[0]) return;
      const p: any = e.features[0].properties;
      map.getCanvas().style.cursor = 'pointer';
      pinPopup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-right p-1 font-['Vazirmatn']">
            <div class="font-bold text-xs text-amber-400">گذرگاه مرزی ${p.name}</div>
            <div class="text-[10px] text-teal-300 mt-1">${p.km} کیلومتر (${p.road ? 'جاده‌ای' : 'هوایی'}) تا نشانهٔ متصل${
              p.minutes ? ` — حدود ${p.minutes} دقیقه` : ''
            }</div>
          </div>`
        )
        .addTo(map);
    });

    map.on('mouseleave', 'search-gate-dot', () => {
      map.getCanvas().style.cursor = '';
      pinPopup.remove();
    });

    map.on('click', 'search-pin', (e) => {
      if (!e.features || !e.features[0]) return;
      const id = e.features[0].properties.id;
      const pin = (interaction.current.searchPins || []).find((item) => item.id === id);
      if (!pin) return;
      if (interaction.current.onOpenSearchResult) interaction.current.onOpenSearchResult(pin);
      else window.open(pin.url, '_blank', 'noopener,noreferrer');
    });

    /* ------------------------------------------------------------------ *
     * B2 hover + پاپ‌آپ اطلاعات کریدور (کلیک روی خط): گیت‌ها، تردد تجمیعی، هوا
     * ------------------------------------------------------------------ */
    map.on('mouseenter', 'corridor-base', () => {
      map.getCanvas().style.cursor = 'pointer';
      try {
        if (map.getLayer('corridor-base')) {
          map.setPaintProperty('corridor-base', 'line-opacity', 0.95);
        }
      } catch { /* تعویض سبک */ }
    });

    map.on('mouseleave', 'corridor-base', () => {
      map.getCanvas().style.cursor = '';
      try {
        if (map.getLayer('corridor-base')) {
          map.setPaintProperty('corridor-base', 'line-opacity', 0.75);
        }
      } catch { /* تعویض سبک */ }
      corridorHoverPopup.remove();
    });

    map.on('mousemove', 'corridor-base', (e) => {
      if (!e.features || !e.features[0]) return;
      const p: any = e.features[0].properties;
      corridorHoverPopup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-right p-1 font-['Vazirmatn']">
            <div class="font-bold text-xs" style="color:${p.color}">${p.label}</div>
            <div class="text-[10px] text-gray-300 mt-0.5">تردد تجمیعی گیت‌های مسیر: ≈ ${Number(p.traffic || 0).toLocaleString('fa-IR')} کامیون/روز</div>
            <div class="text-[9px] text-teal-300 mt-1">برای جزئیات، گیت‌ها و هوا کلیک کنید</div>
          </div>`
        )
        .addTo(map);
    });

    map.on('click', 'corridor-base', (e) => {
      if (!e.features || !e.features[0]) return;
      const p: any = e.features[0].properties;
      const idx = Number(p.i);
      const corridor = corridorPointsRef.current[idx] || null;
      const corridorName = corridor?.name || p.label;

      // گیت‌های نزدیک به دو سر کریدور (همان منطق تجمیع B2)
      const gateRows: string[] = [];
      if (corridor && corridor.points.length) {
        const first = corridor.points[0];
        const last = corridor.points[corridor.points.length - 1];
        crossingsRef.current
          .map((gate) => ({
            gate,
            dist: Math.min(
              calculateDistanceRaw(first[0], first[1], gate.lat, gate.lng),
              calculateDistanceRaw(last[0], last[1], gate.lat, gate.lng)
            ),
          }))
          .filter((item) => item.dist <= B2_GATE_TOLERANCE_KM)
          .sort((a, b) => (b.gate.trucks_est || 0) - (a.gate.trucks_est || 0))
          .slice(0, 5)
          .forEach(({ gate }) => {
            gateRows.push(
              `<tr><td style="padding:1px 4px">${gate.name}</td><td style="padding:1px 4px;text-align:center">${gate.country}</td><td style="padding:1px 4px;text-align:center;color:#fbbf24;font-weight:700">${Number(gate.trucks_est || 0).toLocaleString('fa-IR')}</td></tr>`
            );
          });
      }

      // هوا: میانگین مختصات کریدور به‌عنوان نمایندهٔ مسیر
      let weatherHtml = '<div class="text-[10px] text-slate-500 mt-1">وضعیت هوا در حال دریافت…</div>';
      if (corridor && corridor.points.length) {
        const mid = corridor.points[Math.floor(corridor.points.length / 2)];
        fetch(`/api/weather?lat=${mid[0].toFixed(3)}&lng=${mid[1].toFixed(3)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((w) => {
            const box = document.getElementById('corridor-weather-box');
            if (!box) return;
            if (!w || typeof w.temperatureC !== 'number') {
              box.innerHTML = '<div class="text-[10px] text-rose-300 mt-1">دریافت وضعیت هوا ممکن نشد.</div>';
              return;
            }
            box.innerHTML =
              `<div class="text-[10px] text-sky-300 mt-1">هوا در میانهٔ مسیر: ${Number(w.temperatureC).toLocaleString('fa-IR')}°C · ${w.conditionFa}` +
              (typeof w.windSpeedKmh === 'number' ? ` · باد ${Number(w.windSpeedKmh).toLocaleString('fa-IR')} km/h` : '') +
              (typeof w.precipitationMm === 'number' && w.precipitationMm > 0 ? ` · بارش ${Number(w.precipitationMm).toLocaleString('fa-IR')} mm` : '') +
              '</div>';
          })
          .catch(() => {
            const box = document.getElementById('corridor-weather-box');
            if (box) box.innerHTML = '<div class="text-[10px] text-rose-300 mt-1">دریافت وضعیت هوا ممکن نشد.</div>';
          });
      }

      corridorPopup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-right font-['Vazirmatn']" style="min-width:230px">
            <div class="font-bold text-sm" style="color:${p.color}">${corridorName}</div>
            <div class="text-[10px] text-gray-300 mt-0.5">تردد تجمیعی: ≈ ${Number(p.traffic || 0).toLocaleString('fa-IR')} کامیون/روز · ${gateRows.length ? `${gateRows.length} گیت اصلی` : 'گیت ثبت‌شده در حاشیهٔ نقشه'}</div>
            ${gateRows.length ? `<table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:10px;color:#cbd5e1"><thead><tr style="color:#64748b"><th style="text-align:right;padding:1px 4px">گذرگاه</th><th>کشور</th><th>کامیون/روز</th></tr></thead><tbody>${gateRows.join('')}</tbody></table>` : ''}
            <div id="corridor-weather-box">${weatherHtml}</div>
          </div>`
        )
        .addTo(map);
    });

    // C4 hover استان: هایلایت + نام استان در popup سبک
    map.on('mousemove', 'province-fill', (e) => {
      if (!e.features || !e.features[0]) return;
      const name = String(e.features[0].properties?.name || '');
      map.getCanvas().style.cursor = 'default';
      try {
        if (map.getLayer('province-hover')) map.setFilter('province-hover', ['==', ['get', 'name'], name]);
      } catch { /* تعویض سبک */ }
      provincePopup.setLngLat(e.lngLat).setHTML(
        `<div class="text-right font-['Vazirmatn']"><div class="font-bold text-xs text-teal-300">${name}</div></div>`
      ).addTo(map);
    });

    map.on('mouseleave', 'province-fill', () => {
      map.getCanvas().style.cursor = '';
      try {
        if (map.getLayer('province-hover')) map.setFilter('province-hover', ['==', ['get', 'name'], '']);
      } catch { /* تعویض سبک */ }
      provincePopup.remove();
    });

    /* ------------------------------------------------------------------ *
     * G8 hover/click: تفکیک عوامل ریسک (صف/ناهنجاری/اطمینان/تردد) در tooltip
     * ------------------------------------------------------------------ */
    const riskPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    const riskBar = (v: number, max: number, color: string) => {
      const pct = Math.max(0, Math.min(100, (v / max) * 100));
      return `<div style="height:4px;border-radius:2px;background:#1e293b;margin-top:2px"><div style="height:4px;border-radius:2px;width:${pct}%;background:${color}"></div></div>`;
    };
    const fa = (n: number) => Math.round(n).toLocaleString('fa-IR');
    map.on('mousemove', 'pts-risk-hit', (e) => {
      if (!e.features || !e.features[0]) return;
      const p: any = e.features[0].properties;
      map.getCanvas().style.cursor = 'pointer';
      const tone = p.risk >= 70 ? '#fb7185' : p.risk >= 45 ? '#fbbf24' : '#2dd4bf';
      riskPopup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-right font-['Vazirmatn']" style="min-width:200px">
            <div class="flex items-center justify-between">
              <span class="font-bold text-xs" style="color:${tone}">ریسک ${fa(p.risk)}/۱۰۰</span>
              <span class="font-bold text-xs text-amber-400">${p.name}</span>
            </div>
            <div style="margin-top:4px;font-size:9px;color:#94a3b8">
              <div>صف زندهٔ گمرک (تا ۴۰): ${fa(p.riskQ)}</div>${riskBar(p.riskQ, 40, '#f59e0b')}
              <div>ناهنجاری جریان (تا ۲۵): ${fa(p.riskA)}</div>${riskBar(p.riskA, 25, '#fb7185')}
              <div>اطمینان دادهٔ اطلس (تا ۲۰): ${fa(p.riskC)}</div>${riskBar(p.riskC, 20, '#38bdf8')}
              <div>فشار تردد (تا ۱۵): ${fa(p.riskT)}</div>${riskBar(p.riskT, 15, '#a78bfa')}
            </div>
            <div class="text-[9px] text-teal-300 mt-1">برای انتخاب گیت کلیک کنید</div>
          </div>`
        )
        .addTo(map);
    });
    map.on('mouseleave', 'pts-risk-hit', () => {
      map.getCanvas().style.cursor = '';
      riskPopup.remove();
    });
    map.on('click', 'pts-risk-hit', (e) => {
      if (!e.features || !e.features[0]) return;
      const id = e.features[0].properties.id;
      const crossing = crossingsRef.current.find((c) => c.id === id);
      if (crossing) onSelectCrossing(crossing);
    });

    map.on('click', (e) => {
      const current = interaction.current;

      if (current.drawMode && current.onMapClick) {
        current.onMapClick(e.lngLat.lat, e.lngLat.lng);
        return;
      }

      if (current.pickMode && current.onPickLocation) {
        // Find closest crossing within 35km
        let closest: Crossing | null = null;
        let minDist = 35;
        for (const c of crossingsRef.current) {
          const dist = calculateDistance(e.lngLat.lat, e.lngLat.lng, c.lat, c.lng);
          if (dist < minDist) {
            minDist = dist;
            closest = c;
          }
        }

        if (closest) {
          const gate: Crossing = closest;
          current.onPickLocation(gate.lat, gate.lng, gate.name);
        } else {
          current.onPickLocation(e.lngLat.lat, e.lngLat.lng);
        }
      }
    });

    mapRef.current = map;
    // F12: دسترسی مینی‌نقشهٔ Canvas به نمونهٔ نقشهٔ اصلی (بدون سیم‌کشی prop جدید)
    (window as any).__atlasMapRef = mapRef;

    return () => {
      window.clearTimeout(initialResize);
      resizeObserver?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // دوربین نقشه با عرض پنل کناری هم‌گام می‌شود (جمع/باز شدن پنل یا تغییر اندازهٔ پنجره)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setPadding(cameraPadding(panelOffset));
    } catch (error) {
      console.warn('MapLibre padding update failed:', error);
    }
  }, [panelOffset]);

  // Keep the basemap in sync with the light/dark theme (unless the user pinned the OSM raster)
  useEffect(() => {
    setBasemap((prev) => (prev === 'osm' ? prev : darkTheme ? 'dark' : 'bright'));
  }, [darkTheme]);

  // Swap basemap style
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (skipInitialStyle.current) {
      skipInitialStyle.current = false;
      return;
    }
    map.setStyle(styleFor(basemap), { diff: false });
  }, [basemap]);

  // افزودن/حذف لایه‌های تحلیلی روی نقشه
  useEffect(() => {
    const map = mapRef.current;
    // پیش از آماده‌شدن استایل هیچ تغییری اعمال نمی‌شود؛ هندلر style.load جایگزین آن است
    if (!map || !map.isStyleLoaded()) return;
    try {
      applyRasterOverlays(map);
    } catch (error) {
      // خطای نقشه هرگز نباید کل رابط کاربری را از کار بیندازد
      console.warn('MapLibre overlay update failed:', error);
    }
  }, [activeOverlays]);

  // Update crossing data — ویژگی‌های زندهٔ صف در خود getCrossingsGeoJSON تزریق می‌شوند
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('crossings') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(getCrossingsGeoJSON() as any);
    }
  }, [filteredCrossings, liveGates]);

  // G8: پس از رسیدن anomalies از سرور، دادهٔ crossings یک‌بار نوسازی می‌شود تا نمرهٔ ریسک تزریق شود
  useEffect(() => {
    if (!riskReady || !mapRef.current) return;
    const source = mapRef.current.getSource('crossings') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(getCrossingsGeoJSON() as any);
  }, [riskReady]);

  // Update corridors
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('corridors') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(getCorridorsGeoJSON() as any);
    }
  }, [activeCorridors]);

  // Update alternative/planned routes
  useEffect(() => {
    const source = mapRef.current?.getSource('alt-routes') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(getAlternativeRoutesGeoJSON() as any);
  }, [routeOverlays]);

  // Update isochrone layers
  useEffect(() => {
    const source = mapRef.current?.getSource('isochrones') as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(getIsochronesGeoJSON() as any);
  }, [isochroneOverlays]);

  // Update manual draft path
  useEffect(() => {
    const line = mapRef.current?.getSource('draft-route') as maplibregl.GeoJSONSource | undefined;
    if (line) line.setData(getDraftGeoJSON() as any);
    const points = mapRef.current?.getSource('draft-points') as maplibregl.GeoJSONSource | undefined;
    if (points) points.setData(getDraftPointsGeoJSON() as any);
  }, [draftPath]);

  // به‌روزرسانی نشانه‌های نتایج جستجو و خطوط اتصال به گذرگاه‌ها
  useEffect(() => {
    const pins = mapRef.current?.getSource('search-pins') as maplibregl.GeoJSONSource | undefined;
    if (pins) pins.setData(getSearchPinsGeoJSON() as any);
    const links = mapRef.current?.getSource('search-links') as maplibregl.GeoJSONSource | undefined;
    if (links) links.setData(getSearchLinksGeoJSON() as any);
    const gates = mapRef.current?.getSource('search-gates') as maplibregl.GeoJSONSource | undefined;
    if (gates) gates.setData(getSearchGatesGeoJSON() as any);
  }, [searchPins]);

  // تمرکز نقشه روی نقطه انتخاب‌شده (نتیجهٔ جستجو، مکان استخراج‌شده و …)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) return;
    (map as any).__cameraLog = `focus-flyTo to=${focusTarget.lng},${focusTarget.lat} zoom=${focusTarget.zoom ?? 'max'}`;
    map.flyTo({
      center: [focusTarget.lng, focusTarget.lat],
      zoom: focusTarget.zoom ?? Math.max(map.getZoom(), 8),
      duration: 1200,
    });
  }, [focusTarget?.seq]);

  // Crosshair cursor while drawing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = drawMode ? 'crosshair' : '';
  }, [drawMode]);

  // Update selected route
  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource('selected-route') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(getSelectedRouteGeoJSON() as any);
    }

    if (selectedRoutePath && selectedRoutePath.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      selectedRoutePath.forEach((pt) => bounds.extend(pt));
      (mapRef.current as any).__cameraLog = `route-fit bounds=${JSON.stringify(bounds.toArray())}`;
      mapRef.current.fitBounds(bounds, { padding: 90, duration: 900 });
    }
  }, [selectedRoutePath]);

  // Highlight specific gate
  useEffect(() => {
    if (!mapRef.current || highlightedGateId == null) return;
    const crossing = crossings.find((c) => c.id === highlightedGateId);
    if (crossing) {
      (mapRef.current as any).__cameraLog = `gate-flyTo to=${crossing.lng},${crossing.lat} (${crossing.name})`;
      mapRef.current.flyTo({
        center: [crossing.lng, crossing.lat],
        zoom: Math.max(mapRef.current.getZoom(), 7),
        duration: 1000,
      });
    }
  }, [highlightedGateId]);

  return (
    <div className="relative w-full h-full">
      {/*
        ظرف نقشه عمداً در جریان عادی و با اندازهٔ درون‌خطی تنظیم شده است:
        MapLibre کلاس maplibregl-map را با position: relative روی همین عنصر می‌گذارد و در Tailwind 4
        این قاعدهٔ بدون لایه بر یوتیلیتی absolute (که داخل @layer است) غلبه می‌کند؛ در نتیجهٔ آن
        inset-0 بی‌اثر می‌شد و ارتفاع ظرف صفر می‌ماند و نقشه دیده نمی‌شد.
      */}
      <div
        ref={mapContainer}
        className="w-full h-full"
        style={{ position: 'relative', width: '100%', height: '100%' }}
      />

      {/* Basemap switcher — همه گزینه‌ها رایگان و منبع‌باز هستند (کارت شیشه‌ای روشن) */}
      <div className="absolute top-3 left-3 z-10 w-[188px] flex flex-col gap-1.5 bg-slate-950/92 backdrop-blur-md border border-slate-800 rounded-xl p-2 shadow-lg">
        <span className="text-[9px] font-bold text-slate-400 text-center">نقشه پایه حرفه‌ای منبع‌باز</span>
        <div className="grid grid-cols-2 gap-1">
          {BASEMAPS.map((b) => (
            <button
              key={b.id}
              onClick={() => setBasemap(b.id)}
              title={b.hint}
              className={`px-1.5 py-1 rounded-lg text-[10px] font-bold transition-all truncate ${
                basemap === b.id
                  ? 'btn-cmd-green shadow'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <span className="text-[9px] font-bold text-slate-400 text-center border-t border-slate-800 pt-1.5">
          لایه‌های تحلیلی
        </span>
        <div className="grid grid-cols-3 gap-1">
          {MAP_OVERLAYS.map((overlay) => {
            const isActive = activeOverlays.includes(overlay.id);
            return (
              <button
                key={overlay.id}
                onClick={() =>
                  setActiveOverlays((prev) =>
                    prev.includes(overlay.id) ? prev.filter((id) => id !== overlay.id) : [...prev, overlay.id]
                  )
                }
                title={overlay.hint}
                className={`px-1 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
                  isActive ? 'tab-active-green' : 'text-slate-400 hover:bg-slate-800 border border-transparent'
                }`}
              >
                {overlay.label}
              </button>
            );
          })}
        </div>

        <span className="text-[9px] font-bold text-slate-400 text-center border-t border-slate-800 pt-1.5">
          تحلیل جریان و سرزمین
        </span>
        {/* کنترل انیمیشن جریان کریدورها (B1+) */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFlowEnabled((prev) => !prev)}
            title="روشن/خاموش کردن جریان متحرک کریدورها"
            className={`flex-1 px-1.5 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
              flowEnabled
                ? 'tab-active-green'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
          >
            جریان: {flowEnabled ? 'روشن' : 'خاموش'}
          </button>
          <button
            onClick={() => setFlowSpeed((prev) => (prev >= 2 ? 0.5 : Math.round((prev + 0.5) * 10) / 10))}
            title="سرعت انیمیشن جریان (۰٫۵× آهسته تا ۲× تند)"
            className="px-1.5 py-1 rounded-lg text-[9px] font-bold text-[var(--cmd-green)] bg-[var(--cmd-green-soft)] border border-[var(--cmd-green-ring)] hover:brightness-95 transition-all"
          >
            {String(flowSpeed).replace('.', '٫')}×
          </button>
        </div>
        {/* C4 کوروپلت استان‌ها + A6 ستون‌های سه‌بعدی صف + H3 کانون فشار + قوس‌های OD */}        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={toggleProvinces}
            title="کوروپلت استان‌های ایران (geoBoundaries، بارگذاری لَزی)"
            className={`px-1 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
              showProvinces
                ? 'tab-active-green'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
          >
            {provinceStatus === 'loading' ? 'استان‌ها…' : 'استان‌ها'}
          </button>
          <button
            onClick={() => void toggleQueueColumns()}
            title="ستون‌های سه‌بعدی صف گمرک (deck.gl، بارگذاری لَزی)"
            className={`px-1 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
              showQueueColumns
                ? 'bg-[var(--tone-rose)]/15 text-[var(--tone-rose)] border border-[var(--tone-rose)]/40'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
          >
            صف سه‌بعدی
          </button>
          <button
            onClick={toggleH3Pressure}
            title="کانون‌های فشار در سلول‌های شش‌ضلعی H3 (toll صف+تردد، تجمیع res4)"
            className={`px-1 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
              h3PressureOn
                ? 'tab-active-green'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
          >
            فشار H3
          </button>
          <button
            onClick={toggleOdFlows}
            title="قوس‌های جریان OD بین گیت‌های سر و ته کریدورهای فعال (سبز=مبدأ، سرخ=مقصد)"
            className={`px-1 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
              odFlowsOn
                ? 'tab-active-green'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
          >
            جریان OD
          </button>
        </div>
        {showQueueColumns && (
          <p className="text-[8px] text-slate-500 text-center leading-relaxed">
            ارتفاع ستون = تعداد تریلر در صف · رنگ = ساعت انتظار · چرخش: Ctrl+کشیدن
          </p>
        )}
        {h3PressureOn && (
          <p className="text-[8px] text-slate-500 text-center leading-relaxed">
            ارتفاع و رنگ سلول = فشار تجمیعی (تردد پایه + صف زندهٔ گیت‌های داخل سلول H3)
          </p>
        )}
        {odFlowsOn && (
          <p className="text-[8px] text-slate-500 text-center leading-relaxed">
            ضخامت قوس = تردد تجمعی کریدور · برای دیدن حجم، قوس را hover کنید
          </p>
        )}

        {/* ریسک ترکیبی G8 + انیمیشن کاروان B8 */}
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={toggleRiskLayer}
            title="ماتریس ریسک چندلایه: صف، ناهنجاری، اطمینان و تردد در رنگ هر گیت (hover: تفکیک عوامل)"
            className={`px-1 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
              riskLayerOn
                ? 'bg-[var(--tone-rose)]/15 text-[var(--tone-rose)] border border-[var(--tone-rose)]/40'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
          >
            ریسک ترکیبی
          </button>
          <button
            onClick={toggleCaravan}
            title="انیمیشن کاروان کامیون‌ها روی اولین کریدور فعال"
            className={`px-1 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
              caravanEnabled
                ? 'tab-active-green'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
          >
            کاروان
          </button>
        </div>

        {/* تجربهٔ سینماتیک: کرهٔ زمین (H2)، تور کریدور (H4)، روایت (H5) */}
        <span className="text-[9px] font-bold text-slate-400 text-center border-t border-slate-800 pt-1.5">
          تجربهٔ سینماتیک
        </span>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => setGlobeMode((prev) => !prev)}
            title="نمای کرهٔ زمین (MapLibre globe projection)"
            className={`px-1 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
              globeMode
                ? 'bg-[var(--tone-sky)]/15 text-[var(--tone-sky)] border border-[var(--tone-sky)]/40'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
          >
            کره
          </button>
          <button
            onClick={() => (tourPlaying ? stopTour() : startTour(0))}
            title="تور پروازی در طول کریدور (از غرب آغاز می‌شود)"
            className={`px-1 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
              tourPlaying
                ? 'bg-[var(--tone-violet)]/15 text-[var(--tone-violet)] border border-[var(--tone-violet)]/40 animate-pulse'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
          >
            {tourPlaying ? 'توقف تور' : 'تور کریدور'}
          </button>
          <button
            onClick={() => (storyIdx != null ? stopStory() : startStory())}
            title="روایت خودکار اطلس: پنج صحنهٔ آماده با دوربین سینمایی"
            className={`px-1 py-1 rounded-lg text-[9px] font-bold transition-all truncate ${
              storyIdx != null
                ? 'bg-[var(--tone-amber)]/15 text-[var(--tone-amber)] border border-[var(--tone-amber)]/40 animate-pulse'
                : 'text-slate-400 hover:bg-slate-800 border border-transparent'
            }`}
          >
            {storyIdx != null ? 'قطع روایت' : 'روایت'}
          </button>
        </div>
        {/* انتخاب کریدور تور H4: شش کریدور بین‌المللی */}
        {tourPlaying && tourCorridor != null && (
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-slate-500 shrink-0">کریدور تور:</span>
            <div className="flex flex-1 gap-0.5 overflow-x-auto">
              {corridors.map((c, i) => (
                <button
                  key={c.name}
                  onClick={() => startTour(i)}
                  title={c.name}
                  className={`w-4 h-4 rounded text-[8px] font-bold transition-all ${
                    tourCorridor === i ? 'ring-1 ring-white/70 scale-110' : 'opacity-60 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.color, color: '#0f172a' }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        <span className="text-[8px] text-slate-500 text-center leading-relaxed">
          OpenFreeMap · OpenTopoMap · HOT · CARTO · CyclOSM · Esri<br />
          OpenRailwayMap · OpenSeaMap · Mapterhorn
        </span>
      </div>

      {/* F12: مینی‌نقشهٔ موقعیت — اوراسیا با نقاط گیت‌ها و قاب دوربین فعلی (Canvas ۲بعدی، بدون Map دوم) */}
      <MiniMapCanvas crossings={crossings} />

      {/* نوار سینمایی: زیرنویس تور کریدور / صحنهٔ روایت — قرص سبز امضایی */}
      {(tourSubtitle || (storyIdx != null && storyText)) && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[70%] bg-[var(--cmd-green)] text-white rounded-full px-4 py-1.5 shadow-lg">
          <div className="flex items-center gap-2">
            {storyIdx != null && (
              <span className="text-[9px] font-bold text-white/90 whitespace-nowrap">
                {storyIdx + 1} از {STORY_SCENES.length} · {STORY_SCENES[storyIdx].title}
              </span>
            )}
            <span className="text-[10px] leading-relaxed">
              {storyIdx != null ? STORY_SCENES[storyIdx].text : tourSubtitle}
            </span>
          </div>
        </div>
      )}

      {pickMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-[var(--cmd-green)] text-white font-bold px-4 py-2 rounded-full shadow-lg text-xs animate-pulse">
          {pickMode === 'origin' ? 'مبدأ را روی نقشه انتخاب کنید' : 'مقصد را روی نقشه انتخاب کنید'}
        </div>
      )}

      {drawMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-[var(--cmd-green)] text-white font-bold px-4 py-2 rounded-full shadow-lg text-xs animate-pulse">
          حالت ترسیم دستی فعال است — برای افزودن نقطه روی نقشه کلیک کنید
        </div>
      )}

      {/* Legend پویای صف زندهٔ گمرک (تنها با وجود دادهٔ زنده نمایش داده می‌شود) */}
      <MapLiveLegend gates={liveGates || []} />
    </div>
  );
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* ------------------------------------------------------------------ *
 * F12 — مینی‌نقشهٔ موقعیت: درختی کوچک (۱۸۰×۱۲۰) با نقاط گیت‌ها روی اوراسیا
 * و مستطیل نمای فعلی دوربین؛ Canvas ۲بعدی بدون ساخت Map دوم. رندر در rAF
 * مشترک خودش با نرخ پایین (~۴ فریم بر ثانیه) برای هم‌گامی سبک با دوربین.
 * ------------------------------------------------------------------ */
const MINIMAP_BOUNDS = { minLng: 22, maxLng: 86, minLat: 8, maxLat: 58 }; // قاب اوراسیا/ایران

const MiniMapCanvas: React.FC<{ crossings: Crossing[] }> = ({ crossings }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let lastDraw = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < 250) return; // ~۴fps برای هم‌گامی سبک
      lastDraw = now;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = 180;
      const h = 120;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const { minLng, maxLng, minLat, maxLat } = MINIMAP_BOUNDS;
      const px = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * w;
      const py = (lat: number) => h - ((lat - minLat) / (maxLat - minLat)) * h;

      // پس‌زمینه و قاب
      ctx.fillStyle = 'rgba(2,6,23,0.82)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(45,212,191,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      // گیت‌ها: ایران کهربایی، سایر کشورها خاکستری روشن
      crossings.forEach((gate) => {
        const x = px(gate.lng);
        const y = py(gate.lat);
        if (x < 0 || x > w || y < 0 || y > h) return;
        ctx.beginPath();
        ctx.arc(x, y, gate.country === 'ایران' ? 1.8 : 1.2, 0, Math.PI * 2);
        ctx.fillStyle = gate.country === 'ایران' ? '#fbbf24' : 'rgba(148,163,184,0.8)';
        ctx.fill();
      });

      // مستطیل نمای فعلی دوربین نقشهٔ اصلی
      const map = (window as any).__atlasMapRef?.current as maplibregl.Map | undefined;
      if (map && map.getCanvas()) {
        const b = map.getBounds();
        const nw = b.getNorthWest();
        const se = b.getSouthEast();
        const x1 = Math.max(0, px(nw.lng));
        const y1 = Math.max(0, py(nw.lat));
        const x2 = Math.min(w, px(se.lng));
        const y2 = Math.min(h, py(se.lat));
        if (x2 > x1 && y2 > y1) {
          ctx.strokeStyle = '#2dd4bf';
          ctx.lineWidth = 1.4;
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
          ctx.fillStyle = 'rgba(45,212,191,0.12)';
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [crossings]);

  return (
    <div
      className="absolute bottom-3 right-3 z-10 rounded-xl overflow-hidden border border-teal-500/25 shadow-xl"
      title="مینی‌نقشهٔ موقعیت: قاب اوراسیا با نمای فعلی دوربین"
    >
      <canvas ref={canvasRef} style={{ width: 180, height: 120, display: 'block' }} />
    </div>
  );
}

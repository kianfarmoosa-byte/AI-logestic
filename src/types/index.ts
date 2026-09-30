export interface Crossing {
  id: number;
  name: string;
  name_en: string | null;
  country: string;
  type: string;
  status: string;
  lat: number;
  lng: number;
  layer: 'road' | 'combined' | 'rail';
  trucks: string | null;
  wagons: string | null;
  warehouse: string | null;
  cold: string | null;
  hours_summer: string | null;
  clearance: string | null;
  services: string | null;
  highway: string | null;
  volume: string | null;
  cargo: string | null;
  xg_id: string | null;
  depth: string | null;
  corridor: string | null;
  confidence: string | null;
  src_type: string | null;
  note: string | null;
  opp_name: string | null;
  rail_note: string | null;
  trucks_est: number | null;
  clear_est: number | null;
  x?: [string, string][];
}

export interface Corridor {
  name: string;
  color: string;
  points: [number, number][]; // [lat, lng]
}

export interface RoadRoute {
  ref: string;
  n: string;
  c: [string, number, number][]; // [city_name, lat, lng]
}

export interface CountryRoadNetwork {
  color: string;
  routes: RoadRoute[];
}

export interface WebSource {
  uri: string;
  title: string;
}

export interface MapPlace {
  uri: string;
  title: string;
  reviewSnippets?: string[];
}

export interface SearchGroundingResponse {
  success: boolean;
  text: string;
  sources: WebSource[];
  searchQueries?: string[];
}

export interface MapsGroundingResponse {
  success: boolean;
  text: string;
  places: MapPlace[];
}

export interface GroundingQueryState {
  loading: boolean;
  error: string | null;
  result: SearchGroundingResponse | null;
  mapsResult: MapsGroundingResponse | null;
}

/* ------------------------------------------------------------------ *
 * مسیریابی و حمل‌ونقل (Routing & Freight)
 * ------------------------------------------------------------------ */

export interface LatLng {
  lat: number;
  lng: number;
}

/** پروفایل‌های وسیله/کاربر مسیر */
export type RouteProfileId = 'car' | 'bus' | 'truck' | 'truck_adr' | 'pedestrian';

export type RouteProviderId = 'auto' | 'osrm' | 'valhalla' | 'ors';

export interface VehicleProfile {
  id: RouteProfileId;
  label: string;
  short: string;
  description: string;
  /** نام پروفایل در هر موتور مسیریاب */
  engine: { osrm: string; valhalla: string; ors: string };
  /** ضریب تصحیح زمان رانندگی برای این وسیله */
  durationFactor: number;
  fuelType: 'diesel' | 'petrol' | 'none';
  fuelPer100Km: number; // لیتر در ۱۰۰ کیلومتر (بارگیری کامل)
  costPerKm: number; // استهلاک و تعمیرات (دلار بر کیلومتر)
  driverPerHour: number; // دستمزد راننده (دلار بر ساعت)
  tollPerKm: number; // عوارض و مجوز عبور (دلار بر کیلومتر)
  containerPerKm: number; // باربری/خدمات وابسته
  maxDailyDriveHours: number; // محدودیت قانونی رانندگی روزانه (صفر = بدون محدودیت)
  restHours: number; // استراحت اجباری پس از هر شیفت
  payloadTons: number;
  maxTons: number;
  maxHeightM: number;
  maxWidthM: number;
  maxLengthM: number;
  co2PerLiter: number; // کیلوگرم CO₂ به ازای هر لیتر سوخت
}

/** محدودیت‌های فیزیکی و مقرراتی مسیر */
export interface RouteConstraints {
  heightM: number;
  weightTons: number;
  widthM: number;
  lengthM: number;
  axleLoadTons: number;
  adrClass: string; // '' = بدون کالای خطرناک
  hazmat: boolean;
  tempControlled: boolean;
}

export interface ObjectiveWeights {
  time: number;
  cost: number;
  risk: number;
  carbon: number;
}

export interface RouteGateRef {
  id: number;
  name: string;
  country: string;
  corridor: string | null;
  clearHours: number | null;
  trucksEst: number | null;
  lat: number;
  lng: number;
}

export interface RouteMetrics {
  distanceKm: number;
  driveHours: number;
  restHours: number;
  borderHours: number;
  totalHours: number;
  fuelLiters: number;
  co2Kg: number;
  fuelUsd: number;
  driverUsd: number;
  tollUsd: number;
  maintenanceUsd: number;
  borderUsd: number;
  costUsd: number;
  riskScore: number;
  riskLevel: 'کم' | 'متوسط' | 'بالا' | 'بحرانی';
  riskReasons: string[];
  score: number; // ۰..۱۰۰ (بالاتر = بهتر)
  rank: number;
}

/** گزینه مسیر بازگشتی از موتور مسیریاب */
export interface RouteAlternative {
  id: string;
  label: string;
  distanceKm: number;
  durationHours: number;
  geometry: [number, number][]; // [lng, lat]
  kind: string;
}

export interface RoutePlanResponse {
  success: boolean;
  provider: string;
  providerLabel: string;
  costing: string;
  alternatives: RouteAlternative[];
  notes: string[];
  /** true وقتی پاسخ از مسیر پشتیبان (بدون محدودیت کامیون) آمده است */
  degraded?: boolean;
}

/** مسیر محاسبه‌شده همراه با سنجه‌های هزینه/کربن/ریسک */
export interface EvaluatedRoute extends RouteAlternative {
  metrics: RouteMetrics;
  gates: RouteGateRef[];
  violations: string[];
}

export interface RouteOverlay {
  id: string;
  label: string;
  color: string;
  coordinates: [number, number][]; // [lng, lat]
  dash?: boolean;
  width?: number;
}

export interface IsochroneOverlay {
  id: string;
  label: string;
  color: string;
  hours: number;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
}

export interface RouteEngineStatus {
  osrm: { available: boolean; endpoint: string; label: string };
  valhalla: { available: boolean; endpoint: string; label: string; selfHosted: boolean };
  ors: { available: boolean; endpoint: string; label: string; keyPresent: boolean };
}

/* ------------------------------------------------------------------ *
 * بار چندمبدأ/چندمقصد و زمان‌بندی ریل/دریا/هوا
 * ------------------------------------------------------------------ */

export interface LoadBasketItem {
  id: string;
  origin: string;
  destination: string;
  originCoords: LatLng | null;
  destinationCoords: LatLng | null;
  weightTons: number;
  volumeM3: number;
  cargo: string;
  hazmat: boolean;
  tempControlled: boolean;
}

export interface ConsolidationGroup {
  destination: string;
  items: number;
  totalTons: number;
  totalVolumeM3: number;
  vehicles: number;
  soloVehicles: number;
  averageUtilization: number;
}

export interface ConsolidationPlan {
  vehicles: number;
  soloVehicles: number;
  savedVehicles: number;
  savedCostUsd: number;
  savedCo2Kg: number;
  averageUtilization: number;
  groups: ConsolidationGroup[];
  notes: string[];
}

export type TransportMode = 'road' | 'rail' | 'sea' | 'air';

export interface TransportSchedule {
  id: string;
  mode: Exclude<TransportMode, 'road'>;
  operator: string;
  title: string;
  from: string;
  to: string;
  via?: string;
  countries: string[];
  departDays: string[]; // نام روزهای هفته یا 'روزانه'
  departTime: string;
  transitDays: number;
  capacity: string;
  priceUsdPerTon: number;
  co2KgPerTon: number;
  risk: 'کم' | 'متوسط' | 'بالا';
  notes: string;
  coords: [number, number]; // [lng, lat] مبدأ برای تمرکز روی نقشه
}

/* ------------------------------------------------------------------ *
 * مسیرهای سازمانی و پیش‌تنظیم‌های کریدور
 * ------------------------------------------------------------------ */

export interface SavedRoute {
  id: string;
  name: string;
  owner: string;
  createdAt: string;
  source: 'manual' | 'planned';
  profile: RouteProfileId;
  originLabel: string;
  destinationLabel: string;
  distanceKm: number;
  durationHours: number;
  fuelLiters: number;
  co2Kg: number;
  costUsd: number;
  cargo: string;
  notes: string;
  geometry: [number, number][]; // [lng, lat]
}

/* ------------------------------------------------------------------ *
 * مکان‌یابی نتایج جستجوی وب روی نقشه
 * ------------------------------------------------------------------ */

export type GeoTagKind = 'crossing' | 'city' | 'country' | 'corridor';

/** مکانی که از متن یک نتیجهٔ جستجو استخراج شده است */
export interface GeoTag {
  id: string;
  label: string;
  kind: GeoTagKind;
  lat: number;
  lng: number;
  score: number;
}

/** نشانهٔ نقشه برای یک نتیجهٔ جستجو */
export interface MapSearchPin {
  id: string;
  label: string;
  url: string;
  source: string;
  lat: number;
  lng: number;
  rank: number;
  color: string;
  kind: GeoTagKind;
  title: string;
  /** نزدیک‌ترین گذرگاه مرزی به این نشانه (برای خط اتصال روی نقشه) */
  nearestGateId: number | null;
  nearestGateName: string | null;
  nearestGateLat: number | null;
  nearestGateLng: number | null;
  /** فاصلهٔ نزدیک‌ترین گذرگاه: کیلومتر جاده‌ای واقعی (OSRM) یا فاصلهٔ هوایی در صورت نبود شبکه */
  nearestGateKm: number | null;
  /** آیا فاصلهٔ بالا از شبکهٔ واقعی جاده‌ای محاسبه شده است؟ */
  nearestGateRoad: boolean;
  /** زمان تخمینی سفر جاده‌ای تا گذرگاه (دقیقه) — تنها در حالت جاده‌ای */
  nearestGateMinutes: number | null;
  /** هندسهٔ واقعی مسیر جاده‌ای تا گذرگاه به ترتیب [lng, lat] — در نبود سرویس، null (خط مستقیم) */
  nearestGatePath: [number, number][] | null;
}

/** درخواست تمرکز نقشه روی یک نقطه */
export interface MapFocusTarget {
  lat: number;
  lng: number;
  zoom?: number;
  seq: number;
}

export interface RoutePreset {
  id: string;
  title: string;
  subtitle: string;
  corridor: string;
  color: string;
  profile: RouteProfileId;
  origin: { name: string } & LatLng;
  destination: { name: string } & LatLng;
  highlights: string[];
}

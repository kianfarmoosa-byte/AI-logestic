/**
 * نگاشت گمرکات رسمی ایران به گذرگاه‌های اطلس
 * ------------------------------------------------------------
 * گمرکات در منابع رسمی (اتاق تهران، گمرک IRICA، راهداری، راه‌آهن) با نام‌های
 * گاهی متفاوت (مثل «منطقه ویژه دوغارون» یا «گمرک بازرگان») ثبت می‌شوند.
 * این ماژول همهٔ صورت‌های ممکن را به شناسهٔ گذرگاه در DATA.crossings نگاشت می‌کند.
 */

import { normalizeFa } from './geoTagging';

/** نگاشت «نام نرمال‌شدهٔ گمرک رسمی» → شناسهٔ عددی گذرگاه اطلس */
const CUSTOMS_TO_GATE: Record<string, number> = {};

/** ثبت یک گمرک با همهٔ صورت‌های نامش */
function registerGate(gateId: number, officialNames: string[]) {
  for (const name of officialNames) {
    const normalized = normalizeFa(name);
    if (normalized) CUSTOMS_TO_GATE[normalized] = gateId;
  }
}

/* ── گمرکات مرزی فعال (با صورت‌های نام در منابع رسمی) ─────────────────── */

registerGate(0, ['بازرگان', 'گمرک بازرگان']); // ترکیه
registerGate(1, ['رازی', 'گمرک رازی']); // ترکیه/ریلی
registerGate(2, ['سرو', 'گمرک سرو', 'بازه گان سرو']); // عراق
registerGate(3, ['تمرچین', 'گمرک تمرچین']); // عراق
registerGate(4, ['پرویزخان', 'گمرک پرویزخان']); // عراق
registerGate(5, ['خسروی', 'گمرک خسروی']); // عراق
registerGate(6, ['مهران', 'گمرک مهران']); // عراق
registerGate(7, ['شلمچه', 'گمرک شلمچه']); // عراق
registerGate(8, ['چذابه', 'چذابه', 'گمرک چذابه']); // عراق
registerGate(9, ['باشماق', 'گمرک باشماق']); // عراق
registerGate(10, ['سومار', 'گمرک سومار']); // عراق
registerGate(11, ['نوردوز', 'گمرک نوردوز']); // ارمنستان/آذربایجان
registerGate(12, ['آستارا', 'گمرک آستارا']); // آذربایجان
registerGate(13, ['آستارا ریلی', 'آستارا (ریلی)', 'گمرک ریلی آستارا']); // آذربایجان/ریلی
registerGate(14, ['بیله سوار', 'بیلهسوار', 'گمرک بیله سوار']); // جمهوری آذربایجان
registerGate(15, ['جلفا', 'گمرک جلفا']); // جمهوری آذربایجان/ریلی+جاده
registerGate(17, ['پلدشت', 'گمرک پلدشت']); // جمهوری آذربایجان
registerGate(18, ['سرخس', 'گمرک سرخس']); // ترکمنستان
registerGate(19, ['باجگیران', 'گمرک باجگیران']); // ترکمنستان
registerGate(20, ['لطف آباد', 'لطفآباد', 'گمرک لطف آباد']); // ترکمنستان
registerGate(21, ['اینچه برون', 'اینچهبرون', 'گمرک اینچه برون']); // ترکمنستان/ریلی
registerGate(22, ['دوغارون', 'گمرک دوغارون', 'منطقه ویژه دوغارون', 'منطقه ويژه دوغارون']); // افغانستان
registerGate(23, ['ماهیرود', 'ماهیرود', 'گمرک ماهیرود']); // افغانستان
registerGate(24, ['میلک', 'میلک ۷۸', 'گمرک میلک']); // افغانستان
registerGate(25, ['خواف', 'گمرک خواف']); // افغانستان
registerGate(26, ['میرجاوه', 'میرجاوه', 'گمرک میرجاوه']); // پاکستان
registerGate(27, ['ریمدان', 'گمرک ریمدان', 'ریمدان پکستان']); // پاکستان
registerGate(206, ['پیشین', 'گمرک پیشین']); // پاکستان

/** نگاشت نهایی: نام نرمال‌شده → شناسهٔ گذرگاه */
export function gateIdForCustomsName(customsName: string): number | null {
  const normalized = normalizeFa(String(customsName || ''));
  if (!normalized) return null;
  return CUSTOMS_TO_GATE[normalized] ?? null;
}

/** فهرست همهٔ نام‌های رسمی ثبت‌شده (برای دیباگ و تست) */
export function registeredCustomsNames(): string[] {
  return Object.keys(CUSTOMS_TO_GATE);
}

/** شمار گذرگاههای نگاشت‌شده */
export function registeredGateCount(): number {
  return new Set(Object.values(CUSTOMS_TO_GATE)).size;
}

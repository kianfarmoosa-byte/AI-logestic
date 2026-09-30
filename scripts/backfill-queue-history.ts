/**
 * backfill-queue-history.ts — پرکردن گذشتهٔ نمودار روند صف
 *
 * سامانهٔ نوبتدهی رسمی گمرک (borderpark.ir) فقط وضعیت لحظهای را ارائه
 * میدهد و آرشیو عمومی ندارد؛ پس این اسکریپت نقاط گذشته را از یک «شکل
 * پایه» قابل تنظیم میسازد (ساعت اوج شبانه + نویز ملایم) و مقدار واقعیِ
 * اکنون را دقیقاً حفظ میکند تا پیوستگی سری حفظ شود.
 *
 * اجرا:  bun scripts/backfill-queue-history.ts [--hours 24] [--force]
 * نقاط تولیدشده backfill:true میگیرند و مقدار سراسریِ آخرین نقطهٔ
 * موجود (یا وضعیت زندهٔ سرور) عیناً حفظ میشود.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const HISTORY_PATH = path.join(DATA_DIR, 'queue-history.json');
const ARCHIVE_PATH = path.join(DATA_DIR, 'queue-history-archive.jsonl');

interface GateValue {
  totalQueue: number;
  maxWaitHours: number;
}

interface QueueHistoryPoint {
  at: number;
  totalQueue: number;
  maxWaitHours: number;
  liveGates: number;
  gateValues?: Record<string, GateValue>;
  backfill?: boolean;
}

const STEP_MS = 15 * 60_000;

/** slugها و وزن صف نسبت به میانگین (بر اساس مشاهدات زندهٔ مرزها) */
const GATES: { slug: string; gateId: number | null; weight: number; baseWait: number }[] = [
  { slug: 'bazargan', gateId: 0, weight: 0.3, baseWait: 10 },
  { slug: 'jolfa', gateId: 15, weight: 0.25, baseWait: 300 },
  { slug: 'norduz', gateId: 43, weight: 0.2, baseWait: 400 },
  { slug: 'basharan', gateId: 12, weight: 0.12, baseWait: 20 },
  { slug: 'sarakhs', gateId: 22, weight: 0.08, baseWait: 8 },
  { slug: 'parvizkhan', gateId: 27, weight: 0.05, baseWait: 5 },
];

/** فرم شبهواقع‌گرایانهٔ شبانه‌روزی: اوج ۲۱–۲۳ و کمینهٔ ۴–۶ صبح */
function dayShape(hourFrac: number): number {
  return 0.75 + 0.25 * Math.cos(((hourFrac - 22 + 24) % 24) * (Math.PI / 12));
}

/** نویز ملایم قطعی (بر پایهٔ at تا اجرای مجدد همان سری را بسازد) */
function noise(at: number, seed: number): number {
  const x = Math.sin(at / 1_000_000 + seed) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1; // [-1, 1]
}

function parseArgs(): { hours: number; force: boolean } {
  const args = process.argv.slice(2);
  const hoursIdx = args.indexOf('--hours');
  const hours = hoursIdx >= 0 ? Number(args[hoursIdx + 1]) || 24 : 24;
  return { hours, force: args.includes('--force') };
}

async function fetchLivePoint(): Promise<QueueHistoryPoint | null> {
  try {
    const res = await fetch('http://localhost:3000/api/border-park/status');
    if (!res.ok) return null;
    const data: any = await res.json();
    const gates: any[] = data.gates ?? [];
    const live = gates.filter((g) => g.confidence !== 'low');
    if (live.length === 0) return null;
    const gateValues: Record<string, GateValue> = {};
    for (const g of live) {
      gateValues[g.gateSlug] = { totalQueue: g.totalQueue, maxWaitHours: g.maxWaitHours };
    }
    return {
      at: Date.now(),
      totalQueue: live.reduce((s, g) => s + g.totalQueue, 0),
      maxWaitHours: live.reduce((mx, g) => Math.max(mx, g.maxWaitHours), 0),
      liveGates: live.length,
      gateValues,
    };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const { hours, force } = parseArgs();
  mkdirSync(DATA_DIR, { recursive: true });

  const existing: QueueHistoryPoint[] = existsSync(HISTORY_PATH)
    ? JSON.parse(readFileSync(HISTORY_PATH, 'utf8'))
    : [];
  const earliest = existing.length > 0 ? existing[0].at : Date.now();
  const now = Date.now();
  const startAt = now - hours * 3600_000;
  if (!force && existing.length > 0 && startAt > earliest - STEP_MS) {
    console.log('تاریخچهٔ کافی از قبل موجود است؛ کاری انجام نشد (--force برای بازنویسی).');
    return;
  }

  // مقدار لنگر: وضعیت زندهٔ سرور (دقیق) یا آخرین نقطهٔ موجود
  const anchor = (await fetchLivePoint()) ?? existing[existing.length - 1] ?? null;
  if (!anchor) {
    console.error('هیچ لنگری برای مقیاس موجود نیست: سرور در دسترس نیست و تاریخچه خالی است. ابتدا سرور را اجرا کنید.');
    process.exit(1);
  }

  const scale = anchor.totalQueue / 1; // مقدار لحظهٔ اوج روزانه ≈ مقدار فعلی
  const points: QueueHistoryPoint[] = [];
  for (let at = startAt; at < now - STEP_MS / 2; at += STEP_MS) {
    const d = new Date(at);
    const hourFrac = d.getHours() + d.getMinutes() / 60;
    const base = anchor.totalQueue * dayShape(hourFrac) * (1 + noise(at, 7) * 0.08);
    const total = Math.max(0, Math.round(base));
    const waitBase = anchor.maxWaitHours * (0.9 + 0.1 * dayShape(hourFrac));
    const maxWait = Math.max(0, Math.round(waitBase + noise(at, 13) * anchor.maxWaitHours * 0.05));
    const gateValues: Record<string, GateValue> = {};
    let wsum = 0;
    for (const g of GATES) wsum += g.weight;
    for (const g of GATES) {
      const share = g.weight / wsum;
      gateValues[g.slug] = {
        totalQueue: Math.max(0, Math.round(total * share * (1 + noise(at, g.weight * 100) * 0.15))),
        maxWaitHours: Math.max(0, Math.round(g.baseWait * (0.9 + 0.2 * dayShape(hourFrac)))),
      };
    }
    points.push({ at, totalQueue: total, maxWaitHours: maxWait, liveGates: GATES.length, gateValues, backfill: true });
  }

  // پیوستگی: اگر نقطهٔ موجود نزدیک پایان بک‌فیل است، فاصله را حفظ کن
  const merged = [...points.filter((p) => p.at < earliest - STEP_MS / 2), ...existing];
  // مرتب‌سازی و حذف تکراری بر اساس سطل ۱۵ دقیقهای
  const seen = new Set<number>();
  const deduped = merged
    .sort((a, b) => a.at - b.at)
    .filter((p) => {
      const bucket = Math.floor(p.at / STEP_MS);
      if (seen.has(bucket)) return false;
      seen.add(bucket);
      return true;
    })
    .slice(-672);

  writeFileSync(HISTORY_PATH, JSON.stringify(deduped), 'utf8');
  // بایگانی هم به‌روزرسانی شود تا بازسازی بعدی این نقاط را داشته باشد
  for (const p of points) {
    if (p.at < earliest - STEP_MS / 2) appendFileSync(ARCHIVE_PATH, `${JSON.stringify(p)}\n`, 'utf8');
  }

  console.log(
    `بک‌فیل انجام شد: ${points.length.toLocaleString('fa-IR')} نقطه در ${hours.toLocaleString('fa-IR')} ساعت گذشته (لنگر: ${anchor.totalQueue.toLocaleString('fa-IR')} تریلر، مجموع نهایی ${deduped.length.toLocaleString('fa-IR')} نقطه).`
  );
}

void main();

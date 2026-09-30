# استقرار پروداکشن — ۳۰ سپتامبر ۲۰۲۶

## هدف
فعال‌سازی graceful degradation برای پنل‌های متکی به `/api` در استقرار static پروداکشن
(forwarderai.freebuff.app) و راستی‌آزمایی سرتاسری.

## تغییرات کد
کامیت `ad28fdb` — feat: implement graceful degradation for unavailable API services

- `src/services/api.ts`: helper مشترک `readJsonOrThrow` — اگر پاسخ JSON نباشد
  (در استقرار static مسیر `/api/*` به `index.html` هدایت می‌شود)، به‌جای خطای خام
  `Unexpected token '<'` پیام شفاف فارسی نمایش داده می‌شود.
- اتصال `webSearch.ts`، `BorderParkLive.tsx` و `BorderFlowDashboard.tsx` به همین helper.
- نقاط با fallback بی‌صدا (App، OpsEventsBoard، OpsNotifications، MapAtlas،
  geoTagging، routeEngine) از قبل امن بودند و تغییر نکردند.

## مراحل استقرار
1. `freebuff-deploy check` → پاس (install: `bun install`، build: `bun run build`)
2. `freebuff-deploy start` → Redeploy آغاز شد
3. `freebuff-deploy status` → `state: active`، ۰ خطای بیلد، ۴۱ فایل، `static_vite`

## راستی‌آزمایی سرتاسری
- `index.html` پروداکشن باندل تازهٔ `index-e-jnzAnP.js` را سرو می‌کند.
- جستجو در محتوای باندل سرویس‌شده → پیام فارسی graceful degradation حاضر است.
- `bun tsc -b --noEmit` → سبز

## وضعیت باز
- محیط پروداکشن بدون `AI_API_KEY` / `EXA_API_KEY` است؛ پنل‌های AI تا ست‌شدن کلیدها
  پیام degrade فارسی را نشان می‌دهند.
- دادهٔ زندهٔ صف مرزی، اعلان‌ها و تاریخچهٔ نمودار نیازمند میزبانی سرور دار برای `/api` است.

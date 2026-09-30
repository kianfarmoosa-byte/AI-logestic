import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    worker: {
      format: 'es' as const,
    },
    build: {
      // چانک app را کوچک نگه می‌داریم؛ تنها استثنا وندور مونولیک maplibre است (~۱MB)
      // که تقسیم بیشتر آن (چند درخواست موازی) سودی ندارد.
      chunkSizeWarningLimit: 1100,
      rolldownOptions: {
        output: {
          // تقسیم دستی وندورها: نقشه (MapLibre) و چارچوب UI از باندل اصلی جدا می‌شوند
          // تا کش مرورگر بین ریلیزها پایدار بماند و بارگذاری اولیه سبک‌تر شود.
          codeSplitting: {
            groups: [
              {
                name: 'maplibre',
                test: /node_modules[\\/]maplibre-gl[\/]/,
                priority: 10,
              },
              {
                name: 'react-vendor',
                test: /node_modules[\\/](react|react-dom|scheduler)[\/]/,
                priority: 9,
              },
            ],
          },
        },
      },
    },
    server: {
      // HMR/WebSocket همیشه خاموش: پراکسی پیش‌نمایشِ مدیریت‌شده اتصال WebSocket را
      // تونل نمیکند و @vite/client با خطای "WebSocket closed without opened"
      // بنر خطای دروغین در مرورگر میسازد. ویرایش‌ها با ری‌استارت پیش‌نمایش
      // مدیریت‌شده اعمال میشوند؛ پس سوکت HMR هرگز لازم نیست.
      hmr: false,
      // بدون HMR تماشای فایلها فایدهٔ کاربری ندارد؛ خاموش نگه داشتن CPU را آزاد میکند.
      watch: null,
    },
  };
});

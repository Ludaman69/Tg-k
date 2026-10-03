import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { initPWAInstallListener } from './lib/usePWAInstall';
import { useAppUpdate } from './lib/useAppUpdate';
import { SUPPORTS_SERVICE_WORKER } from './lib/env';
import { initNative } from './lib/native';

// Intercept beforeinstallprompt as early as possible
initPWAInstallListener();

// Инициализация нативных возможностей (status bar, клавиатура, кнопка «Назад»).
// В браузере — no-op.
initNative();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Register Service Worker for PWA + soft update detection.
// В нативной сборке SW не используется: ассеты уже упакованы в APK,
// а обновления и пуши обеспечивает платформа.
if (SUPPORTS_SERVICE_WORKER) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('SW registered:', reg.scope);

        // Подключаем обнаружение обновлений
        useAppUpdate.getState().initUpdateListener(reg);

        // Периодически проверяем наличие обновлений SW (каждые 60 сек)
        setInterval(() => {
          reg.update().catch(() => {});
        }, 60 * 1000);
      })
      .catch((err) => {
        console.log('SW registration failed:', err);
      });
  });
}

// Высота вьюпорта (--vh) и слушатели resize/orientationchange
// настраиваются внутри initNative() — как для web, так и для native.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);

import { useEffect, useState, lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuthStore } from './stores/authStore';
import { setHeaderThemeColor, setAuthThemeColor } from './lib/themeColor';
import { useMobile, useStandalone } from './lib/useMobile';
import { IS_NATIVE } from './lib/env';
import { useAppUpdate } from './lib/useAppUpdate';

// Lazy load top-level screens — keeps heavy deps (gsap/ogl/libs) out of the
// initial bundle. They are only needed on their respective screens.
const AuthPage = lazy(() => import('./pages/AuthPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const MobileAppPromo = lazy(() => import('./components/MobileAppPromo'));

export default function App() {
  const { token, user, checkAuth, isLoading } = useAuthStore();
  const isMobile = useMobile();
  const isStandalone = useStandalone();

  const [continueInWeb, setContinueInWeb] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Проверка новой версии APK (native): при старте, при возврате из фона
  // и периодически каждые 60 секунд (как PWA).
  // APK раздаётся с сервера, поэтому автообновления Google Play нет.
  useEffect(() => {
    if (!IS_NATIVE) return;

    const check = () => {
      void useAppUpdate.getState().checkNativeUpdate();
    };

    // Проверка при старте
    check();

    // Периодическая проверка (как PWA — каждые 60 секунд)
    const interval = setInterval(() => {
      check();
    }, 60 * 1000);

    let removeListener: (() => void) | undefined;

    void (async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        const handle = await CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) check();
        });
        removeListener = () => void handle.remove();
      } catch {
        /* плагин недоступен */
      }
    })();

    return () => {
      removeListener?.();
      clearInterval(interval);
    };
  }, []);

  // Keep the mobile status-bar colour in sync with the current screen
  const isAuthenticated = !!(token && user);
  useEffect(() => {
    if (isLoading) {
      setAuthThemeColor();
    } else if (isAuthenticated) {
      setHeaderThemeColor();
    } else {
      setAuthThemeColor();
    }
  }, [isLoading, isAuthenticated]);

  const handleContinueInWeb = () => {
    setContinueInWeb(true);
  };

  // Показываем промо-экран установки только в мобильном браузере,
  // не в PWA/native (standalone) и если пользователь ещё не нажал "Продолжить в Web"
  const showMobilePromo = !isLoading
    && !isAuthenticated
    && isMobile
    && !isStandalone
    && !IS_NATIVE
    && !continueInWeb;

  if (isLoading) {
    return <ScreenLoader />;
  }

  return (
    <Suspense fallback={<ScreenLoader />}>
      <AnimatePresence mode="wait">
        {isAuthenticated ? (
          <ChatPage key="chat" />
        ) : showMobilePromo ? (
          <MobileAppPromo key="promo" onContinueInWeb={handleContinueInWeb} />
        ) : (
          <AuthPage key="auth" />
        )}
      </AnimatePresence>
    </Suspense>
  );
}

function ScreenLoader() {
  return (
    <div className="h-full flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <VortexLoader />
        <p className="text-zinc-500 text-sm">Загрузка...</p>
      </div>
    </div>
  );
}

function VortexLoader() {
  return (
    <div className="relative w-12 h-12">
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-vortex-500 animate-spin" />
      <div
        className="absolute inset-1 rounded-full border-2 border-transparent border-t-vortex-400 animate-spin"
        style={{ animationDuration: '0.8s', animationDirection: 'reverse' }}
      />
      <div
        className="absolute inset-2 rounded-full border-2 border-transparent border-t-vortex-300 animate-spin"
        style={{ animationDuration: '0.6s' }}
      />
    </div>
  );
}

import { IS_NATIVE, IS_ANDROID } from './env';

/**
 * Инициализация нативных возможностей Capacitor.
 *
 * Всё, что специфично для APK/IPA, собрано здесь, чтобы остальной код
 * оставался платформенно-независимым. В браузере функции — no-op,
 * а сами плагины подгружаются динамически, чтобы не попадать
 * в web-бандл лишним весом.
 */

/** Синхронизирует CSS-переменную --vh с реальной высотой вьюпорта */
export function setAppHeight(heightPx?: number) {
  const h = heightPx ?? window.innerHeight;
  document.documentElement.style.setProperty('--vh', `${h * 0.01}px`);
}

/** Обработчик аппаратной кнопки «Назад» (Android) */
type BackHandler = () => boolean;
const backHandlers: BackHandler[] = [];

/**
 * Регистрирует обработчик кнопки «Назад».
 * Обработчик должен вернуть true, если событие обработано
 * (например, закрыл модальное окно) — тогда приложение не свернётся.
 *
 * Возвращает функцию отписки.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.unshift(handler);
  return () => {
    const i = backHandlers.indexOf(handler);
    if (i !== -1) backHandlers.splice(i, 1);
  };
}

/** Настройка статус-бара под цвет текущего экрана */
export async function setNativeStatusBarColor(color: string) {
  if (!IS_NATIVE) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (IS_ANDROID) {
      await StatusBar.setBackgroundColor({ color });
    }
  } catch {
    // Плагин недоступен — не критично
  }
}

// ─── In-App Browser ────────────────────────────────────────────────────

/**
 * Открывает URL в подходящем для платформы браузере:
 *   — native (Capacitor): Chrome Custom Tabs / SFSafariViewController
 *   — web: новая вкладка с noopener/noreferrer
 */
export async function openUrl(url: string) {
  if (!url) return;

  // Убеждаемся что URL имеет схему; если нет — добавляем https
  let normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized) && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  if (IS_NATIVE) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: normalized });
    } catch {
      window.open(normalized, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(normalized, '_blank', 'noopener,noreferrer');
  }
}

// ─── Deep Links ────────────────────────────────────────────────────────

/** Тип колбэка для обработки deep link URL */
export type DeepLinkHandler = (url: string) => void;

const deepLinkHandlers: DeepLinkHandler[] = [];
let pendingDeepLink: string | null = null;

/** Регистрирует обработчик deep link'ов. Возвращает функцию отписки. */
export function onDeepLink(handler: DeepLinkHandler): () => void {
  deepLinkHandlers.push(handler);
  return () => {
    const i = deepLinkHandlers.indexOf(handler);
    if (i !== -1) deepLinkHandlers.splice(i, 1);
  };
}

/** Возвращает отложенный deep link (если был открыт до инициализации) и очищает его */
export function consumePendingDeepLink(): string | null {
  const link = pendingDeepLink;
  pendingDeepLink = null;
  return link;
}

function handleDeepLink(url: string) {
  if (deepLinkHandlers.length > 0) {
    for (const handler of deepLinkHandlers) {
      try { handler(url); } catch { /* игнорируем */ }
    }
  } else {
    pendingDeepLink = url;
  }
}

let initialized = false;

/**
 * Вызывать один раз при старте приложения (до рендера React).
 */
export function initNative() {
  // Класс на <html> позволяет писать нативные стили в CSS
  // (замена @media (display-mode: standalone), которое в WebView не работает)
  if (IS_NATIVE) {
    document.documentElement.classList.add('native');
    document.documentElement.classList.add(IS_ANDROID ? 'native-android' : 'native-ios');
  }

  setAppHeight();

  if (!IS_NATIVE) {
    // В браузере высота меняется при resize/повороте
    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => setAppHeight());
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => setAppHeight(), 150);
    });
    return;
  }

  if (initialized) return;
  initialized = true;

  void initNativePlugins();
}

async function initNativePlugins() {
  // ── Клавиатура ────────────────────────────────────────────────
  // В WebView событие resize при показе клавиатуры приходит нестабильно,
  // поэтому опираемся на события плагина Keyboard.
  try {
    const { Keyboard } = await import('@capacitor/keyboard');

    Keyboard.addListener('keyboardWillShow', (info) => {
      document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      document.documentElement.classList.add('keyboard-open');
    });

    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.style.setProperty('--keyboard-height', '0px');
      document.documentElement.classList.remove('keyboard-open');
    });
  } catch {
    /* плагин не установлен */
  }

  // Высота вьюпорта в native меняется при повороте экрана
  window.addEventListener('resize', () => setAppHeight());
  window.addEventListener('orientationchange', () => {
    setTimeout(() => setAppHeight(), 150);
  });

  // ── Статус-бар ────────────────────────────────────────────────
  await setNativeStatusBarColor('#212332');

  // Включаем наложение статус-бара поверх WebView (edge-to-edge)
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    /* плагин не установлен */
  }

  // ── Splash screen ─────────────────────────────────────────────
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* плагин не установлен */
  }

  // ── Кнопка «Назад» + Deep Links (Android) ─────────────────────
  try {
    const { App } = await import('@capacitor/app');

    App.addListener('backButton', ({ canGoBack }) => {
      for (const handler of backHandlers) {
        try {
          if (handler()) return;
        } catch {
          /* игнорируем сбойный обработчик */
        }
      }

      if (canGoBack) {
        window.history.back();
      } else {
        void App.minimizeApp();
      }
    });

    // Deep Links — открытие приложения по ссылкам https://tg-k.ru/... и bkonekte://...
    App.addListener('appUrlOpen', (data) => {
      handleDeepLink(data.url);
    });

    // Если приложение уже запущено через deep link — обработать launch URL
    try {
      const info = await App.getLaunchUrl?.();
      if (info?.url) {
        handleDeepLink(info.url);
      }
    } catch {
      // getLaunchUrl может не поддерживаться в старых версиях
    }
  } catch {
    /* плагин не установлен */
  }
}

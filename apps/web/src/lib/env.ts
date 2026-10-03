import { Capacitor } from '@capacitor/core';

/**
 * Единая точка определения окружения (web / native) и адреса бэкенда.
 *
 * В браузере (PWA) фронтенд и API живут на одном origin, поэтому все
 * запросы идут по относительным путям — API_ORIGIN пустой.
 *
 * В нативном приложении (Capacitor) веб-ассеты загружаются с
 * https://localhost, поэтому относительные пути указывали бы внутрь
 * APK. Здесь нужен абсолютный адрес сервера из VITE_API_ORIGIN.
 */

/** Работает ли приложение внутри нативной оболочки Capacitor */
export const IS_NATIVE = Capacitor.isNativePlatform();

/** Текущая платформа: 'web' | 'android' | 'ios' */
export const PLATFORM = Capacitor.getPlatform();

export const IS_ANDROID = PLATFORM === 'android';
export const IS_IOS = PLATFORM === 'ios';

/**
 * Базовый origin бэкенда без завершающего слэша.
 *
 * — web: '' (относительные пути, работает и в dev через vite proxy)
 * — native: значение VITE_API_ORIGIN (например https://tg-k.ru)
 */
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/+$/, '');

if (IS_NATIVE && !API_ORIGIN) {
  console.error(
    '[env] VITE_API_ORIGIN не задан — в нативной сборке запросы к API работать не будут. ' +
    'Соберите приложение через "npm run build:native -w apps/web".'
  );
}

/**
 * Origin для подключения Socket.IO.
 * В web используем текущий origin, в native — адрес сервера.
 */
export function getSocketOrigin(): string {
  return API_ORIGIN || window.location.origin;
}

/**
 * Поддерживается ли Service Worker в текущем окружении.
 * В нативной оболочке SW не используется — кеширование и пуши
 * обеспечивает сама платформа.
 */
export const SUPPORTS_SERVICE_WORKER = !IS_NATIVE && 'serviceWorker' in navigator;

/**
 * Поддерживается ли шеринг экрана.
 * getDisplayMedia отсутствует в Android WebView и iOS WKWebView.
 */
export const SUPPORTS_SCREEN_SHARE =
  !IS_NATIVE &&
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getDisplayMedia === 'function';

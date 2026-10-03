import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Конфигурация Capacitor для Bkonekte.
 *
 * Веб-ассеты собираются локально (webDir: 'dist') и упаковываются в APK —
 * приложение работает офлайн, а API/WebSocket/медиа обращаются к
 * VITE_API_ORIGIN (см. apps/web/src/lib/env.ts).
 *
 * ВАЖНО: origin внутри WebView — https://localhost (androidScheme: 'https'),
 * поэтому сервер обязан разрешать этот origin в CORS_ORIGINS.
 */
const config: CapacitorConfig = {
  appId: 'com.bkonekte.app',
  appName: 'Bkonekte',
  webDir: 'dist',
  // Логи только в debug-сборках — не утекают в релиз
  loggingBehavior: 'debug',
  android: {
    // APK раздаётся напрямую с сервера, а не через Google Play
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  server: {
    // https://localhost — безопасный контекст, обязателен для
    // getUserMedia (звонки), MediaRecorder и Cache API
    //
    // url не задан → ассеты загружаются из APK (production).
    // Для dev-режима раскомментировать:
    //   url: 'http://192.168.1.155:5173',
    //   cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: '#212332',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#212332',
      overlaysWebView: true,
    },
    SystemBars: {
      // Инжектит --safe-area-inset-* в WebView — используется в index.css
      insetsHandling: 'css',
      style: 'LIGHT',
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#6366f1',
      sound: 'beep.wav',
    },
    // PowerSync: нативный SQLite (Android)
    PowerSync: {
      dbPath: 'powersync.db',
    },
  },
};

export default config;

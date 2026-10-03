/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /**
   * Абсолютный адрес бэкенда для нативных сборок (Capacitor).
   * В web-сборке не задаётся — используются относительные пути.
   * Пример: https://tg-k.ru
   */
  readonly VITE_API_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'lucide-react';

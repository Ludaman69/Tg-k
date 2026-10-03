import { create } from 'zustand';
import { IS_NATIVE } from './env';
import {
  checkForNativeUpdate,
  downloadAndInstallUpdate,
  type NativeUpdateInfo,
} from './appUpdater';

interface AppUpdateState {
  /** Есть ожидающий Service Worker (web) или новая версия APK (native) */
  updateAvailable: boolean;
  /** Пользователь нажал «Напомнить позже» — показываем мини-баннер вместо sheet */
  dismissed: boolean;
  /** Ссылка на ожидающий SW (только web) */
  waitingWorker: ServiceWorker | null;

  /** Данные нативного обновления (только native) */
  nativeUpdate: NativeUpdateInfo | null;
  /** Прогресс скачивания APK, 0..100 */
  downloadProgress: number;
  /** Идёт скачивание APK */
  downloading: boolean;
  /** Ошибка скачивания/установки */
  error: string | null;

  /**
   * Вызывается из main.tsx после регистрации SW.
   * Подписывается на updatefound → statechange, чтобы обнаружить waiting SW.
   */
  initUpdateListener: (registration: ServiceWorkerRegistration) => void;

  /**
   * Проверяет наличие новой версии APK на сервере (native).
   * Вызывать при старте приложения и при возврате из фона.
   */
  checkNativeUpdate: () => Promise<void>;

  /** Пользователь нажал «Обновить сейчас» */
  applyUpdate: () => void;

  /** Пользователь нажал «Напомнить позже» */
  dismissUpdate: () => void;
}

export const useAppUpdate = create<AppUpdateState>((set, get) => ({
  updateAvailable: false,
  dismissed: false,
  waitingWorker: null,
  nativeUpdate: null,
  downloadProgress: 0,
  downloading: false,
  error: null,

  initUpdateListener: (registration) => {
    // Если уже есть ожидающий SW (например при повторном открытии)
    if (registration.waiting) {
      set({ updateAvailable: true, waitingWorker: registration.waiting });
    }

    // Слушаем появление нового SW
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        // installed = новый SW скачан и готов, но ещё не активен
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // controller !== null → это именно обновление, а не первая установка
          set({ updateAvailable: true, waitingWorker: newWorker, dismissed: false });
        }
      });
    });
  },

  checkNativeUpdate: async () => {
    if (!IS_NATIVE) return;

    const info = await checkForNativeUpdate();
    if (info) {
      set({ updateAvailable: true, nativeUpdate: info, dismissed: false, error: null });
    }
  },

  applyUpdate: () => {
    const { waitingWorker, nativeUpdate, downloading } = get();

    // ── Нативное приложение: скачиваем APK и открываем установщик ──
    if (IS_NATIVE) {
      if (!nativeUpdate || downloading) return;

      set({ downloading: true, downloadProgress: 0, error: null });

      downloadAndInstallUpdate(nativeUpdate, (percent) => {
        set({ downloadProgress: percent });
      })
        .then(() => {
          // Установщик открыт системой — сбрасываем состояние загрузки
          set({ downloading: false, downloadProgress: 100 });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('Ошибка обновления:', msg);
          set({ downloading: false, error: msg });
        });
      return;
    }

    // ── Web (PWA): активируем ожидающий Service Worker ──
    if (!waitingWorker) return;

    // Говорим ожидающему SW активироваться
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });

    // Когда новый SW станет контроллером — перезагрузим страницу
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  },

  dismissUpdate: () => {
    set({ dismissed: true });
  },
}));
import { create } from 'zustand';
import { IS_NATIVE } from './env';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAInstallState {
  deferredPrompt: BeforeInstallPromptEvent | null;
  canInstall: boolean;
  setDeferredPrompt: (prompt: BeforeInstallPromptEvent | null) => void;
  markInstalled: () => void;
  install: () => Promise<void>;
}

export const usePWAInstall = create<PWAInstallState>((set, get) => ({
  deferredPrompt: null,
  canInstall: false,

  setDeferredPrompt: (prompt) => {
    set({ deferredPrompt: prompt, canInstall: prompt !== null });
  },

  markInstalled: () => {
    set({ deferredPrompt: null, canInstall: false });
  },

  install: async () => {
    const { deferredPrompt } = get();
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      set({ deferredPrompt: null, canInstall: false });
    }
  },
}));

/**
 * Вызвать как можно раньше (до рендера React),
 * чтобы не пропустить событие beforeinstallprompt.
 */
export function initPWAInstallListener() {
  // В нативной сборке установка PWA не имеет смысла
  if (IS_NATIVE) return;

  // Если уже в standalone — не нужно
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;

  if (isStandalone) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    usePWAInstall.getState().setDeferredPrompt(e as BeforeInstallPromptEvent);
  });

  window.addEventListener('appinstalled', () => {
    usePWAInstall.getState().markInstalled();
  });
}

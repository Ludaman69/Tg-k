import { useState, useEffect } from 'react';
import { IS_NATIVE } from './env';

const MOBILE_BREAKPOINT = 768;

export function useMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    
    // Use matchMedia for better performance
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    
    mql.addEventListener('change', handler);
    check(); // Initial check
    
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}

/**
 * Хук для определения standalone режима.
 *
 * Возвращает true как для установленного PWA, так и для нативной
 * сборки (Capacitor), где адресной строки нет по определению.
 */
export function useStandalone() {
  const [isStandalone, setIsStandalone] = useState(IS_NATIVE);

  useEffect(() => {
    if (IS_NATIVE) {
      setIsStandalone(true);
      return;
    }

    const check =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(check);
  }, []);

  return isStandalone;
}

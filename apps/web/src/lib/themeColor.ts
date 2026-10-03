/**
 * Dynamically update the <meta name="theme-color"> tag so the mobile
 * status bar & navigation bar colour matches the app.
 *
 * In PWA standalone mode Chrome uses theme-color for BOTH the top status
 * bar and the bottom system navigation bar.  Using the main surface colour
 * (#09090b) ensures the bottom bar blends seamlessly with the app content
 * (same as in a regular browser tab).
 *
 * SURFACE_SECONDARY (#212332) — sidebar / chat header background
 * SURFACE           (#09090b) — main app background (body)
 */

import { IS_NATIVE } from './env';
import { setNativeStatusBarColor } from './native';

const SURFACE_SECONDARY = '#09090b00';
const SURFACE = 'transparent';

/** Whether the app is running as an installed PWA or native app */
const IS_STANDALONE =
  IS_NATIVE ||
  (typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
     (window.navigator as any).standalone === true));

function setThemeColor(color: string) {
  // В нативной оболочке <meta theme-color> не влияет на системные панели —
  // цвет статус-бара задаётся плагином StatusBar.
  if (IS_NATIVE) {
    void setNativeStatusBarColor(color);
    return;
  }

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', color);
  }
}

/**
 * Set the status-bar / nav-bar colour to match the main app header.
 *
 * In standalone PWA we use the darker surface colour so the bottom
 * system navigation bar blends with the app background.  In a regular
 * browser tab Chrome handles this automatically.
 */
export function setHeaderThemeColor() {
  setThemeColor(IS_STANDALONE ? SURFACE : SURFACE_SECONDARY);
}

/** Set status bar to match the auth / loading background */
export function setAuthThemeColor() {
  setThemeColor(SURFACE);
}

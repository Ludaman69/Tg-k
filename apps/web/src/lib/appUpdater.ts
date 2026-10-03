import { api, type AppVersionInfo } from './api';
import { API_ORIGIN, IS_ANDROID, IS_NATIVE } from './env';

/**
 * Самообновление нативного приложения.
 *
 * APK раздаётся напрямую с сервера (не через Google Play), поэтому
 * приложение само проверяет версию, скачивает файл и открывает
 * системный установщик.
 */

export interface NativeUpdateInfo {
  versionCode: number;
  versionName: string;
  url: string;
  size?: number;
  changelog?: string[];
  mandatory?: boolean;
}

/** Возвращает versionCode установленного приложения */
export async function getInstalledVersionCode(): Promise<number | null> {
  if (!IS_NATIVE) return null;
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    // build — это versionCode на Android
    const code = Number(info.build);
    return Number.isFinite(code) ? code : null;
  } catch {
    return null;
  }
}

/** Возвращает versionName установленного приложения */
export async function getInstalledVersionName(): Promise<string | null> {
  if (!IS_NATIVE) return null;
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return info.version || null;
  } catch {
    return null;
  }
}

/**
 * Проверяет наличие новой версии на сервере.
 * Возвращает null, если обновление не требуется.
 */
export async function checkForNativeUpdate(): Promise<NativeUpdateInfo | null> {
  if (!IS_NATIVE || !IS_ANDROID) return null;

  try {
    const installed = await getInstalledVersionCode();
    if (installed === null) return null;

    const data: AppVersionInfo = await api.getAppVersion();
    const remote = data.android;
    if (!remote) return null;

    if (remote.versionCode > installed) {
      return remote;
    }
    return null;
  } catch {
    // Нет сети или endpoint не задеплоен — не мешаем работе приложения
    return null;
  }
}

/**
 * Скачивает APK и открывает системный установщик.
 *
 * @param info    данные обновления с сервера
 * @param onProgress колбэк прогресса, 0..100
 */
export async function downloadAndInstallUpdate(
  info: NativeUpdateInfo,
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (!IS_NATIVE || !IS_ANDROID) {
    throw new Error('Обновление доступно только в Android-приложении');
  }

  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { FileOpener } = await import('@capacitor-community/file-opener');

  const absoluteUrl = info.url.startsWith('http')
    ? info.url
    : `${API_ORIGIN}${info.url.startsWith('/') ? '' : '/'}${info.url}`;

  const fileName = `bkonekte-${info.versionName}.apk`;

  // Убираем возможный прошлый (частично скачанный) файл
  await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {});

  // Скачивание с прогрессом
  await Filesystem.addListener('progress', (event) => {
    if (onProgress && event.contentLength > 0) {
      onProgress(Math.round((event.bytes / event.contentLength) * 100));
    }
  });

  const result = await Filesystem.downloadFile({
    url: absoluteUrl,
    path: fileName,
    directory: Directory.Cache,
    progress: true,
  });

  await Filesystem.removeAllListeners();

  if (!result.path) {
    throw new Error('Не удалось сохранить файл обновления');
  }

  // Открываем системный установщик.
  // Требует разрешения REQUEST_INSTALL_PACKAGES и FileProvider в манифесте.
  await FileOpener.open({
    filePath: result.path,
    contentType: 'application/vnd.android.package-archive',
  });
}

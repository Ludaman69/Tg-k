import { api } from './api';
import { IS_NATIVE, IS_ANDROID, IS_IOS } from './env';

/** Последний зарегистрированный нативный push-токен (для отписки) */
let nativeToken: string | null = null;

/** Флаг защиты от параллельных / повторных регистраций */
let isRegisteringNative = false;

/** Максимальное количество попыток получения FCM-токена */
const MAX_REGISTER_RETRIES = 3;

/**
 * Регистрация нативных push-уведомлений (FCM на Android, APNs на iOS).
 * В WebView Web Push недоступен, поэтому используется платформенный механизм.
 *
 * ВАЖНО: на Android системный диалог разрешений может вызывать
 * pause/resume или даже пересоздание Activity. Без задержки после
 * диалога Capacitor-мост (JS ↔ Native) ещё не готов, и вызов
 * register() вызывает нативный краш. Поэтому:
 *   – слушатели настраиваются ДО запроса разрешения;
 *   – после получения разрешения даётся пауза 500 мс на стабилизацию;
 *   – регистрация токена обёрнута в retry-цикл.
 */
async function subscribeNativePush(): Promise<boolean> {
  // Защита от параллельных вызовов (checkAuth + login могут вызвать одновременно)
  if (isRegisteringNative) {
    console.log('[push] Регистрация уже выполняется, пропускаем повторный вызов');
    return false;
  }
  isRegisteringNative = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // ── 1. Настраиваем ВСЕ слушатели до любых операций с плагином ──
    // Это гарантирует, что события не будут потеряны или обработаны
    // некорректно при любом порядке выполнения.

    // Foreground-уведомления: без этого слушателя Capacitor-плагин
    // может упасть с нативным exception'ом при получении пуша,
    // пока приложение активно.
    PushNotifications.addListener('pushNotificationReceived', (_notification) => {
      // Ничего не делаем — плагин сам покажет уведомление согласно
      // presentationOptions в capacitor.config.json.
      // Слушатель нужен только чтобы событие считалось обработанным.
    });

    // Тап по уведомлению — открываем соответствующий экран
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const url = action.notification.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) {
        window.history.pushState({}, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    });

    // ── 2. Запрашиваем разрешение ───────────────────────────────────
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.log('[push] Разрешение на уведомления не получено:', perm.receive);
      return false;
    }

    // ── 3. Ждём стабилизации Capacitor-моста после системного диалога ──
    // На Android диалог POST_NOTIFICATIONS (API 33+) может вызывать
    // пересоздание Activity. Без этой паузы register() крашит приложение.
    await new Promise(r => setTimeout(r, 500));

    // ── 4. Получаем FCM-токен с повторными попытками ────────────────
    let token: string | null = null;

    for (let attempt = 0; attempt < MAX_REGISTER_RETRIES; attempt++) {
      if (attempt > 0) {
        // Экспоненциальная задержка между попытками: 1с, 2с, ...
        await new Promise(r => setTimeout(r, 1000 * attempt));
        console.log(`[push] Повторная попытка регистрации (${attempt + 1}/${MAX_REGISTER_RETRIES})`);
      }

      try {
        const tokenPromise = new Promise<string>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('Таймаут получения push-токена')),
            20_000,
          );

          PushNotifications.addListener('registration', (evt) => {
            clearTimeout(timer);
            resolve(evt.value);
          });

          PushNotifications.addListener('registrationError', (err) => {
            clearTimeout(timer);
            reject(new Error(String(err.error)));
          });
        });

        await PushNotifications.register();
        token = await tokenPromise;
        break; // Успех
      } catch (err) {
        console.error(`[push] Попытка ${attempt + 1} не удалась:`, err);
        if (attempt === MAX_REGISTER_RETRIES - 1) {
          throw err; // Последняя попытка — пробрасываем наверх
        }
      }
    }

    if (!token) {
      console.error('[push] Не удалось получить токен после всех попыток');
      return false;
    }

    nativeToken = token;
    await api.registerDeviceToken(token, IS_IOS ? 'ios' : 'android');
    console.log('[push] Нативный push-токен зарегистрирован');

    // Android: очищаем значок/шторку при открытии приложения
    if (IS_ANDROID) {
      await PushNotifications.removeAllDeliveredNotifications().catch(() => {});
    }

    return true;
  } catch (err) {
    console.error('[push] Ошибка регистрации нативных push:', err);
    return false;
  } finally {
    isRegisteringNative = false;
  }
}

/** Отписка от нативных push-уведомлений */
async function unsubscribeNativePush(): Promise<boolean> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    if (nativeToken) {
      await api.removeDeviceToken(nativeToken).catch(() => {});
      nativeToken = null;
    }

    await PushNotifications.removeAllListeners().catch(() => {});
    await PushNotifications.unregister().catch(() => {});
    return true;
  } catch (err) {
    console.error('Ошибка отписки от нативных push:', err);
    return false;
  }
}

/**
 * Конвертирует Base64 URL-safe строку в Uint8Array для applicationServerKey.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Запрашивает разрешение и подписывает пользователя на push-уведомления.
 * Вызывать после авторизации.
 */
export async function subscribeToPush(): Promise<boolean> {
  try {
    // В нативной сборке — FCM/APNs вместо Web Push
    if (IS_NATIVE) {
      return subscribeNativePush();
    }

    // Проверяем поддержку
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('Push-уведомления не поддерживаются в этом браузере');
      return false;
    }

    // Запрашиваем разрешение
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Разрешение на уведомления не получено:', permission);
      return false;
    }

    // Получаем VAPID public key с сервера
    const { publicKey } = await api.getVapidPublicKey();
    if (!publicKey) {
      console.warn('VAPID public key пуст — push-уведомления не настроены на сервере');
      return false;
    }

    // Ждём регистрации service worker
    const registration = await navigator.serviceWorker.ready;

    // Проверяем, есть ли уже подписка
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Создаём новую подписку
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });
    }

    // Отправляем подписку на сервер
    const subJSON = subscription.toJSON();
    await api.subscribePush(subJSON);
    console.log('Push-подписка успешно сохранена');
    return true;
  } catch (err) {
    console.error('Ошибка подписки на push:', err);
    return false;
  }
}

/**
 * Отписывается от push-уведомлений.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    if (IS_NATIVE) {
      return unsubscribeNativePush();
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      try {
        await api.unsubscribePush(endpoint);
      } catch {}
    }
    return true;
  } catch (err) {
    console.error('Ошибка отписки от push:', err);
    return false;
  }
}

/**
 * Проверяет текущий статус push-подписки.
 */
export async function getPushPermissionState(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (IS_NATIVE) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'granted') return 'granted';
      if (perm.receive === 'denied') return 'denied';
      return 'default';
    } catch {
      return 'unsupported';
    }
  }

  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission as 'granted' | 'denied' | 'default';
}
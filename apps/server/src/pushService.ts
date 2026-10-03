import webpush from 'web-push';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { prisma } from './db';

let pushEnabled = false;

/** Firebase Admin инициализирован — доступны нативные push (FCM) */
let fcmEnabled = false;
/** Ленивая ссылка на firebase-admin (не тянем модуль, если FCM не настроен) */
let fcmMessaging: import('firebase-admin/messaging').Messaging | null = null;

export function initPush() {
  if (config.vapidPublicKey && config.vapidPrivateKey) {
    webpush.setVapidDetails(
      config.vapidSubject,
      config.vapidPublicKey,
      config.vapidPrivateKey,
    );
    pushEnabled = true;
    console.log('  🔔 Web Push уведомления включены');
  } else {
    console.warn('  ⚠ VAPID ключи не заданы — Web Push отключён');
  }

  initFcm();
}

/**
 * Инициализирует Firebase Cloud Messaging для нативных приложений.
 * APK раздаётся вне Google Play, но FCM работает независимо от способа установки.
 */
function initFcm() {
  if (!config.fcmServiceAccountPath) {
    console.warn('  ⚠ FCM_SERVICE_ACCOUNT не задан — push в мобильном приложении отключены');
    return;
  }

  const saPath = path.isAbsolute(config.fcmServiceAccountPath)
    ? config.fcmServiceAccountPath
    : path.join(__dirname, '..', config.fcmServiceAccountPath);

  if (!fs.existsSync(saPath)) {
    console.warn(`  ⚠ Файл сервисного аккаунта FCM не найден: ${saPath}`);
    return;
  }

  try {
    // Требуем модули синхронно — initPush вызывается один раз при старте
    const { initializeApp, cert, getApps } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');

    const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf-8'));

    if (getApps().length === 0) {
      initializeApp({ credential: cert(serviceAccount) });
    }

    fcmMessaging = getMessaging();
    fcmEnabled = true;
    console.log('  📱 FCM push-уведомления включены (Android/iOS)');
  } catch (err) {
    console.error('  ⚠ Не удалось инициализировать FCM:', err);
  }
}

export function isPushEnabled() {
  return pushEnabled || fcmEnabled;
}

export function isFcmEnabled() {
  return fcmEnabled;
}

/**
 * Сохраняет/обновляет push-токен нативного устройства.
 */
export async function saveDeviceToken(userId: string, token: string, platform: string) {
  await prisma.deviceToken.upsert({
    where: { userId_token: { userId, token } },
    create: { userId, token, platform },
    update: { platform },
  });
}

/**
 * Удаляет push-токен нативного устройства.
 */
export async function removeDeviceToken(userId: string, token: string) {
  await prisma.deviceToken.deleteMany({ where: { userId, token } });
}

/**
 * Сохраняет/обновляет push-подписку пользователя.
 */
export async function saveSubscription(userId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await prisma.pushSubscription.upsert({
    where: {
      userId_endpoint: { userId, endpoint: subscription.endpoint },
    },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });
}

/**
 * Удаляет push-подписку пользователя.
 */
export async function removeSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });
}

/**
 * Отправляет push-уведомление всем подпискам указанных пользователей.
 * Автоматически удаляет протухшие подписки (410 Gone, 404).
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
  },
) {
  if (userIds.length === 0) return;

  // Отправляем параллельно в браузеры (Web Push) и в мобильные приложения (FCM)
  await Promise.allSettled([
    sendWebPush(userIds, payload),
    sendFcmPush(userIds, payload),
  ]);
}

/** Web Push для браузеров и установленных PWA */
async function sendWebPush(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
  },
) {
  if (!pushEnabled) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  if (subscriptions.length === 0) return;

  const payloadStr = JSON.stringify(payload);

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadStr,
          { TTL: 60 },
        );
      } catch (err: any) {
        // Подписка протухла — удаляем
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
        // Остальные ошибки не бросаем — push не критичен
      }
    }),
  );
}

/** FCM push для нативных приложений (Android/iOS) */
async function sendFcmPush(
  userIds: string[],
  payload: {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    data?: Record<string, unknown>;
  },
) {
  if (!fcmEnabled || !fcmMessaging) return;

  const devices = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
  });

  if (devices.length === 0) return;

  // FCM принимает только строковые значения в data
  const dataStrings: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.data || {})) {
    dataStrings[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }

  const isCall = payload.data?.type === 'call';

  try {
    const response = await fcmMessaging.sendEachForMulticast({
      tokens: devices.map((d) => d.token),
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: dataStrings,
      android: {
        priority: 'high',
        notification: {
          channelId: isCall ? 'bkonekte_calls' : 'bkonekte_messages',
          tag: payload.tag,
          sound: 'default',
          icon: 'ic_stat_icon',
          color: '#6366f1',
        },
        // Звонки должны доставляться мгновенно, сообщения могут ждать до минуты
        ttl: isCall ? 30_000 : 60_000,
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            ...(isCall ? { 'interruption-level': 'time-sensitive' } : {}),
          },
        },
      },
    });

    // Чистим невалидные токены (приложение удалено / токен обновлён)
    const invalidTokens: string[] = [];
    response.responses.forEach((res, i) => {
      if (res.success) return;
      const code = res.error?.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        invalidTokens.push(devices[i].token);
      }
    });

    if (invalidTokens.length > 0) {
      await prisma.deviceToken
        .deleteMany({ where: { token: { in: invalidTokens } } })
        .catch(() => {});
    }
  } catch (err) {
    console.error('FCM send error:', err);
  }
}
import dotenv from 'dotenv';
import path from 'path';
import { initEncryption } from './encrypt';

dotenv.config({ path: path.join(__dirname, '../.env') });

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET не задан в .env — нельзя запускать в production без секрета!');
  }
  console.error('  ⚠ JWT_SECRET не задан в .env — используется dev-значение. Укажите безопасный секрет в продакшене!');
}

// Initialise message encryption (AES-256-GCM)
if (process.env.ENCRYPTION_KEY) {
  initEncryption(process.env.ENCRYPTION_KEY);
  console.log('  🔒 Шифрование сообщений включено (AES-256-GCM)');
} else {
  console.warn('  ⚠ ENCRYPTION_KEY не задан — сообщения хранятся без шифрования. Для продакшена задайте 64-символьный hex-ключ.');
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  jwtSecret: process.env.JWT_SECRET || 'vortex-dev-fallback-not-for-production',
  corsOrigins: [
    ...(process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
      : ['http://localhost:5173', 'http://localhost:3000']),
    // Origins нативных приложений Capacitor.
    // Android (androidScheme: 'https') → https://localhost
    // iOS → capacitor://localhost
    // Добавляются всегда: это фиксированные внутренние origins WebView,
    // а не адреса сторонних сайтов.
    'https://localhost',
    'capacitor://localhost',
    'http://localhost',
  ],
  uploadsDir: 'uploads',
  /** Minimum password length */
  minPasswordLength: 8,
  /** Maximum registrations allowed from the same IP (permanent, DB-level) */
  maxRegistrationsPerIp: Number(process.env.MAX_REGISTRATIONS_PER_IP) || 2,
  /** TURN server URL for WebRTC calls (e.g. turn:your-domain.com:3478) */
  turnUrl: process.env.TURN_URL || '',
  /** Shared secret for TURN server (coturn static-auth-secret) */
  turnSecret: process.env.TURN_SECRET || '',
  /** STUN server URLs */
  stunUrls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',').map(s => s.trim()).filter(Boolean),
  /** VAPID keys for Web Push notifications */
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  /**
   * Раздача Android APK напрямую с сервера (без Google Play).
   * Каталог, куда складываются собранные APK, и метаданные последней версии.
   */
  downloadsDir: process.env.DOWNLOADS_DIR || 'downloads',
  /**
   * Путь к JSON-файлу сервисного аккаунта Firebase для FCM (push в native).
   * Если не задан — нативные push отключены, Web Push продолжает работать.
   */
  fcmServiceAccountPath: process.env.FCM_SERVICE_ACCOUNT || '',
};

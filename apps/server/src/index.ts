import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import mime from 'mime-types';
import { config } from './config';
import { prisma } from './db';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import chatRoutes from './routes/chats';
import messageRoutes from './routes/messages';
import storyRoutes from './routes/stories';
import friendRoutes from './routes/friends';
import linkRoutes from './routes/links';
import { setupSocket } from './socket';
import { authenticateToken, AuthRequest } from './middleware/auth';
import { decryptFileToBuffer, isEncryptionEnabled } from './encrypt';
import { UPLOADS_ROOT } from './shared';
import { initPush } from './pushService';
import pushRoutes from './routes/push';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// Trust first proxy (Nginx) so req.ip returns real client IP from X-Forwarded-For
app.set('trust proxy', 1);

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '10mb' }));

// Serve uploads — decrypts encrypted files on the fly
app.use('/uploads', (req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");

  // Resolve file path safely
  const urlPath = decodeURIComponent(req.path);
  if (urlPath.includes('..')) {
    res.status(400).end();
    return;
  }

  const filePath = path.resolve(UPLOADS_ROOT, urlPath.replace(/^\//, ''));
  if (!filePath.startsWith(UPLOADS_ROOT) || !fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }

  // Set Content-Type from extension
  const contentType = mime.lookup(filePath) || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);

  // If encryption is enabled, try to decrypt
  if (isEncryptionEnabled()) {
    const decrypted = decryptFileToBuffer(filePath);
    if (decrypted) {
      // Долгое кеширование — файлы по /uploads/ никогда не меняются (UUID в имени)
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.setHeader('Content-Length', decrypted.length);
      res.end(decrypted);
      return;
    }
    // Decryption failed — file is likely unencrypted (legacy), fall through to static
  }

  // Serve unencrypted file as-is
  next();
}, express.static(UPLOADS_ROOT, {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  },
}));

// General API rate limiter (100 req/min per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Слишком много запросов, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API маршруты — authRoutes содержит свои строгие лимитеры (loginLimiter/registerLimiter)
// Здес применяем общий apiLimiter (100/мин), чтобы /auth/me при загрузке не расходовал брутфорс-лимит
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/users', apiLimiter, authenticateToken, userRoutes);
app.use('/api/chats', apiLimiter, authenticateToken, chatRoutes);
app.use('/api/messages', apiLimiter, authenticateToken, messageRoutes);
app.use('/api/stories', apiLimiter, authenticateToken, storyRoutes);
app.use('/api/friends', apiLimiter, authenticateToken, friendRoutes);
app.use('/api/links', apiLimiter, authenticateToken, linkRoutes);
app.use('/api/push', apiLimiter, authenticateToken, pushRoutes);

// Проверка здоровья
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', name: 'Vortex Server' });
});

// ─── Раздача Android APK напрямую с сервера (без Google Play) ─────────
//
// Метаданные читаются из <downloads>/version.json, который обновляется
// скриптом публикации. Формат:
// {
//   "android": {
//     "versionCode": 200,
//     "versionName": "2.0.0",
//     "fileName": "bkonekte-2.0.0.apk",
//     "changelog": ["..."],
//     "mandatory": false
//   }
// }
const DOWNLOADS_ROOT = path.isAbsolute(config.downloadsDir)
  ? config.downloadsDir
  : path.join(__dirname, '..', config.downloadsDir);

app.get('/api/app-version', (_req, res) => {
  try {
    const metaPath = path.join(DOWNLOADS_ROOT, 'version.json');
    if (!fs.existsSync(metaPath)) {
      res.json({ android: null });
      return;
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const android = meta.android;

    if (!android?.versionCode || !android?.fileName) {
      res.json({ android: null });
      return;
    }

    // Проверяем, что APK действительно лежит на диске
    const apkPath = path.join(DOWNLOADS_ROOT, path.basename(android.fileName));
    if (!fs.existsSync(apkPath)) {
      res.json({ android: null });
      return;
    }

    res.json({
      android: {
        versionCode: Number(android.versionCode),
        versionName: String(android.versionName || ''),
        url: `/downloads/${path.basename(android.fileName)}`,
        size: fs.statSync(apkPath).size,
        changelog: Array.isArray(android.changelog) ? android.changelog : [],
        mandatory: android.mandatory === true,
      },
    });
  } catch (err) {
    console.error('app-version error:', err);
    res.json({ android: null });
  }
});

// Статическая раздача APK-файлов
app.use(
  '/downloads',
  (req, res, next) => {
    // Разрешаем только .apk — каталог не должен стать файлопомойкой
    if (!req.path.toLowerCase().endsWith('.apk')) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    // Имя файла содержит версию, поэтому кешировать можно надолго
    res.setHeader('Cache-Control', 'public, max-age=86400');
    next();
  },
  express.static(DOWNLOADS_ROOT, { acceptRanges: true }),
);

// ICE серверы для WebRTC звонков
app.get('/api/ice-servers', authenticateToken, (_req: AuthRequest, res) => {
  const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [];

  // STUN серверы
  if (config.stunUrls.length > 0) {
    iceServers.push({ urls: config.stunUrls });
  }

  // TURN сервер с временными credentials (coturn --use-auth-secret)
  if (config.turnUrl && config.turnSecret) {
    const ttl = 24 * 3600; // 24 часа
    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}:vortex`;
    const credential = crypto
      .createHmac('sha1', config.turnSecret)
      .update(username)
      .digest('base64');

    // Основной TURN/UDP
    iceServers.push({
      urls: config.turnUrl,
      username,
      credential,
    });

    // TURN over TCP (для сетей где UDP заблокирован)
    iceServers.push({
      urls: config.turnUrl + '?transport=tcp',
      username,
      credential,
    });

    // TURN over TLS (для максимальной совместимости через файрволы)
    // Заменяем turn: на turns: и порт 3478 на 5349
    const turnsUrl = config.turnUrl
      .replace(/^turn:/, 'turns:')
      .replace(':3478', ':5349');
    iceServers.push({
      urls: turnsUrl + '?transport=tcp',
      username,
      credential,
    });
  }

  res.json({ iceServers });
});

// Инициализируем Web Push
initPush();

// Socket.io
setupSocket(io);

// При старте сервера сбросить всех в offline
prisma.user.updateMany({ data: { isOnline: false, lastSeen: new Date() } })
  .then(() => console.log('  ✔ Все пользователи сброшены в offline'))
  .catch((e: unknown) => console.error('Ошибка сброса онлайн-статусов:', e));

// Cleanup expired stories (every 10 minutes)
import { deleteUploadedFile } from './shared';

async function cleanupExpiredStories() {
  try {
    const expired = await prisma.story.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true, mediaUrl: true },
    });

    if (expired.length === 0) return;

    for (const story of expired) {
      if (story.mediaUrl) deleteUploadedFile(story.mediaUrl);
    }

    const ids = expired.map(s => s.id);
    // Cascade handles StoryView deletion via schema onDelete: Cascade
    await prisma.story.deleteMany({ where: { id: { in: ids } } });

    console.log(`  🗑 Удалено ${expired.length} истёкших историй`);
  } catch (e) {
    console.error('Story cleanup error:', e);
  }
}

cleanupExpiredStories();
setInterval(cleanupExpiredStories, 10 * 60 * 1000);

// В production — раздаём собранный фронтенд (apps/web/dist)
if (process.env.NODE_ENV === 'production') {
  const webDist = path.join(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));

    // Явный маршрут для Digital Asset Links (TWA верификация)
    // — ДО SPA fallback, чтобы отдавать правильный Content-Type
    // Сначала ищет файл в статике, потом в android/.well-known/, иначе — отдаёт встроенный JSON
    app.get('/.well-known/assetlinks.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');

      // 1) Проверяем в папке статики (web/dist/.well-known/)
      const staticPath = path.join(webDist, '.well-known', 'assetlinks.json');
      if (fs.existsSync(staticPath)) {
        res.sendFile(staticPath);
        return;
      }

      // 2) Проверяем в android-twa/.well-known/ (относительно корня проекта)
      const androidPath = path.resolve(__dirname, '../../android-twa/.well-known/assetlinks.json');
      if (fs.existsSync(androidPath)) {
        res.sendFile(androidPath);
        return;
      }

      // 3) Если файла нет нигде — отдаём встроенный JSON (SHA256 из bkonekte-release.keystore)
      res.json([{
        relation: [
          'delegate_permission/common.handle_all_urls',
          'delegate_permission/common.use_as_origin',
        ],
        target: {
          namespace: 'android_app',
          package_name: 'com.bkonekte.app',
          sha256_cert_fingerprints: [
            'AD:60:ED:2D:37:BB:73:85:30:29:3D:DA:92:C3:0C:29:F6:C2:09:E2:9B:F6:66:70:0E:C1:67:4B:6D:10:43:E7',
          ],
        },
      }]);
    });

    // SPA fallback — все неизвестные маршруты отдают index.html
    // ВАЖНО: '/*' ДОЛЖЕН БЫТЬ ПОСЛЕДНИМ маршрутом
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'), (err) => {
        if (err) res.status(404).end();
      });
    });

    console.log(`  📦 Фронтенд раздаётся из ${webDist}`);
  } else {
    console.warn('  ⚠ Папка web/dist не найдена — фронтенд не раздаётся. Соберите: npm run build -w apps/web');
  }
}

server.listen(config.port, () => {
  console.log(`\n  ⚡ Vortex Server запущен на порту ${config.port}\n`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\n  Завершение работы...');
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

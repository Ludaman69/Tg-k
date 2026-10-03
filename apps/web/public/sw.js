const CACHE_NAME = 'bkonekte-v10.40';
const MEDIA_CACHE_NAME = 'bkonekte-media-v1';
const API_CACHE_NAME = 'bkonekte-api-v1';
const MEDIA_CACHE_LIMIT = 200; // Максимум записей в медиа-кеше
const API_CACHE_LIMIT = 500;   // Максимум записей в API-кеше
const STATIC_ASSETS = [
  '/',
  '/logo.png',
  '/logo.jpg',
  '/vortex.svg',
];

// ─── Управление размером кешей ──────────────────────────────────────────
/** Удаляет самые старые записи из кеша, если превышен лимит. */
async function trimCache(cacheName: string, limit: number) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  const toDelete = keys.slice(0, keys.length - limit);
  await Promise.all(toDelete.map((req) => cache.delete(req)));
}

// Install — кешируем статику
// НЕ вызываем self.skipWaiting() — новый SW ждёт, пока пользователь
// нажмёт «Обновить» в UI (soft update prompt).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate — чистим старые кеши, но сохраняем статический, медиа и API
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== MEDIA_CACHE_NAME && key !== API_CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Пропускаем WebSocket
  if (request.url.includes('/socket.io/')) return;

  // ── API GET-запросы: Cache First + фоновая ревалидация ─────
  // Мгновенно отдаём закешированный ответ (чаты/сообщения/пользователи),
  // и параллельно обновляем из сети. При отсутствии кеша — ждём сеть.
  if (request.url.includes('/api/') && request.method === 'GET') {
    event.respondWith(
      caches.open(API_CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put(request, response.clone()).then(() => trimCache(API_CACHE_NAME, API_CACHE_LIMIT)).catch(() => {});
              }
              return response;
            })
            .catch(() => cached || new Response(JSON.stringify({ error: 'Нет соединения' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }));

          // Есть кеш → отдаём мгновенно, сеть обновит в фоне
          // Нет кеша → ждём сеть
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // ── Не-GET запросы к API — не кешируем ──────────────────────
  if (request.url.includes('/api/')) return;

  // ── Uploads (аватары, медиа): Cache First + фоновая ревалидация ──
  if (request.url.includes('/uploads/')) {
    event.respondWith(
      caches.open(MEDIA_CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put(request, response.clone()).then(() => trimCache(MEDIA_CACHE_NAME, MEDIA_CACHE_LIMIT)).catch(() => {});
              }
              return response;
            })
            .catch(() => cached || new Response('Offline', { status: 503 }));

          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // ── Navigation: Cache First + фоновая ревалидация ─────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match('/').then((cached) => {
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response.ok) {
                cache.put('/', response.clone());
              }
              return response;
            })
            .catch(() => cached || new Response('Offline', { status: 503 }));

          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // ── Остальное: Cache First (JS/CSS/шрифты) ─────────────────
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok && response.type !== 'opaque') {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached || new Response('Offline', { status: 503 }));

        return cached || fetchPromise;
      })
    )
  );
});

// ─── Отслеживание активного чата per-client ──────────────────────────────
// Каждый клиент (вкладка браузера / PWA-окно) отправляет:
//   { type: 'SET_ACTIVE_CHAT', chatId: '...' | null }
// SW хранит Map<clientId, chatId> чтобы корректно работать,
// даже если одновременно открыты несколько окон (браузер + PWA).
const _activeChats = new Map(); // clientId → chatId | null

self.addEventListener('message', (event) => {
  // Пользователь нажал «Обновить» → активируем ожидающий SW
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data && event.data.type === 'SET_ACTIVE_CHAT') {
    const clientId = event.source && event.source.id;
    if (clientId) {
      _activeChats.set(clientId, event.data.chatId || null);
    }
  }
});

// ─── Push-уведомления ───────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Bkonekte', body: event.data.text() };
  }

  const title = payload.title || 'Bkonekte';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/logo.png',
    badge: payload.badge || '/logo.png',
    tag: payload.tag || 'bkonekte-notification',
    renotify: true,
    vibrate: [200, 100, 200],
    data: payload.data || {},
    actions: [],
  };

  // Для звонков добавляем кнопки
  if (payload.data && (payload.data.type === 'call' || payload.data.type === 'missed_call')) {
    options.requireInteraction = true;
    options.vibrate = [300, 100, 300, 100, 300];
  }

  // Подавляем push-уведомление о сообщении, если пользователь смотрит
  // именно этот чат в фокусированном окне/вкладке (браузер или PWA)
  const incomingChatId = payload.data && payload.data.chatId;
  const isMessagePush = payload.data && payload.data.type === 'message';

  event.waitUntil(
    (async () => {
      if (isMessagePush && incomingChatId) {
        const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

        // Чистим устаревшие записи — убираем клиентов, которых больше нет
        const aliveIds = new Set(allClients.map((c) => c.id));
        for (const id of _activeChats.keys()) {
          if (!aliveIds.has(id)) _activeChats.delete(id);
        }

        // Проверяем, есть ли хотя бы один видимый и сфокусированный клиент,
        // у которого открыт именно этот чат
        const isChatVisibleInAnyClient = allClients.some((client) => {
          if (client.visibilityState !== 'visible') return false;
          const clientChatId = _activeChats.get(client.id);
          return clientChatId === incomingChatId;
        });

        if (isChatVisibleInAnyClient) {
          // Пользователь прямо сейчас смотрит этот чат — не показываем push
          return;
        }
      }

      await self.registration.showNotification(title, options);
    })()
  );
});

// Клик по push-уведомлению — открываем/фокусируем приложение
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Если уже есть открытое окно — фокусируемся на него
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Иначе открываем новое
      return self.clients.openWindow(urlToOpen);
    })
  );
});

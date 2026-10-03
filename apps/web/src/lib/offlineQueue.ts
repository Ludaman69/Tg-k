/**
 * Офлайн-очередь сообщений.
 *
 * Когда сокет не подключен (нет интернета), сообщения сохраняются
 * в локальную PowerSync БД. При восстановлении соединения они
 * автоматически отправляются на сервер.
 *
 * Поддерживает:
 *   - Текстовые сообщения
 *   - Reply (ответ на сообщение)
 *   - Отложенные сообщения (scheduled)
 *   - Медиа-сообщения БЕЗ файлов (файлы требуют предварительной загрузки,
 *     которая недоступна офлайн — они пропускаются)
 */

import { getDb } from './powersync';

export interface OfflineMessage {
  id: string;          // temp-{timestamp}-{random}
  chatId: string;
  content: string | null;
  type: string;        // 'text' | 'image' | 'video' | 'file' | 'audio'
  replyToId: string | null;
  quote: string | null;
  scheduledAt: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  fileName: string | null;
  fileSize: number | null;
  thumbnail: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  retries: number;
}

/** Генерирует временный ID для офлайн-сообщения */
export function generateTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Добавить сообщение в офлайн-очередь */
export async function enqueueOfflineMessage(msg: Omit<OfflineMessage, 'retries'>): Promise<void> {
  const db = getDb();

  if (!db) {
    // Fallback: сохраняем в localStorage
    const queue = JSON.parse(localStorage.getItem('vortex_offline_queue') || '[]');
    queue.push({ ...msg, retries: 0 });
    localStorage.setItem('vortex_offline_queue', JSON.stringify(queue));
    console.log('[OfflineQueue] Сообщение сохранено в localStorage (PowerSync недоступен)');
    return;
  }

  try {
    await db.waitForReady();
    await db.execute(
      `INSERT OR REPLACE INTO OfflineQueue
       (id, chatId, content, type, replyToId, quote, scheduledAt,
        mediaUrl, mediaType, fileName, fileSize, thumbnail, width, height, createdAt, retries)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        msg.id, msg.chatId, msg.content, msg.type, msg.replyToId, msg.quote, msg.scheduledAt,
        msg.mediaUrl, msg.mediaType, msg.fileName, msg.fileSize, msg.thumbnail,
        msg.width, msg.height, msg.createdAt, 0,
      ],
    );
    console.log('[OfflineQueue] Сообщение сохранено в PowerSync:', msg.id);
  } catch (e) {
    console.warn('[OfflineQueue] Ошибка сохранения в PowerSync:', e);
    // Fallback: localStorage
    const queue = JSON.parse(localStorage.getItem('vortex_offline_queue') || '[]');
    queue.push({ ...msg, retries: 0 });
    localStorage.setItem('vortex_offline_queue', JSON.stringify(queue));
  }
}

/** Получить все сообщения из очереди */
export async function getOfflineQueue(): Promise<OfflineMessage[]> {
  const db = getDb();

  if (!db) {
    return JSON.parse(localStorage.getItem('vortex_offline_queue') || '[]');
  }

  try {
    await db.waitForReady();
    const rows = await db.getAll<OfflineMessage>('SELECT * FROM OfflineQueue ORDER BY createdAt ASC');
    return rows;
  } catch {
    return JSON.parse(localStorage.getItem('vortex_offline_queue') || '[]');
  }
}

/** Получить количество сообщений в очереди */
export async function getOfflineQueueCount(): Promise<number> {
  const db = getDb();

  if (!db) {
    return JSON.parse(localStorage.getItem('vortex_offline_queue') || '[]').length;
  }

  try {
    await db.waitForReady();
    const rows = await db.getAll<{ cnt: number }>('SELECT COUNT(*) as cnt FROM OfflineQueue');
    return rows[0]?.cnt || 0;
  } catch {
    return JSON.parse(localStorage.getItem('vortex_offline_queue') || '[]').length;
  }
}

/** Удалить сообщение из очереди */
export async function removeFromOfflineQueue(tempId: string): Promise<void> {
  const db = getDb();

  if (!db) {
    const queue = JSON.parse(localStorage.getItem('vortex_offline_queue') || '[]');
    localStorage.setItem('vortex_offline_queue',
      JSON.stringify(queue.filter((m: OfflineMessage) => m.id !== tempId)));
    return;
  }

  try {
    await db.waitForReady();
    await db.execute('DELETE FROM OfflineQueue WHERE id = ?', [tempId]);
  } catch {
    // Игнорируем
  }
}

/** Удалить ВСЕ сообщения из очереди для чата */
export async function clearChatQueue(chatId: string): Promise<void> {
  const db = getDb();

  if (!db) {
    const queue = JSON.parse(localStorage.getItem('vortex_offline_queue') || '[]');
    localStorage.setItem('vortex_offline_queue',
      JSON.stringify(queue.filter((m: OfflineMessage) => m.chatId !== chatId)));
    return;
  }

  try {
    await db.waitForReady();
    await db.execute('DELETE FROM OfflineQueue WHERE chatId = ?', [chatId]);
  } catch {
    // Игнорируем
  }
}

/** Обновить счётчик попыток для сообщения */
export async function incrementRetries(tempId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.waitForReady();
    await db.execute('UPDATE OfflineQueue SET retries = retries + 1 WHERE id = ?', [tempId]);
  } catch { /* игнорируем */ }
}
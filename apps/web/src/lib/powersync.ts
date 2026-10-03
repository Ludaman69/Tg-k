import { PowerSyncDatabase } from '@powersync/capacitor';
import { column, Schema, Table } from '@powersync/common';
import type { PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/common';
import { API_ORIGIN } from './env';

/**
 * PowerSync-клиент для офлайн-синхронизации.
 *
 * Использует @powersync/web (WASM SQLite в браузере) и
 * @powersync/capacitor (нативный SQLite в Android APK).
 */

// ─── Схема таблиц (совпадает с Prisma schema) ─────────────────────────

const appSchema = new Schema({
  User: new Table({
    id: column.text,
    username: column.text,
    displayName: column.text,
    avatar: column.text,
    bio: column.text,
    lastSeen: column.text,
    isOnline: column.integer,
  }),
  Chat: new Table({
    id: column.text,
    type: column.text,
    name: column.text,
    avatar: column.text,
    createdAt: column.text,
  }),
  ChatMember: new Table({
    id: column.text,
    chatId: column.text,
    userId: column.text,
    role: column.text,
    joinedAt: column.text,
    isMuted: column.integer,
    isArchived: column.integer,
    isPinned: column.integer,
    clearedAt: column.text,
  }),
  Message: new Table({
    id: column.text,
    chatId: column.text,
    senderId: column.text,
    content: column.text,
    type: column.text,
    replyToId: column.text,
    isEdited: column.integer,
    isDeleted: column.integer,
    scheduledAt: column.text,
    createdAt: column.text,
    updatedAt: column.text,
  }),
  Reaction: new Table({
    id: column.text,
    messageId: column.text,
    userId: column.text,
    emoji: column.text,
    createdAt: column.text,
  }),
  ReadReceipt: new Table({
    id: column.text,
    messageId: column.text,
    userId: column.text,
    readAt: column.text,
  }),
  Friendship: new Table({
    id: column.text,
    userId: column.text,
    friendId: column.text,
    status: column.text,
    createdAt: column.text,
    updatedAt: column.text,
  }),
  Media: new Table({
    id: column.text,
    messageId: column.text,
    type: column.text,
    url: column.text,
    filename: column.text,
    thumbnail: column.text,
    size: column.integer,
  }),
  // Офлайн-очередь неотправленных сообщений
  OfflineQueue: new Table({
    id: column.text,
    chatId: column.text,
    content: column.text,
    type: column.text,
    replyToId: column.text,
    quote: column.text,
    scheduledAt: column.text,
    mediaUrl: column.text,
    mediaType: column.text,
    fileName: column.text,
    fileSize: column.integer,
    thumbnail: column.text,
    width: column.integer,
    height: column.integer,
    createdAt: column.text,
    retries: column.integer,
  }),
});

// ─── PowerSync БД ─────────────────────────────────────────────────────

/** URL PowerSync-сервиса (через Nginx-прокси или напрямую) */
const POWERSYNC_URL = (import.meta as any).env?.VITE_POWERSYNC_URL || '';

/** Включёна ли синхронизация (URL задан) */
const isPowerSyncConfigured = POWERSYNC_URL.length > 0;

/**
 * Локальная PowerSync БД (SQLite).
 *
 * Создаётся ВСЕГДА — независимо от настроек синхронизации.
 * На нативе (Capacitor) используется нативный SQLite,
 * в браузере — WASM SQLite (@powersync/web).
 *
 * Без POWERSYNC_URL БД работает как чистый локальный кеш
 * (чтение/запись через getCached/upsert), без сетевой синхронизации.
 */
let db: PowerSyncDatabase | null = null;
let dbInitError = false;

export function getDb(): PowerSyncDatabase | null {
  if (dbInitError) return null;
  if (!db) {
    try {
      db = new PowerSyncDatabase({
        database: { dbFilename: 'powersync.db' },
        schema: appSchema,
      });
      console.log('[PowerSync] Локальная БД создана (always-on кеш)');
    } catch (e) {
      console.error('[PowerSync] Ошибка создания БД:', e);
      dbInitError = true;
      return null;
    }
  }
  return db;
}

// ─── Токен авторизации ────────────────────────────────────────────────

let authToken: string | null = null;

/** Установить токен для PowerSync (вызвать при логине/логауте) */
export function setPowerSyncToken(token: string | null) {
  authToken = token;
}

// ─── Backend Connector ─────────────────────────────────────────────────

class VortexConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    if (!authToken) return null;
    return {
      endpoint: POWERSYNC_URL,
      token: authToken,
    };
  }

  async uploadData(database: any) {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    // Отправляем локальные изменения на бэкенд через API
    for (const op of transaction.crud) {
      try {
        const { id, ...data } = op.opData;
        const tableName = op.table;
        const type = op.op;

        await fetch(`${API_ORIGIN}/api/sync/${tableName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ type, id, data }),
        });
      } catch (err) {
        console.warn('[PowerSync] uploadData error:', err);
      }
    }

    await transaction.complete();
  }
}

// ─── Инициализация ────────────────────────────────────────────────────

let initialized = false;

/**
 * Подключить PowerSync-синхронизацию с сервером.
 *
 * Сама БД уже создана и используется для локального кеша.
 * Эта функция запускает синхронизацию только если задан POWERSYNC_URL.
 */
export async function initPowerSync() {
  if (initialized) return;
  if (!isPowerSyncConfigured) {
    console.log('[PowerSync] VITE_POWERSYNC_URL не задан — сетевая синхронизация пропущена (только локальный кеш)');
    return;
  }
  if (!authToken) {
    console.warn('[PowerSync] Нет токена — синхронизация не запущена');
    return;
  }

  try {
    const powerDb = getDb();
    if (!powerDb) return;
    const connector = new VortexConnector();
    await powerDb.connect(connector);
    console.log('[PowerSync] Подключено, синхронизация запущена');
    initialized = true;
  } catch (e) {
    console.error('[PowerSync] Ошибка подключения синхронизации:', e);
  }
}

/** Отключить PowerSync и очистить локальные данные (при логауте) */
export async function disconnectPowerSync() {
  const powerDb = getDb();
  if (!powerDb) return;

  if (initialized) {
    try {
      await powerDb.disconnectAndClear({ clearLocal: true });
      initialized = false;
      console.log('[PowerSync] Отключено, локальные данные очищены');
    } catch (e) {
      console.error('[PowerSync] Ошибка отключения:', e);
    }
  } else {
    // БД создана, но синхронизация не запущена — всё равно чистим локальные данные
    try {
      await powerDb.waitForReady();
      await powerDb.execute('DELETE FROM Message');
      await powerDb.execute('DELETE FROM Chat');
      await powerDb.execute('DELETE FROM ChatMember');
      await powerDb.execute('DELETE FROM User');
      await powerDb.execute('DELETE FROM Reaction');
      await powerDb.execute('DELETE FROM ReadReceipt');
      await powerDb.execute('DELETE FROM Friendship');
      await powerDb.execute('DELETE FROM Media');
      console.log('[PowerSync] Локальный кеш очищен');
    } catch (e) {
      console.error('[PowerSync] Ошибка очистки кеша:', e);
    }
  }
}

// ─── CRUD-хелперы для чтения/записи из локального SQLite ──────────────

/** Row-тип Message из PowerSync (примитивные поля, без вложенных объектов) */
interface MessageRow {
  id: string;
  chatId: string;
  senderId: string;
  content: string | null;
  type: string;
  replyToId: string | null;
  isEdited: number;
  isDeleted: number;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

/** Row-тип Chat из PowerSync */
interface ChatRow {
  id: string;
  type: string;
  name: string | null;
  avatar: string | null;
  createdAt: string;
}

/** Row-тип ChatMember из PowerSync */
interface ChatMemberRow {
  id: string;
  chatId: string;
  userId: string;
  role: string;
  joinedAt: string;
  isMuted: number;
  isArchived: number;
  isPinned: number;
  clearedAt: string | null;
}

/** Row-тип User из PowerSync */
interface UserRow {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
  lastSeen: string;
  isOnline: number;
}

/** Row-тип Media из PowerSync */
interface MediaRow {
  id: string;
  messageId: string;
  type: string;
  url: string;
  filename: string | null;
  thumbnail: string | null;
  size: number | null;
}

/** Row-тип Reaction из PowerSync */
interface ReactionRow {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

/** Row-тип ReadReceipt из PowerSync */
interface ReadReceiptRow {
  id: string;
  messageId: string;
  userId: string;
  readAt: string;
}

/** Row-тип Friendship из PowerSync */
interface FriendshipRow {
  id: string;
  userId: string;
  friendId: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
}
// ─── Сообщения ─────────────────────────────────────────

/** Получить сообщения чата из локального кеша (последние N, до курсора) */
export async function getCachedMessages(
  chatId: string,
  limit = 50,
  before?: string,
): Promise<MessageRow[]> {
  const powerDb = getDb();
  if (!powerDb) return [];
  try {
    await powerDb.waitForReady();
    const sql = before
      ? 'SELECT * FROM Message WHERE chatId = ? AND isDeleted = 0 AND createdAt < ? ORDER BY createdAt DESC LIMIT ?'
      : 'SELECT * FROM Message WHERE chatId = ? AND isDeleted = 0 ORDER BY createdAt DESC LIMIT ?';
    const params: any[] = before ? [chatId, before, limit] : [chatId, limit];
    const rows = await powerDb.getAll<MessageRow>(sql, params);
    if (rows.length > 0) {
      console.log(`[PowerSync] Кеш сообщений для ${chatId}: ${rows.length} шт.`);
    }
    return rows.reverse();
  } catch {
    return [];
  }
}

/** Записать/обновить сообщения в локальном кеше */
export async function upsertMessages(rows: MessageRow[]): Promise<void> {
  if (rows.length === 0) return;
  const powerDb = getDb();
  if (!powerDb) return;
  try {
    await powerDb.waitForReady();
    for (const row of rows) {
      await powerDb.execute(
        `INSERT OR REPLACE INTO Message (id, chatId, senderId, content, type, replyToId, isEdited, isDeleted, scheduledAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.chatId, row.senderId, row.content, row.type, row.replyToId,
         row.isEdited ? 1 : 0, row.isDeleted ? 1 : 0, row.scheduledAt, row.createdAt, row.updatedAt],
      );
    }
    console.log(`[PowerSync] Сохранено ${rows.length} сообщений в кеш`);
  } catch (e) {
    console.warn('[PowerSync] upsertMessages error:', e);
  }
}

/** Удалить сообщение из локального кеша (soft-delete) */
export async function softDeleteMessage(messageId: string): Promise<void> {
  const powerDb = getDb();
  if (!powerDb) return;
  try {
    await powerDb.waitForReady();
    await powerDb.execute(
      `UPDATE Message SET isDeleted = 1, content = NULL WHERE id = ?`,
      [messageId],
    );
  } catch (e) {
    console.warn('[PowerSync] softDeleteMessage error:', e);
  }
}

// ─── Чаты ──────────────────────────────────────────

/** Получить все чаты из локального кеша */
export async function getCachedChats(): Promise<ChatRow[]> {
  const powerDb = getDb();
  if (!powerDb) return [];
  try {
    await powerDb.waitForReady();
    return await powerDb.getAll<ChatRow>('SELECT * FROM Chat ORDER BY createdAt DESC');
  } catch {
    return [];
  }
}

/** Записать/обновить чаты в локальном кеше */
export async function upsertChats(rows: ChatRow[]): Promise<void> {
  if (rows.length === 0) return;
  const powerDb = getDb();
  if (!powerDb) return;
  try {
    await powerDb.waitForReady();
    for (const row of rows) {
      await powerDb.execute(
        `INSERT OR REPLACE INTO Chat (id, type, name, avatar, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        [row.id, row.type, row.name, row.avatar, row.createdAt],
      );
    }
  } catch (e) {
    console.warn('[PowerSync] upsertChats error:', e);
  }
}

// ─── Участники чатов ────────────────────────────

/** Получить участников чата из локального кеша */
export async function getCachedChatMembers(chatId: string): Promise<ChatMemberRow[]> {
  const powerDb = getDb();
  if (!powerDb) return [];
  try {
    await powerDb.waitForReady();
    return await powerDb.getAll<ChatMemberRow>(
      'SELECT * FROM ChatMember WHERE chatId = ?',
      [chatId],
    );
  } catch {
    return [];
  }
}

/** Записать/обновить участников чата в локальном кеше */
export async function upsertChatMembers(rows: ChatMemberRow[]): Promise<void> {
  if (rows.length === 0) return;
  const powerDb = getDb();
  if (!powerDb) return;
  try {
    await powerDb.waitForReady();
    for (const row of rows) {
      await powerDb.execute(
        `INSERT OR REPLACE INTO ChatMember (id, chatId, userId, role, joinedAt, isMuted, isArchived, isPinned, clearedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.chatId, row.userId, row.role, row.joinedAt,
         row.isMuted ? 1 : 0, row.isArchived ? 1 : 0, row.isPinned ? 1 : 0, row.clearedAt],
      );
    }
  } catch (e) {
    console.warn('[PowerSync] upsertChatMembers error:', e);
  }
}

// ─── Пользователи ───────────────────────────

/** Получить пользователя из локального кеша */
export async function getCachedUser(userId: string): Promise<UserRow | null> {
  const powerDb = getDb();
  if (!powerDb) return null;
  try {
    await powerDb.waitForReady();
    const rows = await powerDb.getAll<UserRow>('SELECT * FROM User WHERE id = ?', [userId]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

/** Записать/обновить пользователей в локальном кеше */
export async function upsertUsers(rows: UserRow[]): Promise<void> {
  if (rows.length === 0) return;
  const powerDb = getDb();
  if (!powerDb) return;
  try {
    await powerDb.waitForReady();
    for (const row of rows) {
      await powerDb.execute(
        `INSERT OR REPLACE INTO User (id, username, displayName, avatar, bio, lastSeen, isOnline)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.username, row.displayName, row.avatar, row.bio,
         row.lastSeen, row.isOnline ? 1 : 0],
      );
    }
  } catch (e) {
    console.warn('[PowerSync] upsertUsers error:', e);
  }
}

// ─── Медиа ────────────────────────────

/** Получить медиа-файлы сообщения из локального кеша */
export async function getCachedMedia(messageId: string): Promise<MediaRow[]> {
  const powerDb = getDb();
  if (!powerDb) return [];
  try {
    await powerDb.waitForReady();
    return await powerDb.getAll<MediaRow>('SELECT * FROM Media WHERE messageId = ?', [messageId]);
  } catch {
    return [];
  }
}

/** Записать/обновить медиа в локальном кеше */
export async function upsertMedia(rows: MediaRow[]): Promise<void> {
  if (rows.length === 0) return;
  const powerDb = getDb();
  if (!powerDb) return;
  try {
    await powerDb.waitForReady();
    for (const row of rows) {
      await powerDb.execute(
        `INSERT OR REPLACE INTO Media (id, messageId, type, url, filename, thumbnail, size)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.messageId, row.type, row.url, row.filename, row.thumbnail, row.size],
      );
    }
  } catch (e) {
    console.warn('[PowerSync] upsertMedia error:', e);
  }
}

// ─── Реакции ──

/** Получить реакции сообщения из локального кеша */
export async function getCachedReactions(messageId: string): Promise<ReactionRow[]> {
  const powerDb = getDb();
  if (!powerDb) return [];
  try {
    await powerDb.waitForReady();
    return await powerDb.getAll<ReactionRow>('SELECT * FROM Reaction WHERE messageId = ?', [messageId]);
  } catch {
    return [];
  }
}

// ─── Read receipts ──

/** Получить read receipts сообщения из локального кеша */
export async function getCachedReadReceipts(messageId: string): Promise<ReadReceiptRow[]> {
  const powerDb = getDb();
  if (!powerDb) return [];
  try {
    await powerDb.waitForReady();
    return await powerDb.getAll<ReadReceiptRow>('SELECT * FROM ReadReceipt WHERE messageId = ?', [messageId]);
  } catch {
    return [];
  }
}
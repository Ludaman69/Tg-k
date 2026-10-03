import { create } from 'zustand';
import { api } from '../lib/api';
import { useAuthStore } from './authStore';
import { getCachedMessages, getCachedChats, upsertMessages, upsertChats } from '../lib/powersync';
import {
  enqueueOfflineMessage,
  getOfflineQueue,
  removeFromOfflineQueue,
  generateTempId,
} from '../lib/offlineQueue';
import { getSocket } from '../lib/socket';
import type { Chat, ChatMember, Message, TypingUser } from '../lib/types';

/** Количество сообщений, загружаемых за один раз (совпадает с лимитом сервера по умолчанию). */
export const PAGE_SIZE = 50;

/**
 * Мержит две уже отсортированные по createdAt последовательности сообщений
 * за один проход (O(n+m)) и отбрасывает дубликаты по id.
 *
 * Раньше здесь был `[...a, ...b].sort()` с `new Date(...)` внутри компаратора:
 * на каждое сравнение создавалось два объекта Date, т.е. десятки тысяч аллокаций
 * на страницу — заметная задержка и GC-фризы при подгрузке истории.
 */
function mergeSortedMessages(older: Message[], newer: Message[]): Message[] {
  if (older.length === 0) return newer;
  if (newer.length === 0) return older;

  const seen = new Set<string>();
  const result: Message[] = [];
  let i = 0;
  let j = 0;

  const push = (msg: Message) => {
    if (seen.has(msg.id)) return;
    seen.add(msg.id);
    result.push(msg);
  };

  while (i < older.length && j < newer.length) {
    // Timestamps в ISO-8601 с одинаковой точностью сравнимы лексикографически,
    // поэтому обходимся без создания Date.
    if (older[i].createdAt <= newer[j].createdAt) push(older[i++]);
    else push(newer[j++]);
  }
  while (i < older.length) push(older[i++]);
  while (j < newer.length) push(newer[j++]);

  return result;
}

interface ChatState {
  chats: Chat[];
  activeChat: string | null;
  messages: Record<string, Message[]>;
  pinnedMessages: Record<string, Message>;
  typingUsers: TypingUser[];
  replyTo: Message | null;
  editingMessage: Message | null;
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
  hasMoreMessages: Record<string, boolean>;
  loadingMoreMessages: Record<string, boolean>;
  searchQuery: string;
  drafts: Record<string, string>;
  isOffline: boolean;
  isSyncing: boolean;

  setActiveChat: (chatId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setDraft: (chatId: string, text: string) => void;
  getDraft: (chatId: string) => string;
  setOffline: (offline: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  loadMoreMessages: (chatId: string) => Promise<void>;
  flushOfflineQueue: () => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string, chatId: string) => void;
  removeMessages: (messageIds: string[], chatId: string) => void;
  hideMessages: (messageIds: string[], chatId: string) => void;
  addReaction: (messageId: string, chatId: string, userId: string, username: string, emoji: string) => void;
  removeReaction: (messageId: string, chatId: string, userId: string, emoji: string) => void;
  markRead: (chatId: string, userId: string, messageIds: string[]) => void;
  addTypingUser: (chatId: string, userId: string) => void;
  removeTypingUser: (chatId: string, userId: string) => void;
  updateUserOnlineStatus: (userId: string, isOnline: boolean, lastSeen?: string) => void;
  setReplyTo: (message: Message | null) => void;
  setEditingMessage: (message: Message | null) => void;
  addChat: (chat: Chat) => void;
  updateChat: (chat: Chat) => void;
  removeChat: (chatId: string) => void;
  clearMessages: (chatId: string) => void;
  setPinnedMessage: (chatId: string, message: Message) => void;
  removePinnedMessage: (chatId: string, messageId: string, newPinned: Message | null) => void;
  clearStore: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChat: null,
  messages: {},
  pinnedMessages: {},
  hasMoreMessages: {},
  loadingMoreMessages: {},
  typingUsers: [],
  replyTo: null,
  editingMessage: null,
  isLoadingChats: false,
  isLoadingMessages: false,
  searchQuery: '',
  drafts: JSON.parse(localStorage.getItem('vortex_drafts') || '{}'),
  isOffline: !navigator.onLine,
  isSyncing: false,

  setActiveChat: (chatId) => set((state) => ({
    activeChat: chatId,
    replyTo: null,
    editingMessage: null,
    chats: chatId
      ? state.chats.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c)
      : state.chats,
  })),
  setSearchQuery: (query) => set({ searchQuery: query }),

  setDraft: (() => {
    let draftSaveTimer: ReturnType<typeof setTimeout> | undefined;
    return (chatId: string, text: string) => {
      set((state) => {
        const drafts = { ...state.drafts };
        if (text.trim()) {
          drafts[chatId] = text;
        } else {
          delete drafts[chatId];
        }
        // Debounce localStorage writes to avoid jank on every keystroke
        if (draftSaveTimer) clearTimeout(draftSaveTimer);
        draftSaveTimer = setTimeout(() => {
          localStorage.setItem('vortex_drafts', JSON.stringify(get().drafts));
        }, 500);
        return { drafts };
      });
    };
  })(),

  getDraft: (chatId) => {
    return get().drafts[chatId] || '';
  },

  setOffline: (offline) => set({ isOffline: offline }),
  setSyncing: (syncing) => set({ isSyncing: syncing }),

  /**
   * Отправляет все накопленные сообщения из офлайн-очереди.
   * Вызывается при восстановлении соединения (socket connect / window online).
   */
  flushOfflineQueue: async () => {
    const socket = getSocket();
    if (!socket?.connected) return;

    const queue = await getOfflineQueue();
    if (queue.length === 0) return;

    set({ isSyncing: true });
    console.log('[OfflineQueue] Отправка очереди:', queue.length, 'сообщений');

    for (const msg of queue) {
      try {
        socket.emit('send_message', {
          chatId: msg.chatId,
          content: msg.content,
          type: msg.type,
          replyToId: msg.replyToId || null,
          quote: msg.quote || null,
          ...(msg.scheduledAt ? { scheduledAt: msg.scheduledAt } : {}),
          ...(msg.mediaUrl ? {
            mediaUrl: msg.mediaUrl,
            mediaType: msg.mediaType,
            fileName: msg.fileName,
            fileSize: msg.fileSize,
            ...(msg.thumbnail ? { thumbnail: msg.thumbnail } : {}),
            ...(msg.width ? { width: msg.width, height: msg.height } : {}),
          } : {}),
        });
        // Удаляем из очереди — сервер пришлёт new_message с реальным ID
        await removeFromOfflineQueue(msg.id);
      } catch (e) {
        console.warn('[OfflineQueue] Ошибка отправки:', e);
      }
    }

    set({ isSyncing: false });
  },

  loadChats: async () => {
    try {
      set({ isLoadingChats: true });

      // 1. Моментально показываем кеш из PowerSync (если есть)
      const cachedChats = await getCachedChats();
      if (cachedChats.length > 0) {
        const pinnedMessages: Record<string, Message> = {};
        set({ chats: cachedChats as any, pinnedMessages, isLoadingChats: false });
      }

      // 2. Загружаем свежие данные с сервера
      const chats = await api.getChats();
      // Auto-create favorites chat if not present
      if (!chats.some((c: any) => c.type === 'favorites')) {
        try {
          const favChat = await api.getOrCreateFavorites();
          chats.unshift(favChat);
        } catch {}
      }
      // Extract pinned messages from chats
      const pinnedMessages: Record<string, Message> = {};
      for (const chat of chats) {
        if (chat.pinnedMessages && chat.pinnedMessages.length > 0) {
          pinnedMessages[chat.id] = chat.pinnedMessages[0].message;
        }
      }

      // 3. Кешируем чаты в PowerSync для офлайн-доступа
      upsertChats(chats.map((c: any) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        avatar: c.avatar,
        createdAt: c.createdAt,
      }))).catch(() => {});

      set({ chats, pinnedMessages, isLoadingChats: false, isOffline: false });
    } catch (error) {
      console.error('Load chats error:', error);
      // Если сеть недоступна — оставляем кешированные данные и ставим офлайн-флаг
      const currentChats = get().chats;
      if (currentChats.length === 0) {
        // Даже если кеш пуст — пробуем ещё раз из PowerSync
        try {
          const cachedChats = await getCachedChats();
          if (cachedChats.length > 0) {
            set({ chats: cachedChats as any, isLoadingChats: false, isOffline: true });
            return;
          }
        } catch {}
      }
      set({ isLoadingChats: false, isOffline: true });
    }
  },

  loadMessages: async (chatId) => {
    try {
      set({ isLoadingMessages: true });

      // 1. Моментально показываем кеш из PowerSync (если есть)
      const cachedMessages = await getCachedMessages(chatId);
      if (cachedMessages.length > 0) {
        set((state) => {
          const existing = state.messages[chatId] || [];
          const cachedIds = new Set(cachedMessages.map(m => m.id));
          const socketOnly = existing.filter(m => !cachedIds.has(m.id));
          // Кеш + сообщения пришедшие через сокет во время чтения
          const merged = mergeSortedMessages(
            cachedMessages as any,
            socketOnly,
          );
          return {
            messages: { ...state.messages, [chatId]: merged },
            hasMoreMessages: { ...state.hasMoreMessages, [chatId]: cachedMessages.length >= PAGE_SIZE },
            isLoadingMessages: false,
          };
        });
      }

      // 2. Загружаем свежие данные с сервера
      const fetched = await api.getMessages(chatId);
      const hasMore = fetched.length >= PAGE_SIZE;

      // 3. Кешируем сообщения в PowerSync для офлайн-доступа
      upsertMessages(fetched.map((m: any) => ({
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        content: m.content,
        type: m.type,
        replyToId: m.replyToId,
        isEdited: m.isEdited ? 1 : 0,
        isDeleted: m.isDeleted ? 1 : 0,
        scheduledAt: m.scheduledAt,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }))).catch(() => {});

      // 4. Фоновая предзагрузка медиа первых сообщений (как в Telegram)
      import('../lib/mediaCache').then(({ prefetchMedia }) => {
        const firstBatch = fetched.slice(0, 20);
        for (const msg of firstBatch) {
          for (const m of (msg.media || [])) {
            const previewUrl = m.thumbnail || m.url;
            if (previewUrl) {
              prefetchMedia(previewUrl, m.type === 'video' ? 'video' : 'image');
            }
          }
        }
      }).catch(() => {});

      set((state) => {
        // Merge fetched messages with any that arrived via socket during the fetch
        const existing = state.messages[chatId] || [];
        const fetchedIds = new Set(fetched.map(m => m.id));
        const socketOnly = existing.filter(m => !fetchedIds.has(m.id));
        const merged = mergeSortedMessages(fetched, socketOnly);
        return {
          messages: { ...state.messages, [chatId]: merged },
          hasMoreMessages: { ...state.hasMoreMessages, [chatId]: hasMore },
          isLoadingMessages: false,
        };
      });
    } catch (error) {
      console.error('Load messages error:', error);
      // Если сеть недоступна — оставляем кешированные данные
      set({ isLoadingMessages: false });
    }
  },
loadMoreMessages: async (chatId) => {
    const state = get();
    // Не загружаем, если уже идёт загрузка или сообщений больше нет
    if (state.loadingMoreMessages[chatId] || !state.hasMoreMessages[chatId]) return;
    if (!state.messages[chatId] || state.messages[chatId].length === 0) return;

    // Курсор — createdAt самого первого (самого старого) сообщения
    const cursor = state.messages[chatId][0].createdAt;

    set((s) => ({
      loadingMoreMessages: { ...s.loadingMoreMessages, [chatId]: true },
    }));

    try {
      const fetched = await api.getMessages(chatId, cursor, PAGE_SIZE);
      const hasMore = fetched.length >= PAGE_SIZE;

      // Кешируем догруженные сообщения в PowerSync
      upsertMessages(fetched.map((m: any) => ({
        id: m.id,
        chatId: m.chatId,
        senderId: m.senderId,
        content: m.content,
        type: m.type,
        replyToId: m.replyToId,
        isEdited: m.isEdited ? 1 : 0,
        isDeleted: m.isDeleted ? 1 : 0,
        scheduledAt: m.scheduledAt,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }))).catch(() => {});

      set((s) => {
        const existing = s.messages[chatId] || [];
        // Препендикс: новые (более старые) сообщения — в начало.
        // Оба массива уже отсортированы по createdAt, поэтому линейный merge.
        const merged = mergeSortedMessages(fetched, existing);
        return {
          messages: { ...s.messages, [chatId]: merged },
          hasMoreMessages: { ...s.hasMoreMessages, [chatId]: hasMore },
          loadingMoreMessages: { ...s.loadingMoreMessages, [chatId]: false },
        };
      });
    } catch (error) {
      console.error('Load more messages error:', error);
      set((s) => ({
        loadingMoreMessages: { ...s.loadingMoreMessages, [chatId]: false },
      }));
    }
  },

  addMessage: (message) => {
    const userId = useAuthStore.getState().user?.id;
    set((state) => {
      const chatMessages = state.messages[message.chatId] || [];
      // Защита от дублей socket-событий. Поиск идёт с конца: новое сообщение
      // почти всегда является дублем одного из последних, поэтому обычно это
      // 1–2 сравнения вместо полного прохода.
      for (let i = chatMessages.length - 1; i >= 0; i--) {
        if (chatMessages[i].id === message.id) return state;
      }

      // Заменяем временные сообщения (temp-*), отправленные офлайн,
      // на реальные сообщения от сервера. Сравниваем по content + senderId + chatId.
      let replacedTemp = false;
      const mergedMessages = chatMessages.map((m) => {
        if ((m as any).isSending && (m as any).id?.startsWith('temp-')
            && m.senderId === message.senderId
            && m.chatId === message.chatId
            && m.content === message.content) {
          replacedTemp = true;
          return message;
        }
        return m;
      });

      // Добавляем сообщение только если НЕ заменили временное
      const finalMessages = replacedTemp
        ? mergedMessages
        : [...mergedMessages, message];

      const updatedMessages = {
        ...state.messages,
        [message.chatId]: finalMessages,
      };

      const isTemporary = (message as any).isSending || message.id?.startsWith('temp-');
      const updatedChats = state.chats.map((chat) => {
        if (chat.id === message.chatId) {
          return {
            ...chat,
            messages: [message],
            // Не увеличиваем unreadCount для временных сообщений (isSending)
            unreadCount: chat.id === state.activeChat || isTemporary
              ? chat.unreadCount
              : chat.unreadCount + 1,
          };
        }
        return chat;
      });

      updatedChats.sort((a, b) => {
        const aPin = a.members?.find((m) => m.user?.id === userId)?.isPinned ? 1 : 0;
        const bPin = b.members?.find((m) => m.user?.id === userId)?.isPinned ? 1 : 0;
        if (aPin !== bPin) return bPin - aPin;
        const aTime = a.messages[0]?.createdAt || a.createdAt;
        const bTime = b.messages[0]?.createdAt || b.createdAt;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      // Кешируем новое сообщение в PowerSync (только реальные, не временные)
      if (!isTemporary) {
        upsertMessages([{
          id: message.id,
          chatId: message.chatId,
          senderId: message.senderId,
          content: message.content,
          type: message.type,
          replyToId: message.replyToId,
          isEdited: message.isEdited ? 1 : 0,
          isDeleted: message.isDeleted ? 1 : 0,
          scheduledAt: message.scheduledAt ?? null,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt ?? null,
        }]).catch(() => {});
      }

      return { messages: updatedMessages, chats: updatedChats };
    });
  },

  updateMessage: (message) => {
    set((state) => {
      const chatMessages = state.messages[message.chatId] || [];
      // Сообщения нет в загруженной странице — не создаём новый массив,
      // иначе виртуальный список пересчитывал бы render items впустую.
      if (!chatMessages.some((m) => m.id === message.id)) return state;
      return {
        messages: {
          ...state.messages,
          // Заменяется только целевое сообщение, ссылки остальных сохраняются,
          // поэтому memo(MessageBubble) не перерисовывает соседей.
          [message.chatId]: chatMessages.map((m) => (m.id === message.id ? message : m)),
        },
      };
    });
  },

  removeMessage: (messageId, chatId) => {
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      const updatedMessages = chatMessages.map((m) =>
        m.id === messageId ? { ...m, isDeleted: true, content: null } : m
      );

      // Find the latest non-deleted message to show in sidebar
      const latestVisible = updatedMessages
        .filter(m => !m.isDeleted)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      const updatedChats = state.chats.map((chat) => {
        if (chat.id === chatId) {
          // If the deleted message was the last message shown, replace with previous one
          const currentLast = chat.messages?.[0];
          if (currentLast?.id === messageId) {
            return {
              ...chat,
              messages: latestVisible ? [latestVisible] : [{ ...currentLast, isDeleted: true, content: null }],
            };
          }
        }
        return chat;
      });

      return {
        messages: {
          ...state.messages,
          [chatId]: updatedMessages,
        },
        chats: updatedChats,
      };
    });
  },

  removeMessages: (messageIds, chatId) => {
    const idsSet = new Set(messageIds);
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      const updatedMessages = chatMessages.map((m) =>
        idsSet.has(m.id) ? { ...m, isDeleted: true, content: null } : m
      );

      const latestVisible = updatedMessages
        .filter(m => !m.isDeleted)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      const updatedChats = state.chats.map((chat) => {
        if (chat.id === chatId) {
          const currentLast = chat.messages?.[0];
          if (currentLast && idsSet.has(currentLast.id)) {
            return {
              ...chat,
              messages: latestVisible ? [latestVisible] : [{ ...currentLast, isDeleted: true, content: null }],
            };
          }
        }
        return chat;
      });

      return {
        messages: { ...state.messages, [chatId]: updatedMessages },
        chats: updatedChats,
      };
    });
  },

  hideMessages: (messageIds, chatId) => {
    const idsSet = new Set(messageIds);
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      const updatedMessages = chatMessages.filter((m) => !idsSet.has(m.id));

      const latestVisible = updatedMessages
        .filter(m => !m.isDeleted)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      const updatedChats = state.chats.map((chat) => {
        if (chat.id === chatId) {
          const currentLast = chat.messages?.[0];
          if (currentLast && idsSet.has(currentLast.id)) {
            return {
              ...chat,
              messages: latestVisible ? [latestVisible] : [],
            };
          }
        }
        return chat;
      });

      return {
        messages: { ...state.messages, [chatId]: updatedMessages },
        chats: updatedChats,
      };
    });
  },

  addReaction: (messageId, chatId, userId, username, emoji) => {
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      // Ничего не меняем, если сообщения нет или реакция уже стоит:
      // перерисуется только затронутый пузырь, остальные сохранят ссылки.
      let changed = false;
      const updated = chatMessages.map((m) => {
        if (m.id !== messageId) return m;
        const exists = m.reactions.some((r) => r.userId === userId && r.emoji === emoji);
        if (exists) return m;
        changed = true;
        return {
          ...m,
          reactions: [
            ...m.reactions,
            { id: `${messageId}-${userId}-${emoji}`, emoji, userId, user: { id: userId, username, displayName: username } },
          ],
        };
      });
      if (!changed) return state;
      return { messages: { ...state.messages, [chatId]: updated } };
    });
  },

  removeReaction: (messageId, chatId, userId, emoji) => {
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      let changed = false;
      const updated = chatMessages.map((m) => {
        if (m.id !== messageId) return m;
        const filtered = m.reactions.filter((r) => !(r.userId === userId && r.emoji === emoji));
        if (filtered.length === m.reactions.length) return m;
        changed = true;
        return { ...m, reactions: filtered };
      });
      if (!changed) return state;
      return { messages: { ...state.messages, [chatId]: updated } };
    });
  },

  markRead: (chatId, userId, messageIds) => {
    const currentUserId = useAuthStore.getState().user?.id;
    set((state) => {
      const chatMessages = state.messages[chatId] || [];
      const idSet = new Set(messageIds);
      let messagesChanged = false;
      const updatedMessages = chatMessages.map((m) => {
        if (idSet.has(m.id)) {
          const alreadyRead = m.readBy?.some((r) => r.userId === userId);
          if (alreadyRead) return m;
          messagesChanged = true;
          return { ...m, readBy: [...(m.readBy || []), { userId }] };
        }
        return m;
      });

      const needsUnreadReset = userId === currentUserId;
      if (!messagesChanged && !needsUnreadReset) return state;

      return {
        messages: messagesChanged
          ? { ...state.messages, [chatId]: updatedMessages }
          : state.messages,
        chats: needsUnreadReset
          ? state.chats.map((chat) =>
              chat.id === chatId ? { ...chat, unreadCount: 0 } : chat
            )
          : state.chats,
      };
    });
  },

  addTypingUser: (chatId, userId) => {
    set((state) => {
      const exists = state.typingUsers.some((t) => t.chatId === chatId && t.userId === userId);
      if (exists) return state;
      return { typingUsers: [...state.typingUsers, { chatId, userId }] };
    });
  },

  removeTypingUser: (chatId, userId) => {
    set((state) => ({
      typingUsers: state.typingUsers.filter((t) => !(t.chatId === chatId && t.userId === userId)),
    }));
  },

  updateUserOnlineStatus: (userId, isOnline, lastSeen) => {
    set((state) => {
      // Only clone chats that actually contain this user to minimize object creation
      let changed = false;
      const chats = state.chats.map((chat) => {
        const memberIdx = chat.members.findIndex((m) => m.user.id === userId);
        if (memberIdx === -1) return chat;
        const member = chat.members[memberIdx];
        // Skip if nothing actually changed
        if (member.user.isOnline === isOnline && (!lastSeen || member.user.lastSeen === lastSeen)) return chat;
        changed = true;
        const newMembers = [...chat.members];
        newMembers[memberIdx] = { ...member, user: { ...member.user, isOnline, lastSeen: lastSeen || member.user.lastSeen } };
        return { ...chat, members: newMembers };
      });
      return changed ? { chats } : state;
    });
  },

  setReplyTo: (message) => set({ replyTo: message, editingMessage: null }),
  setEditingMessage: (message) => set({ editingMessage: message, replyTo: null }),

  addChat: (chat) => {
    set((state) => {
      if (state.chats.some((c) => c.id === chat.id)) return state;
      return { chats: [chat, ...state.chats] };
    });
  },

  updateChat: (chat) => {
    set((state) => ({
      chats: state.chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)),
    }));
  },

  removeChat: (chatId) => {
    set((state) => ({
      chats: state.chats.filter((c) => c.id !== chatId),
      activeChat: state.activeChat === chatId ? null : state.activeChat,
      messages: (() => { const m = { ...state.messages }; delete m[chatId]; return m; })(),
      hasMoreMessages: (() => { const h = { ...state.hasMoreMessages }; delete h[chatId]; return h; })(),
      loadingMoreMessages: (() => { const l = { ...state.loadingMoreMessages }; delete l[chatId]; return l; })(),
    }));
  },

  clearMessages: (chatId) => {
    set((state) => ({
      messages: { ...state.messages, [chatId]: [] },
      hasMoreMessages: { ...state.hasMoreMessages, [chatId]: true },
      loadingMoreMessages: { ...state.loadingMoreMessages, [chatId]: false },
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, messages: [] } : c
      ),
    }));
  },

  setPinnedMessage: (chatId, message) => {
    set((state) => ({
      pinnedMessages: { ...state.pinnedMessages, [chatId]: message },
    }));
  },

  removePinnedMessage: (chatId, _messageId, newPinned) => {
    set((state) => {
      const updated = { ...state.pinnedMessages };
      if (newPinned) {
        updated[chatId] = newPinned;
      } else {
        delete updated[chatId];
      }
      return { pinnedMessages: updated };
    });
  },

  clearStore: () => {
    set({
      chats: [],
      activeChat: null,
      messages: {},
      pinnedMessages: {},
      hasMoreMessages: {},
      loadingMoreMessages: {},
      typingUsers: [],
      replyTo: null,
      editingMessage: null,
      isOffline: false,
      isSyncing: false,
    });
  },
}));

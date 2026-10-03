import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { getSocket, disconnectSocket } from '../lib/socket';
import { api } from '../lib/api';
import { playNotificationSound, isChatMuted } from '../lib/sounds';
import { useLang } from '../lib/i18n';
import { useMobile } from '../lib/useMobile';
import type { Message, UserBasic, CallInfo } from '../lib/types';
import { Send, Check } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ChatView from '../components/ChatView';
import UpdatePrompt from '../components/UpdatePrompt';
import BottomNavigation from '../components/BottomNavigation';
import type { MobileTab } from '../components/BottomNavigation';
import FriendsView from '../components/FriendsView';
import MobileSettings from '../components/MobileSettings';
import type { SettingsView } from '../components/MobileSettings';
import ProfileEdit from '../components/ProfileEdit';
import MyProfileScreen from '../components/MyProfileScreen';
import { SUPPORTS_SERVICE_WORKER } from '../lib/env';
import { onDeepLink, consumePendingDeepLink } from '../lib/native';
import OfflineBanner from '../components/OfflineBanner';

// Lazy load heavy modals — they are only needed when a call starts
const CallModal = lazy(() => import('../components/CallModal'));
const GroupCallModal = lazy(() => import('../components/GroupCallModal'));

export default function ChatPage() {
  // Точечные селекторы вместо `useChatStore()`.
  //
  // Раньше ChatPage подписывался на ВЕСЬ store, поэтому любое событие
  // (typing, read receipt, реакция, новое сообщение) перерисовывало страницу,
  // а вместе с ней — Sidebar, ChatView и весь список сообщений.
  // Экшены в Zustand стабильны по ссылке, поэтому такие селекторы
  // не вызывают ререндеров вообще.
  const loadChats = useChatStore(s => s.loadChats);
  const addMessage = useChatStore(s => s.addMessage);
  const updateMessage = useChatStore(s => s.updateMessage);
  const removeMessage = useChatStore(s => s.removeMessage);
  const removeMessages = useChatStore(s => s.removeMessages);
  const hideMessages = useChatStore(s => s.hideMessages);
  const addReaction = useChatStore(s => s.addReaction);
  const removeReaction = useChatStore(s => s.removeReaction);
  const markRead = useChatStore(s => s.markRead);
  const addTypingUser = useChatStore(s => s.addTypingUser);
  const removeTypingUser = useChatStore(s => s.removeTypingUser);
  const updateUserOnlineStatus = useChatStore(s => s.updateUserOnlineStatus);
  const setPinnedMessage = useChatStore(s => s.setPinnedMessage);
  const removePinnedMessage = useChatStore(s => s.removePinnedMessage);
  const clearStore = useChatStore(s => s.clearStore);
  const activeChat = useChatStore(s => s.activeChat);
  const setActiveChat = useChatStore(s => s.setActiveChat);
  const flushOfflineQueue = useChatStore(s => s.flushOfflineQueue);
  const setOffline = useChatStore(s => s.setOffline);
  const user = useAuthStore(s => s.user);
  const initialized = useRef(false);
  const isMobile = useMobile();

  // Call state
  const [callOpen, setCallOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<UserBasic | null>(null);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [incomingCall, setIncomingCall] = useState<CallInfo | null>(null);
  const [callSessionId, setCallSessionId] = useState(0);
  const [deliveryNotification, setDeliveryNotification] = useState<string | null>(null);
  const deliveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group call state
  const [groupCallOpen, setGroupCallOpen] = useState(false);
  const [groupCallChatId, setGroupCallChatId] = useState('');
  const [groupCallChatName, setGroupCallChatName] = useState('');
  const [groupCallType, setGroupCallType] = useState<'voice' | 'video'>('voice');
  const [groupCallSessionId, setGroupCallSessionId] = useState(0);

  // Mobile bottom navigation tab
  const [mobileTab, setMobileTab] = useState<MobileTab>('chats');
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [settingsInitialView, setSettingsInitialView] = useState<SettingsView>('main');

  // Friend requests count for badge
  const [friendRequestsCount, setFriendRequestsCount] = useState(0);

  // Track whether NewChat fullscreen is open (to hide BottomNavigation)
  const [newChatOpen, setNewChatOpen] = useState(false);

  const t = useLang(s => s.t);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadChats();
  }, [loadChats]);

  // Load friend requests count for badge
  useEffect(() => {
    api.getFriendRequests().then(requests => setFriendRequestsCount(requests.length)).catch(() => {});
  }, []);

  // Reload friend requests count when user switches to contacts tab
  useEffect(() => {
    if (mobileTab === 'contacts') {
      api.getFriendRequests().then(requests => setFriendRequestsCount(requests.length)).catch(() => {});
    }
  }, [mobileTab]);

  // Deep Link handler — открывает чат по ссылке https://tg-k.ru/chat/:id или bkonekte://chat/:id
  const handleDeepLinkUrl = useCallback((url: string) => {
    try {
      const parsed = new URL(url);
      // Путь /chat/:chatId
      const match = parsed.pathname.match(/^\/chat\/([a-zA-Z0-9_-]+)/);
      if (match) {
        const chatId = match[1];
        setActiveChat(chatId);
        if (isMobile) setMobileTab('chats');
        return;
      }
      // Параметр ?chatId=... (альтернативный формат)
      const chatParam = parsed.searchParams.get('chatId');
      if (chatParam) {
        setActiveChat(chatParam);
        if (isMobile) setMobileTab('chats');
      }
    } catch { /* некорректный URL */ }
  }, [setActiveChat, isMobile]);

  // Подписка на deep links + обработка отложенного URL
  useEffect(() => {
    // Проверить отложенный deep link (приложение открыто по ссылке)
    const pending = consumePendingDeepLink();
    if (pending) handleDeepLinkUrl(pending);

    // Подписаться на будущие deep links
    const unsub = onDeepLink((url) => {
      handleDeepLinkUrl(url);
    });

    return unsub;
  }, [handleDeepLinkUrl]);

  // Handle back button on mobile (Android PWA)
  useEffect(() => {
    if (!isMobile) return;

    const handlePopState = (e: PopStateEvent) => {
      if (activeChat) {
        e.preventDefault();
        setActiveChat(null);
        // Push a new state so back button can work again
        window.history.pushState({ page: 'chats' }, '');
      }
    };

    // Push initial state
    window.history.pushState({ page: 'chats' }, '');
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isMobile, activeChat, setActiveChat]);

  // When opening a chat on mobile, push history state
  useEffect(() => {
    if (isMobile && activeChat) {
      window.history.pushState({ page: 'chat', chatId: activeChat }, '');
    }
  }, [isMobile, activeChat]);

  // Обработка закрытия вкладки — отправить disconnect
  useEffect(() => {
    const handleBeforeUnload = () => {
      const socket = getSocket();
      if (socket) {
        socket.disconnect();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Сообщаем Service Worker об активном чате, чтобы подавлять push-уведомления,
  // когда пользователь уже смотрит этот чат в фокусированном окне (браузер или PWA).
  // Используем navigator.serviceWorker.controller, а если его нет (первый запуск PWA) —
  // fallback через registration.active.
  useEffect(() => {
    const sendActiveChatToSW = async (chatId: string | null) => {
      // В нативной сборке Service Worker не регистрируется, а
      // navigator.serviceWorker.ready никогда не разрешится — выходим сразу.
      if (!SUPPORTS_SERVICE_WORKER) return;

      // Основной способ — controller (доступен после первой навигации под SW)
      const sw = navigator.serviceWorker.controller
        // Fallback: в PWA при первом запуске controller может быть null,
        // но registration.active уже доступен
        || (await navigator.serviceWorker.ready.then(r => r.active));

      if (sw) {
        sw.postMessage({ type: 'SET_ACTIVE_CHAT', chatId });
      }
    };

    // Отправляем текущее значение активного чата
    sendActiveChatToSW(activeChat);

    // При потере/получении фокуса обновляем SW — если вкладка не в фокусе, чат = null
    const handleVisibility = () => {
      if (document.hidden) {
        sendActiveChatToSW(null);
      } else {
        sendActiveChatToSW(useChatStore.getState().activeChat);
      }
    };

    const handleFocus = () => {
      sendActiveChatToSW(useChatStore.getState().activeChat);
    };

    const handleBlur = () => {
      sendActiveChatToSW(null);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [activeChat]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('new_message', async (message: Message) => {
      // If this chat isn't in our store yet (e.g. someone just created it and sent a message),
      // fetch chats so the new chat appears in the sidebar immediately
      const { chats } = useChatStore.getState();
      if (!chats.some(c => c.id === message.chatId)) {
        try {
          const allChats = await api.getChats();
          const newChat = allChats.find(c => c.id === message.chatId);
          if (newChat) {
            // Reset unreadCount to 0 because addMessage below will increment it by 1
            useChatStore.getState().addChat({ ...newChat, unreadCount: 0 });
          }
        } catch (e) {
          console.error('Failed to fetch new chat:', e);
        }
      }
      addMessage(message);
      // Play notification sound for messages from others
      if (message.senderId !== user?.id && !isChatMuted(message.chatId)) {
        playNotificationSound();
      }
    });

    socket.on('scheduled_delivered', async (message: Message & { _recipientName?: string; _deliveredAt?: string }) => {
      // If chat unknown, fetch it first
      const { chats } = useChatStore.getState();
      if (!chats.some(c => c.id === message.chatId)) {
        try {
          const allChats = await api.getChats();
          const newChat = allChats.find(c => c.id === message.chatId);
          if (newChat) useChatStore.getState().addChat(newChat);
        } catch (_) { /* ignore */ }
      }
      // A scheduled message was delivered: update it in store (remove scheduledAt)
      updateMessage({ ...message, scheduledAt: null });

      // Show delivery notification to the sender
      if (message.senderId === user?.id && message._recipientName) {
        const time = message._deliveredAt
          ? new Date(message._deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';
        const notifText = `${useLang.getState().t('scheduledDelivered')} ${message._recipientName} ${useLang.getState().t('scheduledDeliveredAt')} ${time}`;
        setDeliveryNotification(notifText);
        if (deliveryTimerRef.current) clearTimeout(deliveryTimerRef.current);
        deliveryTimerRef.current = setTimeout(() => setDeliveryNotification(null), 5000);
      }

      // Notify others with sound
      if (message.senderId !== user?.id && !isChatMuted(message.chatId)) {
        playNotificationSound();
      }
    });

    socket.on('message_edited', (message: Message) => {
      updateMessage(message);
    });

    socket.on('message_deleted', (data: { messageId: string; chatId: string }) => {
      removeMessage(data.messageId, data.chatId);
    });

    socket.on('messages_deleted', (data: { messageIds: string[]; chatId: string }) => {
      removeMessages(data.messageIds, data.chatId);
    });

    socket.on('messages_hidden', (data: { messageIds: string[]; chatId: string }) => {
      hideMessages(data.messageIds, data.chatId);
    });

    socket.on('reaction_added', (data: { messageId: string; chatId: string; userId: string; username: string; emoji: string }) => {
      addReaction(data.messageId, data.chatId, data.userId, data.username, data.emoji);
    });

    socket.on('reaction_removed', (data: { messageId: string; chatId: string; userId: string; emoji: string }) => {
      removeReaction(data.messageId, data.chatId, data.userId, data.emoji);
    });

    socket.on('messages_read', (data: { chatId: string; userId: string; messageIds: string[] }) => {
      markRead(data.chatId, data.userId, data.messageIds);
    });

    socket.on('user_typing', (data: { chatId: string; userId: string }) => {
      if (data.userId !== user?.id) {
        addTypingUser(data.chatId, data.userId);
        setTimeout(() => removeTypingUser(data.chatId, data.userId), 3000);
      }
    });

    socket.on('user_stopped_typing', (data: { chatId: string; userId: string }) => {
      removeTypingUser(data.chatId, data.userId);
    });

    socket.on('user_online', (data: { userId: string }) => {
      updateUserOnlineStatus(data.userId, true);
    });

    socket.on('user_offline', (data: { userId: string; lastSeen?: string }) => {
      updateUserOnlineStatus(data.userId, false, data.lastSeen);
    });

    socket.on('message_pinned', (data: { chatId: string; message: Message }) => {
      setPinnedMessage(data.chatId, data.message);
    });

    socket.on('message_unpinned', (data: { chatId: string; messageId: string; newPinnedMessage: Message | null }) => {
      removePinnedMessage(data.chatId, data.messageId, data.newPinnedMessage);
    });

    socket.on('call_incoming', async (data: CallInfo) => {
      // Use callerInfo from server if available, otherwise look up from chats
      let callerInfo: UserBasic | null = data.callerInfo || null;
      if (!callerInfo) {
        const { chats } = useChatStore.getState();
        for (const chat of chats) {
          const member = chat.members.find((m) => m.user.id === data.from);
          if (member) {
            callerInfo = member.user;
            break;
          }
        }
      }
      setCallTarget(null); // Clear any previous outgoing target
      setIncomingCall({
        from: data.from,
        offer: data.offer,
        callType: data.callType,
        chatId: data.chatId,
        callerInfo,
      });
      setCallType(data.callType);
      setCallSessionId(id => id + 1);
      setCallOpen(true);
    });

    // Friend request updates for badge
    const reloadFriendRequests = () => {
      api.getFriendRequests().then(requests => setFriendRequestsCount(requests.length)).catch(() => {});
    };

    socket.on('friend_request_received', reloadFriendRequests);
    socket.on('friend_request_accepted', reloadFriendRequests);

    // When a friendship is removed (declined/cancelled/unfriended), also refresh the badge count
    socket.on('friend_removed', reloadFriendRequests);

    return () => {
      socket.off('new_message');
      socket.off('scheduled_delivered');
      socket.off('message_edited');
      socket.off('message_deleted');
      socket.off('messages_deleted');
      socket.off('messages_hidden');
      socket.off('reaction_added');
      socket.off('reaction_removed');
      socket.off('messages_read');
      socket.off('user_typing');
      socket.off('user_stopped_typing');
      socket.off('user_online');
      socket.off('user_offline');
      socket.off('message_pinned');
      socket.off('message_unpinned');
      socket.off('call_incoming');
      socket.off('friend_request_received', reloadFriendRequests);
      socket.off('friend_request_accepted', reloadFriendRequests);
      socket.off('friend_removed', reloadFriendRequests);
    };
  }, [user?.id]);

  // ─── Офлайн-режим: отслеживание состояния сети ───────────────────
  useEffect(() => {
    const handleOnline = () => {
      setOffline(false);
      // Отправляем накопленные сообщения
      setTimeout(() => flushOfflineQueue(), 500);
      // Обновляем данные
      setTimeout(() => loadChats(), 1000);
    };
    const handleOffline = () => setOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Также слушаем события сокета
    const socket = getSocket();
    if (socket) {
      socket.on('connect', () => {
        setOffline(false);
        setTimeout(() => flushOfflineQueue(), 500);
        setTimeout(() => loadChats(), 1000);
      });
      socket.on('disconnect', () => setOffline(true));
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOffline, flushOfflineQueue, loadChats]);

  const handleStartCall = useCallback((targetUser: UserBasic, type: 'voice' | 'video') => {
    setCallTarget(targetUser);
    setCallType(type);
    setIncomingCall(null);
    setCallSessionId(id => id + 1);
    setCallOpen(true);
  }, []);

  const handleStartGroupCall = useCallback((chatId: string, chatName: string, type: 'voice' | 'video') => {
    setGroupCallChatId(chatId);
    setGroupCallChatName(chatName);
    setGroupCallType(type);
    setGroupCallSessionId(id => id + 1);
    setGroupCallOpen(true);
  }, []);

  const handleCloseCall = () => {
    setCallOpen(false);
    setCallTarget(null);
    setIncomingCall(null);
  };

  const handleCloseGroupCall = () => {
    setGroupCallOpen(false);
  };

  const handleBack = useCallback(() => {
    setActiveChat(null);
  }, []);

  // Handle bottom tab change
  const handleTabChange = (tab: MobileTab) => {
    setMobileTab(tab);
    if (tab !== 'profile') setProfileEditMode(false);
    if (tab !== 'settings') setSettingsInitialView('main');
  };

  // Mobile layout: show either Sidebar or ChatView (like Telegram)
  if (isMobile) {
    const showBottomNav = !activeChat;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="h-full flex flex-col bg-surface overflow-hidden"
        style={{ height: 'calc(var(--vh, 1vh) * 100)' }}
      >
        {activeChat ? (
          <ChatView
            onStartCall={handleStartCall}
            onStartGroupCall={handleStartGroupCall}
            isMobile={true}
            onBack={handleBack}
          />
        ) : (
          <div className="relative flex-1 overflow-hidden">
            {/* Tab content area — fills entire space, scrolls under nav */}
            <div className="h-full overflow-hidden">
              {mobileTab === 'chats' && <Sidebar isMobile={true} onNewChatOpenChange={setNewChatOpen} />}
              {mobileTab === 'contacts' && <FriendsView onBack={() => setMobileTab('chats')} onFriendRequestsChange={setFriendRequestsCount} />}
              {mobileTab === 'settings' && <MobileSettings onBack={() => setMobileTab('chats')} onEditProfile={() => setMobileTab('profile')} initialView={settingsInitialView} />}
              {mobileTab === 'profile' && !profileEditMode && (
                <MyProfileScreen
                  onEditProfile={() => { setSettingsInitialView('account'); setMobileTab('settings'); }}
                  onOpenSettings={() => { setSettingsInitialView('main'); setMobileTab('settings'); }}
                />
              )}
              {mobileTab === 'profile' && profileEditMode && (
                <ProfileEdit onBack={() => setProfileEditMode(false)} />
              )}
            </div>

            {/* Bottom Navigation Bar — floating over content like Telegram */}
            {!newChatOpen && (
              <BottomNavigation activeTab={mobileTab} onTabChange={handleTabChange} friendRequestsCount={friendRequestsCount} />
            )}
          </div>
        )}

        {callOpen && (
          <Suspense fallback={null}>
            <CallModal
              key={callSessionId}
              isOpen={callOpen}
              onClose={handleCloseCall}
              targetUser={callTarget}
              callType={callType}
              incoming={incomingCall}
            />
          </Suspense>
        )}
        {groupCallOpen && (
          <Suspense fallback={null}>
            <GroupCallModal
              key={`gc-${groupCallSessionId}`}
              isOpen={groupCallOpen}
              onClose={handleCloseGroupCall}
              chatId={groupCallChatId}
              chatName={groupCallChatName}
              callType={groupCallType}
            />
          </Suspense>
        )}

        {/* Scheduled message delivery notification */}
        <AnimatePresence>
          {deliveryNotification && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-2xl bg-surface-secondary shadow-2xl border border-border flex items-center gap-2"
              style={{ top: 'max(1.5rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))' }}
            >
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Send size={12} className="text-emerald-400" />
              </div>
              <span className="text-xs text-zinc-200">{deliveryNotification}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PWA soft update prompt */}
        <UpdatePrompt />

        {/* Офлайн-баннер */}
        <OfflineBanner />
      </motion.div>
    );
  }

  // Desktop layout: side-by-side
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex bg-surface p-3 gap-3 overflow-hidden"
    >
      <Sidebar />
      <ChatView onStartCall={handleStartCall} onStartGroupCall={handleStartGroupCall} />
      {callOpen && (
        <Suspense fallback={null}>
          <CallModal
            key={callSessionId}
            isOpen={callOpen}
            onClose={handleCloseCall}
            targetUser={callTarget}
            callType={callType}
            incoming={incomingCall}
          />
        </Suspense>
      )}
      {groupCallOpen && (
        <Suspense fallback={null}>
          <GroupCallModal
            key={`gc-${groupCallSessionId}`}
            isOpen={groupCallOpen}
            onClose={handleCloseGroupCall}
            chatId={groupCallChatId}
            chatName={groupCallChatName}
            callType={groupCallType}
          />
        </Suspense>
      )}

      {/* Scheduled message delivery notification */}
      <AnimatePresence>
        {deliveryNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl bg-surface-secondary shadow-2xl border border-border flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Send size={14} className="text-emerald-400" />
            </div>
            <span className="text-sm text-zinc-200">{deliveryNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA soft update prompt */}
      <UpdatePrompt />

      {/* Офлайн-баннер */}
      <OfflineBanner />
    </motion.div>
  );
}

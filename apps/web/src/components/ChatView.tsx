import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  Video,
  MoreVertical,
  Search,
  X,
  ArrowDown,
  ArrowLeft,
  Trash2,
  UserPlus,
  Bell,
  BellOff,
  Settings,
  Eraser,
  Pin,
  Forward,
  Bookmark,
  Copy,
  Reply,
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { isChatMuted, toggleMuteChat } from '../lib/sounds';
import { useLang } from '../lib/i18n';
import { formatLastSeen } from '../lib/utils';
import type { UserBasic, Message } from '../lib/types';
import MessageList, { NEAR_BOTTOM_THRESHOLD } from './MessageList';
import type { MessageListHandle } from './MessageList';
import FloatingDateHeader from './FloatingDateHeader';
import { buildRenderMessages, buildMessageIndex } from '../lib/messageList';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import { MessageSkeletonGroup, CompactSkeleton } from './Skeleton';
// Lazy load heavy overlay components вЂ” only needed on demand
const UserProfile = lazy(() => import('./UserProfile'));
const GroupSettings = lazy(() => import('./GroupSettings'));
const ForwardModal = lazy(() => import('./ForwardModal'));
import ConfirmModal from './ConfirmModal';
import Avatar from './Avatar';
import { useThemeStore } from '../stores/themeStore';
import { useChatSettingsStore, COLOR_THEMES } from '../stores/chatSettingsStore';

/** РЎС‚Р°Р±РёР»СЊРЅР°СЏ РїСѓСЃС‚Р°СЏ СЃСЃС‹Р»РєР°: РїСЂРµРґРѕС‚РІСЂР°С‰Р°РµС‚ Р»РёС€РЅРёРµ СЂРµРЅРґРµСЂС‹ РїСЂРё РѕС‚СЃСѓС‚СЃС‚РІРёРё Р°РєС‚РёРІРЅРѕРіРѕ С‡Р°С‚Р°. */
const EMPTY_MESSAGES: Message[] = [];

interface ChatViewProps {
  onStartCall?: (targetUser: UserBasic, type: 'voice' | 'video') => void;
  onStartGroupCall?: (chatId: string, chatName: string, type: 'voice' | 'video') => void;
  isMobile?: boolean;
  onBack?: () => void;
}

/** Заглушка «выберите чат» — не содержит хуков, кроме получения перевода. */
const EmptyChatState = memo(function EmptyChatState() {
  const t = useLang(s => s.t);
  return (
    <div className="flex-1 flex items-center justify-center bg-surface-secondary/50 rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl relative z-0 backdrop-blur-3xl group">
      {/* Slowly pulsing purple background as requested */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden transition-opacity duration-[10000ms]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] bg-vortex-600/10 rounded-full blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-purple-600/15 rounded-full blur-[100px] animate-[pulse_12s_ease-in-out_infinite_reverse]" />
      </div>

      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMSkvPjwvc3ZnPg==')] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] opacity-20 pointer-events-none" />

      <div className="text-center relative z-10 w-full max-w-sm px-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-28 h-28 mx-auto mb-8 rounded-[2rem] bg-gradient-to-br from-vortex-500/20 to-purple-600/20 flex items-center justify-center shadow-[0_0_60px_-15px_var(--color-accent)] ring-1 ring-white/10 backdrop-blur-2xl relative"
        >
          <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-white/[0.05] to-transparent pointer-events-none" />
          <img src="/logo.png" alt="Vortex" className="w-16 h-16 rounded-2xl object-cover shadow-2xl transform hover:scale-105 transition-transform" />
        </motion.div>
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-vortex-400 via-fuchsia-400 to-indigo-400 mb-4 drop-shadow-lg tracking-tight"
        >
          Bkonekte
        </motion.h2>
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-sm font-medium text-zinc-300 bg-white/5 backdrop-blur-lg py-2.5 px-6 rounded-full inline-flex border border-white/10 shadow-lg"
        >
          {t('selectChat')}
        </motion.p>
      </div>
    </div>
  );
});

/**
 * Вся логика активного чата.
 *
 * Выделена в отдельный компонент, чтобы условие «нет активного чата»
 * обрабатывалось ДО объявления хуков. Раньше `ChatView` делал ранний return,
 * а `handleToggleSelect` / `handleStartSelection` / `handleViewProfile`
 * объявлялись ниже — это нарушало Rules of Hooks.
 */
const ActiveChatView = function ActiveChatView({ onStartCall, onStartGroupCall, isMobile = false, onBack }: ChatViewProps) {
  const user = useAuthStore(s => s.user);
  const t = useLang(s => s.t);
  const lang = useLang(s => s.lang);
  const chatTheme = useThemeStore(s => s.chatTheme);
  // Точечные селекторы вместо `useChatSettingsStore()`: ChatView перестаёт
  // перерисовываться (вместе со всем списком) при изменении любых
  // несвязанных настроек — стикеров, анимаций, единиц измерения и т.д.
  const colorThemeId = useChatSettingsStore(s => s.colorThemeId);
  const wallpaper = useChatSettingsStore(s => s.wallpaper);
  const usernameColor = useChatSettingsStore(s => s.usernameColor);
  const activeColorTheme = useMemo(() => COLOR_THEMES.find(theme => theme.id === colorThemeId) || COLOR_THEMES[0], [colorThemeId]);
  const activeChat = useChatStore(s => s.activeChat);
  const chat = useChatStore(s => s.chats.find(c => c.id === s.activeChat) || null);
  const chatMessages = useChatStore(s => (activeChat ? s.messages[activeChat] : null) ?? EMPTY_MESSAGES);
  // Селекторы сужены до скаляров текущего чата: раньше подписка на целые
  // объекты `hasMoreMessages` / `loadingMoreMessages` перерисовывала ChatView
  // при активности в любом другом чате.
  const pinnedMsg = useChatStore(s => (s.activeChat ? s.pinnedMessages[s.activeChat] : null) ?? null);
  const typingCount = useChatStore(s =>
    s.typingUsers.reduce(
      (acc, typing) => acc + (typing.chatId === s.activeChat && typing.userId !== user?.id ? 1 : 0),
      0,
    ),
  );
  const isLoadingMessages = useChatStore(s => s.isLoadingMessages);
  const hasMore = useChatStore(s => (s.activeChat ? s.hasMoreMessages[s.activeChat] ?? false : false));
  const isLoadingMore = useChatStore(s => (s.activeChat ? s.loadingMoreMessages[s.activeChat] ?? false : false));
  const setActiveChat = useChatStore(s => s.setActiveChat);
  const setReplyTo = useChatStore(s => s.setReplyTo);

  const [showTopMenu, setShowTopMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  // Плавающая дата поверх списка: подпись текущей верхней видимой группы
  // и флаг видимости (показываем только во время скролла, как в Telegram).
  // VISIBLE — управляем через ref, чтобы не дёргать setState на каждое событие scroll.
  const [floatingDate, setFloatingDate] = useState<string | null>(null);
  const [floatingDateVisible, setFloatingDateVisible] = useState(false);
  const floatingDateVisibleRef = useRef(false);
  const [muted, setMuted] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ message: string; action: () => void } | null>(null);
  const [scrollReady, setScrollReady] = useState(false);
  const [activeGroupCallParticipants, setActiveGroupCallParticipants] = useState<string[]>([]);
  

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  /** Императивный доступ к виртуальному списку (скролл к низу / к сообщению). */
  const messageListRef = useRef<MessageListHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const topMenuRef = useRef<HTMLDivElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const chatViewRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(60); // fallback 60px в‰€ pb-15

  // РљРѕР»РёС‡РµСЃС‚РІРѕ РЅРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹С… СЃРѕРѕР±С‰РµРЅРёР№ (РґР»СЏ Р±РµР№РґР¶РёРєР°) вЂ” РјРµРјРѕРёР·РёСЂСѓРµРј РґР»СЏ perf
  const unreadCount = useMemo(() =>
    chatMessages.filter(
      (m) => m.senderId !== user?.id && !m.readBy?.some((r) => r.userId === user?.id)
    ).length,
    [chatMessages, user?.id]
  );

  const otherMember = chat?.members.find((m) => m.user.id !== user?.id);
  const isFavorites = chat?.type === 'favorites';
  const chatName = isFavorites
    ? t('favorites')
    : chat?.type === 'personal'
      ? otherMember?.user.displayName || otherMember?.user.username || t('chat')
      : chat?.name || t('group');
  const chatAvatar = isFavorites
    ? null
    : chat?.type === 'personal'
      ? otherMember?.user.avatar
      : chat?.avatar;
  const isOnline = chat?.type === 'personal' && otherMember?.user.isOnline;
  const isGroup = chat?.type === 'group';

  // Р”Р»СЏ РєРЅРѕРїРєРё В«РЈРґР°Р»РёС‚СЊ С‚Р°РєР¶Рµ РґР»СЏ вЂ¦В» РІ Р»РёС‡РЅС‹С… С‡Р°С‚Р°С…; РІ РіСЂСѓРїРїР°С… вЂ” РїСѓСЃС‚Р°СЏ СЃС‚СЂРѕРєР°.
  const otherMemberName = chat?.type === 'personal'
    ? otherMember?.user.displayName || otherMember?.user.username || ''
    : '';
  const pinnedMsgId = pinnedMsg?.id ?? null;
  const showPinnedSection = !!(pinnedMsg || (chat?.type === 'group' && activeGroupCallParticipants.length > 0));

  // Единственный проход подготовки данных для рендера:
  //   chatMessages → useMemo → renderItems → virtualizer → MessageBubble
  //
  // Раньше цепочка была `messageMeta` → `groupedMessages` → `find()` →
  // `indexOf()` прямо в JSX, что давало O(n²) на каждый рендер списка.
  const renderItems = useMemo(() => buildRenderMessages(chatMessages, lang), [chatMessages, lang]);

  // messageId → индекс: нужен для scrollToIndex (поиск, закреплённое)
  // и для пересылки выбранных сообщений без обхода массива.
  const messageIndex = useMemo(() => buildMessageIndex(renderItems), [renderItems]);

  // Load muted state
  useEffect(() => {
    if (activeChat) {
      setMuted(isChatMuted(activeChat));
      setScrollReady(false);
      setActiveGroupCallParticipants([]);
    }
  }, [activeChat]);

  // Listen for active group calls
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (data: { chatId: string; participants: string[] }) => {
      if (data.chatId === activeChat) {
        setActiveGroupCallParticipants(data.participants.filter(p => p !== user?.id));
      }
    };
    socket.on('group_call_active', handler);
    // Request current status when opening a group chat
    if (activeChat && chat?.type === 'group') {
      socket.emit('group_call_status', { chatId: activeChat });
    }
    return () => { socket.off('group_call_active', handler); };
  }, [activeChat, user?.id, chat?.type]);

  // Close top menu on click outside
  useEffect(() => {
    if (!showTopMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (topMenuRef.current && !topMenuRef.current.contains(e.target as Node)) {
        setShowTopMenu(false);
      }
    };
    // Use setTimeout to avoid the same click that opened the menu from closing it
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showTopMenu]);

  // Close delete menu on click outside
  useEffect(() => {
    if (!showDeleteMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(e.target as Node)) {
        setShowDeleteMenu(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showDeleteMenu]);

  // РџСЂРѕРєСЂСѓС‚РєР° РІРЅРёР· вЂ” РёСЃРїРѕР»СЊР·СѓРµРј scrollTo РєРѕРЅС‚РµР№РЅРµСЂР°, С‡С‚РѕР±С‹ РіР°СЂР°РЅС‚РёСЂРѕРІР°С‚СЊ,
  // С‡С‚Рѕ РїРѕСЃР»РµРґРЅРµРµ СЃРѕРѕР±С‰РµРЅРёРµ РѕРєР°Р¶РµС‚СЃСЏ РЅР°Рґ РїР°РЅРµР»СЊСЋ РІРІРѕРґР°, Р° РЅРµ Р·Р° РЅРµР№
  const scrollToBottom = useCallback((smooth = true) => {
    // Тот же скролл-контейнер, что и раньше: виртуализатор встроен в него,
    // а не создаёт вторую систему скроллинга (важно для мобильных WebView).
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
    }
  }, []);

  /**
   * Переход к конкретному сообщению (поиск, закреплённое).
   * Виртуализатор домонтирует ряд, даже если его нет в DOM, и только потом
   * подсвечивает элемент.
   */
  const scrollToMessage = useCallback((messageId: string) => {
    messageListRef.current?.scrollToMessage(messageId);
    // Подсветку даём после прокрутки — к этому моменту ряд уже смонтирован.
    setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      if (!el) return;
      el.classList.add('bg-vortex-500/20');
      setTimeout(() => el.classList.remove('bg-vortex-500/20'), 2000);
    }, 120);
  }, []);

  /**
   * Подгрузка старых сообщений при подходе к началу истории.
   * Guard'ы (`loadingMoreMessages` / `hasMoreMessages`) читаются напрямую из
   * store, поэтому параллельные и повторные запросы исключены.
   */
  const handleReachTop = useCallback(() => {
    const chatId = useChatStore.getState().activeChat;
    if (!chatId) return;
    const state = useChatStore.getState();
    if (!state.hasMoreMessages[chatId] || state.loadingMoreMessages[chatId]) return;
    state.loadMoreMessages(chatId);
  }, []);

  // Композер меняет высоту (панель эмодзи, вложения, ответ) — сдвигаем скролл
  // на ту же дельту, чтобы сообщения не «уехали» под панель и не прыгали.
  const prevComposerHeightRef = useRef(composerHeight);
  useEffect(() => {
    const container = messagesContainerRef.current;
    const delta = composerHeight - prevComposerHeightRef.current;
    prevComposerHeightRef.current = composerHeight;
    if (!container || Math.abs(delta) < 1) return;
    container.scrollTop += delta;
  }, [composerHeight]);

  // Первичная прокрутка к последнему сообщению при открытии чата.
  //
  // С виртуализацией высота списка сначала оценочная (estimateSize), а реальные
  // высоты рядов доезжают после измерения. Поэтому «доводим» скролл к низу
  // несколько кадров подряд, пока scrollHeight ещё меняется. Контейнер до
  // готовности скрыт классом `invisible`, так что подгонка не видна.
  useEffect(() => {
    if (isLoadingMessages || !activeChat) return;

    let frame = 0;
    let attempts = 0;
    let lastHeight = -1;

    const settle = () => {
      const container = messagesContainerRef.current;
      if (!container) return;

      container.scrollTop = container.scrollHeight;
      const height = container.scrollHeight;
      attempts++;

      // Высота перестала меняться либо исчерпали бюджет кадров — готово.
      if (height === lastHeight || attempts >= 12) {
        setScrollReady(true);
        return;
      }
      lastHeight = height;
      frame = requestAnimationFrame(settle);
    };

    frame = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(frame);
  }, [activeChat, isLoadingMessages]);

  // Прокрутка вниз при открытии клавиатуры (мобильные устройства)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    let prevHeight = window.visualViewport.height;
    const onResize = () => {
      const h = window.visualViewport!.height;
      if (h < prevHeight - 50) {
        setTimeout(() => scrollToBottom(false), 100);
      }
      prevHeight = h;
    };

    window.visualViewport?.addEventListener('resize', onResize);
    return () => window.visualViewport?.removeEventListener('resize', onResize);
  }, [scrollToBottom]);

// Прокрутка вниз при открытии клавиатуры (мобильные устройства)
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setComposerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    // Initial measurement
    setComposerHeight(el.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, [activeChat]);

  // Автоскролл при новых сообщениях и сохранение позиции при подгрузке
  // истории теперь живут в MessageList (рядом с виртуализатором, который
  // владеет измеренными высотами). Поведение прежнее:
  //   - своё сообщение            → прокрутка вниз;
  //   - чужое и пользователь внизу → прокрутка вниз;
  //   - чужое и чтение истории     → без прокрутки, показываем кнопку «вниз».

  // Read receipts вЂ” debounced via ref to avoid excessive emits
  const sentReadIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeChat || !user?.id) return;
    // Reset tracked IDs when switching chats
    sentReadIdsRef.current.clear();
  }, [activeChat, user?.id]);

  useEffect(() => {
    if (!activeChat || !user?.id) return;
    const unread = chatMessages.filter(
      (m) => m.senderId !== user.id && !m.readBy?.some((r) => r.userId === user.id) && !sentReadIdsRef.current.has(m.id)
    );
    if (unread.length > 0) {
      const ids = unread.map((m) => m.id);
      ids.forEach((id) => sentReadIdsRef.current.add(id));
      const socket = getSocket();
      if (socket) {
        socket.emit('read_messages', {
          chatId: activeChat,
          messageIds: ids,
        });
      }
      // Update local store immediately for current user
      useChatStore.getState().markRead(activeChat, user.id, ids);
    }
  }, [chatMessages.length, activeChat, user?.id]);

  // Таймер авто-скрытия плавающей даты после остановки скролла.
  const floatingDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll detection — throttled via rAF to avoid layout thrashing
  const scrollRafRef = useRef(0);
  const handleScroll = useCallback(() => {
    // Показываем плавающую дату только если она ещё не видна —
    // ref-гард предотвращает setState(true) на каждом событии скролла.
    if (!floatingDateVisibleRef.current) {
      floatingDateVisibleRef.current = true;
      setFloatingDateVisible(true);
    }
    if (floatingDateTimerRef.current) clearTimeout(floatingDateTimerRef.current);
    // Скролл остановился — плавно убираем заголовок (как в Telegram).
    floatingDateTimerRef.current = setTimeout(() => {
      floatingDateVisibleRef.current = false;
      setFloatingDateVisible(false);
    }, 1200);

    if (scrollRafRef.current) return; // already queued
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const container = messagesContainerRef.current;
      if (!container) return;
      // Тот же порог, что использует автоскролл в MessageList, — кнопка «вниз»
      // и решение «скроллить/не скроллить» остаются согласованными.
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_THRESHOLD;
      setShowScrollDown(!isNearBottom);

    });
  }, []);

  // Чистим таймеры скролла при размонтировании/смене чата.
  useEffect(() => {
    return () => {
      if (floatingDateTimerRef.current) clearTimeout(floatingDateTimerRef.current);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  // Прячем дату при переключении чата — иначе на новом чате мелькнёт старая.
  useEffect(() => {
    setFloatingDateVisible(false);
    setFloatingDate(null);
  }, [activeChat]);

  // РР·РјРµСЂСЏРµРј РІС‹СЃРѕС‚Сѓ РїР°РЅРµР»Рё РІРІРѕРґР° (РєРѕРјРїРѕР·РµСЂР°), С‡С‚РѕР±С‹ РґРёРЅР°РјРёС‡РµСЃРєРё РїРѕРґСЃС‚СЂР°РёРІР°С‚СЊ
  // padding-bottom РєРѕРЅС‚РµР№РЅРµСЂР° СЃРѕРѕР±С‰РµРЅРёР№ вЂ” РїРѕСЃР»РµРґРЅРµРµ СЃРѕРѕР±С‰РµРЅРёРµ РЅРµ Р±СѓРґРµС‚ СЃРєСЂС‹С‚Рѕ Р·Р° РєР°РїСЃСѓР»РѕР№
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setComposerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    // Initial measurement
    setComposerHeight(el.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, [activeChat]);

  // Подгрузка старых сообщений теперь инициируется самим виртуализатором
  // (MessageList → onReachTop → handleReachTop): отдельный sentinel и
  // «замок» loadLockRef больше не нужны, а восстановление позиции скролла
  // делается по измеренным высотам рядов.

  // Mouse-follow for chat themes вЂ” throttled via rAF to cap at ~60fps
  const mouseMoveRafRef = useRef(0);
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (mouseMoveRafRef.current) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    mouseMoveRafRef.current = requestAnimationFrame(() => {
      mouseMoveRafRef.current = 0;
      if (!chatViewRef.current) return;
      const { left, top } = chatViewRef.current.getBoundingClientRect();
      chatViewRef.current.style.setProperty('--mouse-x', `${clientX - left}px`);
      chatViewRef.current.style.setProperty('--mouse-y', `${clientY - top}px`);
    });
  }, []);

  // РџРѕРёСЃРє СЃРѕРѕР±С‰РµРЅРёР№
  useEffect(() => {
    if (!searchText.trim() || !activeChat) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchMessages(searchText, activeChat);
        setSearchResults(results);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, activeChat]);

  const openSearch = () => {
    setShowSearch(true);
    setShowTopMenu(false);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const initials = chatName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Стабильные колбэки для рядов виртуального списка: без них memo на
  // MessageBubble/VirtualMessageRow не работал бы (новая функция на каждый
  // рендер = новые props у всех сообщений).
  const handleToggleSelect = useCallback((msgId: string) => {
    setSelectedMessages((prev) => {
      const newMap = new Set(prev);
      if (newMap.has(msgId)) {
        newMap.delete(msgId);
        if (newMap.size === 0) setSelectionMode(false);
      } else {
        newMap.add(msgId);
      }
      return newMap;
    });
  }, []);

  const handleStartSelection = useCallback((msgId: string) => {
    setSelectionMode(true);
    setSelectedMessages(new Set([msgId]));
  }, []);

  const handleViewProfile = useCallback((userId: string) => {
    setProfileUserId(userId);
  }, []);

  // Стабильная ссылка: MessageList вызывает это при смене верхней видимой
  // группы. setState с тем же значением React отсекает сам.
  const handleVisibleDateChange = useCallback((label: string | null) => {
    setFloatingDate(label);
  }, []);

  const handleForward = (targetChatId: string) => {
    const socket = getSocket();
    if (!socket || !activeChat) return;

    // Берём сообщения через готовый индекс (O(1) на элемент) вместо
    // `chatMessages.find()` внутри map — это был O(n·m) проход.
    // Индексы уже упорядочены по времени, поэтому сортируем по ним.
    const messagesToForward = Array.from(selectedMessages)
      .map((id) => messageIndex.get(id))
      .filter((index): index is number => index !== undefined)
      .sort((a, b) => a - b)
      .map((index) => renderItems[index].message);

    messagesToForward.forEach(msg => {
      socket.emit('send_message', {
        chatId: targetChatId,
        content: msg.content,
        type: msg.type,
        forwardedFromId: msg.sender.id,
        mediaUrl: msg.media?.[0]?.url,
        mediaType: msg.media?.[0]?.type,
        fileName: msg.media?.[0]?.filename,
        fileSize: msg.media?.[0]?.size ?? undefined,
      });
    });

    setSelectionMode(false);
    setSelectedMessages(new Set());
    setShowForwardModal(false);
    setActiveChat(targetChatId);
  };

  const handleBulkDelete = (deleteForAll: boolean) => {
    const socket = getSocket();
    if (!socket || !activeChat) return;

    const ids = Array.from(selectedMessages);
    socket.emit('delete_messages', {
      messageIds: ids,
      chatId: activeChat,
      deleteForAll,
    });

    // Optimistic local removal
    if (!deleteForAll) {
      useChatStore.getState().hideMessages(ids, activeChat);
    }

    setSelectionMode(false);
    setSelectedMessages(new Set());
    setShowDeleteMenu(false);
  };

  // Все хуки объявлены выше — здесь остаётся только narrowing для TypeScript.
  // Обёртка ChatView уже проверила наличие активного чата, поэтому в норме
  // эта ветка недостижима (возможна лишь на один кадр при удалении чата).
  if (!activeChat || !chat) {
    return <EmptyChatState />;
  }

  return (
    <div
      ref={chatViewRef}
      onMouseMove={handleMouseMove}
      className={`flex-1 flex flex-col h-full ${isMobile ? 'rounded-none' : 'rounded-3xl'} overflow-hidden ${isMobile ? '' : 'shadow-[0_0_120px_-20px_rgba(0,0,0,0.5)] border border-border/50'} relative z-0 chat-theme-${chatTheme} transition-colors duration-500`}
      style={wallpaper ? {
        backgroundImage: wallpaper.startsWith('linear-gradient') ? undefined : `url(${wallpaper})`,
        background: wallpaper.startsWith('linear-gradient') ? wallpaper : undefined,
        backgroundSize: wallpaper.endsWith('.svg') ? '400px' : 'cover',
        backgroundRepeat: wallpaper.endsWith('.svg') ? 'repeat' : 'no-repeat',
        backgroundPosition: wallpaper.endsWith('.svg') ? '0 0' : 'center',
      } : undefined}
    >
      {/* шапка чата */}
      {selectionMode ? (
        <div className={`${isMobile ? 'min-h-[60px] px-4 safe-top' : 'h-[76px] px-6'} flex items-center justify-between border-b border-border/40 ${isMobile ? 'bg-surface-secondary' : 'bg-surface-secondary/80'} z-20 absolute top-0 left-0 right-0`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectionMode(false); setSelectedMessages(new Set()); }}
              className="text-[15px] font-medium text-white/70 hover:text-white transition-colors px-1"
            >
              {t('cancel')}
            </button>
            <span className="text-[15px] font-medium text-white tabular-nums">{selectedMessages.size}</span>
          </div>
          <div className="flex items-center gap-0.5">
            {/* Forward */}
            <button
              disabled={selectedMessages.size === 0}
              onClick={() => setShowForwardModal(true)}
              className="w-10 h-10 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Forward size={20} />
            </button>
            {/* Delete with dropdown */}
            <div className="relative" ref={deleteMenuRef}>
              <button
                disabled={selectedMessages.size === 0}
                onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                className="w-10 h-10 flex items-center justify-center rounded-full text-white/70 hover:text-red-400 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-white/70"
              >
                <Trash2 size={20} />
              </button>
              <AnimatePresence>
                {showDeleteMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-surface-secondary/95 backdrop-blur-2xl shadow-2xl z-50 py-1.5 ring-1 ring-border/50 overflow-hidden"
                  >
                    <button
                      onClick={() => handleBulkDelete(false)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Trash2 size={16} className="text-zinc-400" />
                      {t('deleteForMe')}
                    </button>
                    <div className="border-t border-border/30 mx-3" />
                    <button
                      onClick={() => handleBulkDelete(true)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={16} className="text-red-400" />
                      {t('deleteForAll')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {/* Copy */}
            <button
              disabled={selectedMessages.size === 0}
              onClick={() => {
                const msgTexts = Array.from(selectedMessages)
                  .map((id) => {
                    const msg = chatMessages?.find(m => m.id === id);
                    return msg?.content || '';
                  })
                  .filter(Boolean)
                  .join('\n');
                navigator.clipboard.writeText(msgTexts);
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Copy size={20} />
            </button>
            {/* Reply */}
            {selectedMessages.size === 1 && (
              <button
                onClick={() => {
                  const id = Array.from(selectedMessages)[0];
                  const msg = chatMessages?.find(m => m.id === id);
                  if (msg) {
                    setReplyTo(msg);
                    setSelectionMode(false);
                    setSelectedMessages(new Set());
                  }
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Reply size={20} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={`${isMobile ? 'min-h-[50px] px-2 safe-top' : 'h-[76px] px-6'} flex items-center justify-between gap-1.5 z-20 absolute top-3 left-0 right-0`}
        >
          {/* Mobile back button вЂ” Р°РЅРёРјРёСЂРѕРІР°РЅРЅР°СЏ Р·Р°РјРµРЅР° СЃС‚СЂРµР»РєРё РЅР° РєСЂРµСЃС‚РёРє */}
          {isMobile && onBack && (
            <button
              onClick={() => {
                if (showSearch) {
                  setShowSearch(false);
                  setSearchText('');
                  setSearchResults([]);
                } else {
                  onBack();
                }
              }}
              className={`${showSearch ? 'p-[0.8rem]' : 'p-[0.5rem]'} rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-surface-secondary transition-colors bg-[#272938] flex-shrink-0 border-t border-[#393c49]`}
            >
              <AnimatePresence mode="wait">
                {!showSearch ? (
                  <motion.span
                    key="back"
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 90 }}
                    transition={{ duration: 0.15 }}
                  >
                    <ArrowLeft size={25} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="close"
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 90 }}
                    transition={{ duration: 0.15 }}
                  >
                    <X size={25} />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              {showSearch ? (
                <motion.div
                  key="search"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                >
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={t('searchMessages')}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="w-full py-[0.7rem] px-3 rounded-[24px] bg-surface-secondary text-sm text-white placeholder-zinc-500 focus:border-accent outline-none"
                  />
                </motion.div>
              ) : (
                <motion.button
                  key="headerInfo"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1.5 min-w-0 w-full group rounded-[24px] bg-[#272938] transition-colors border-t border-[#393c49]"
                  onClick={() => {
                    if (chat.type === 'personal' && otherMember) {
                      setProfileUserId(otherMember.user.id);
                    } else if (chat.type === 'group') {
                      setShowGroupSettings(true);
                    }
                  }}
                >
                  <div className="relative flex-shrink-0 transform transition-transform duration-300 group-hover:scale-105">
                    {isFavorites ? (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg ring-2 ring-transparent group-hover:ring-accent/30 transition-all duration-300">
                        <Bookmark size={20} className="text-white" />
                      </div>
                    ) : (
                      <Avatar
                        src={chatAvatar}
                        name={chatName}
                        size="md"
                        online={isOnline ? true : undefined}
                        className="ring-2 ring-transparent group-hover:ring-accent/30 transition-all duration-300 rounded-full"
                      />
                    )}
                  </div>
                  <div className="min-w-0 text-left">
                    <h3 className="text-[15px] font-semibold text-white truncate drop-shadow-sm group-hover:text-accent/90 transition-colors">{chatName}</h3>
                    <p className="text-[13px] text-zinc-500 truncate">
                      {isFavorites
                          ? ''
                          : typingCount > 0
                            ? <span className="text-accent font-medium">{t('typing')}</span>
                            : isOnline
                              ? <span className="text-emerald-400">{t('online')}</span>
                              : chat.type === 'personal' && otherMember?.user.lastSeen
                                ? `${t('lastSeenAt')} ${formatLastSeen(otherMember.user.lastSeen, lang)}`
                                : chat.type === 'group'
                                  ? `${chat.members.length} ${t('members')}`
                                  : ''}
                    </p>
                  </div>
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-0 px-2 py-[4px] rounded-[2rem] bg-[#272938] flex-shrink-0 border-t border-[#393c49]">
            {!isFavorites && (
              <button
                onClick={() => {
                  if (chat.type === 'personal' && otherMember) {
                    onStartCall?.(otherMember.user, 'voice');
                  } else if (chat.type === 'group') {
                    onStartGroupCall?.(chat.id, chat.name || 'Group', 'voice');
                  }
                }}
                className="p-2 rounded-2xl hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white" title={t('call')}>
                <Phone size={20} />
              </button>
            )}


{/* Поиск в избранном */}
            {isFavorites && (
              <button
                onClick={openSearch}
                className="p-2 rounded-2xl hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white" title={t('searchMessages')}
              >
                <Search size={25} />
              </button>
            )}
            {/* РњРµРЅСЋ */}
            <div className="relative" ref={topMenuRef}>
              <button
                onClick={() => setShowTopMenu(!showTopMenu)}
                className="p-2 rounded-2xl hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
              >
                <MoreVertical size={20} />
              </button>
              <AnimatePresence>
                {showTopMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 rounded-2xl glass-strong shadow-2xl z-50 py-1.5 ring-1 ring-border/50 backdrop-blur-2xl"
                  >
                    <button
                      onClick={openSearch}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Search size={16} />
                      {t('searchMessages')}
                    </button>
                    {!isFavorites && (
                      <button
                        onClick={() => {
                          setShowTopMenu(false);
                          if (chat.type === 'personal' && otherMember) {
                            onStartCall?.(otherMember.user, 'video');
                          } else if (chat.type === 'group') {
                            onStartGroupCall?.(chat.id, chat.name || 'Group', 'video');
                          }
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                      >
                        <Video size={16} />
                        {t('videoCall')}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (activeChat) {
                          const nowMuted = toggleMuteChat(activeChat);
                          setMuted(nowMuted);
                        }
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      {muted ? <Bell size={16} /> : <BellOff size={16} />}
                      {muted ? t('enableSound') : t('disableSound')}
                    </button>
                    {chat.type === 'group' && (
                      <button
                        onClick={() => {
                          setShowTopMenu(false);
                          setShowGroupSettings(true);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                      >
                        <Settings size={16} />
                        {t('groupSettings')}
                      </button>
                    )}
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={() => {
                        setShowTopMenu(false);
                        if (activeChat) {
                          setConfirmAction({
                            message: t('clearChatConfirm'),
                            action: async () => {
                              try {
                                await api.clearChat(activeChat);
                                useChatStore.getState().clearMessages(activeChat);
                              } catch (e) {
                                console.error(e);
                              }
                            },
                          });
                        }
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Eraser size={16} />
                      {t('clearChat')}
                    </button>
                    <button
                      onClick={() => {
                        setShowTopMenu(false);
                        if (activeChat) {
                          setConfirmAction({
                            message: t('deleteChatConfirm'),
                            action: async () => {
                              try {
                                await api.deleteChat(activeChat);
                                useChatStore.getState().removeChat(activeChat);
                              } catch (e) {
                                console.error(e);
                              }
                            },
                          });
                        }
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 size={16} />
                      {t('deleteChat')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Р РµР·СѓР»СЊС‚Р°С‚С‹ РїРѕРёСЃРєР° */}
      <AnimatePresence>
        {showSearch && searchResults.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="absolute top-14 left-0 right-0 z-20 max-h-60 overflow-y-auto glass-strong border-b border-border"
          >
            {searchResults.map((msg) => (
              <div
                key={msg.id}
                className="px-4 py-2 hover:bg-surface-hover cursor-pointer border-b border-border/50 last:border-0"
                onClick={() => {
                  // Прокрутка к сообщению через виртуализатор: ряд может быть
                  // не смонтирован, поэтому scrollIntoView по DOM больше не
                  // подходит — scrollToMessage сам домонтирует нужный индекс.
                  scrollToMessage(msg.id);
                  setShowSearch(false);
                  setSearchText('');
                  setSearchResults([]);
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium" style={{ color: usernameColor }}>
                    {msg.sender?.displayName || msg.sender?.username}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {new Date(msg.createdAt).toLocaleDateString(lang === 'ru' ? 'ru' : 'en')}
                  </span>
                </div>
                <p className="text-sm text-zinc-300 truncate">{msg.content}</p>
              </div>
            ))}
          </motion.div>
        )}
       </AnimatePresence>

      {showPinnedSection && (
        <div
          style={{
            top: isMobile ? `calc(60px + env(safe-area-inset-top, 0px) + 7px)` : '80px',
          }}
          className="absolute left-0 right-0 z-20 px-2"
        >
          {/* Active group call banner */}
          {chat?.type === 'group' && activeGroupCallParticipants.length > 0 && (
            <button
              onClick={() => onStartGroupCall?.(chat.id, chat.name || 'Group', 'voice')}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-left w-full"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Phone size={14} className="text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-emerald-400">{t('activeCall')}</p>
                <p className="text-sm text-zinc-300">{activeGroupCallParticipants.length} {t('participants')}</p>
              </div>
              <span className="text-xs text-emerald-400 font-medium px-3 py-1 rounded-full bg-emerald-500/20">{t('joinCall')}</span>
            </button>
          )}

          {pinnedMsg && (
            <button
              onClick={() => scrollToMessage(pinnedMsg.id)}
              className="flex items-center gap-3 px-4 border-b border-border bg-[#272938] hover:bg-surface-hover transition-colors text-left w-full rounded-[15px]"
            >
              <Pin size={16} className="text-vortex-400 flex-shrink-0 rotate-45" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-vortex-400">{t('pinnedMessage')}</p>
                <p className="text-sm text-zinc-300 truncate">
                  {pinnedMsg.content || (pinnedMsg.media?.length > 0 ? t('media') : '...')}
                </p>
              </div>
              <X
                size={16}
                className="text-zinc-500 hover:text-white flex-shrink-0 transition-colors"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  const socket = getSocket();
                  if (socket && activeChat) {
                    socket.emit('unpin_message', { messageId: pinnedMsg.id, chatId: activeChat });
                  }
                }}
              />
            </button>
          )}
        </div>
      )}

      {/* Верхний градиент на чате — под шапкой/закрепом */}
      <div
        className="absolute top-0 left-0 right-0 z-[15] pointer-events-none bg-gradient-to-b from-[#0f081ca6] via-[#281b373d] to-transparent"
        style={{ height: isMobile ? `calc(60px + env(safe-area-inset-top, 0px) + 12px + ${showPinnedSection ? '65px' : '0px'})` : `calc(76px + 12px + ${showPinnedSection ? '65px' : '0px'})` }}
      />

      {/* «Плавающая» дата поверх списка.
          Живёт ВНЕ виртуального контента: ряды виртуализатора абсолютно
          позиционированы, поэтому sticky внутри ряда работать не может.
          Отступ сверху совпадает с padding-top контейнера сообщений, чтобы
          дата оказалась ровно под шапкой (и под закрепом, если он есть). */}
      {!isLoadingMessages && chatMessages.length > 0 && (
        <FloatingDateHeader
          label={floatingDate}
          visible={floatingDateVisible}
          top={
            isMobile
              ? `calc(60px + env(safe-area-inset-top, 0px) + 12px + ${showPinnedSection ? '65px' : '0px'})`
              : `calc(76px + 12px + ${showPinnedSection ? '65px' : '0px'})`
          }
        />
      )}

      {/* РЎРѕРѕР±С‰РµРЅРёСЏ */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto scroll-container-gpu messages-scroll h-full ${isMobile ? 'px-2' : `px-6${showPinnedSection ? ' pt-[calc(76px+65px+12px)]' : ' pt-[calc(76px+12px)]'}`} relative z-10 ${!scrollReady && !isLoadingMessages && chatMessages.length > 0 ? 'invisible' : ''}`}
        style={{ paddingTop: showPinnedSection ? (isMobile ? `calc(60px + env(safe-area-inset-top, 0px) + 65px + 12px)` : undefined) : (isMobile ? `calc(60px + env(safe-area-inset-top, 0px) + 12px)` : undefined), paddingBottom: `calc(${composerHeight}px + 0.5rem)` }}
      >
        {/* Индикатор загрузки старых сообщений.
            Слот всегда занимает место в потоке (h-24) и только меняет видимость
            содержимого, чтобы избежать скачков скролла при подгрузке истории. */}
        {hasMore && chatMessages.length > 0 && (
          <div className="flex flex-col items-center justify-center h-24 flex-shrink-0 overflow-hidden">
            <div
              className={`flex flex-col gap-1 transition-all duration-300 ${
                isLoadingMore
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-2'
              }`}
            >
              <CompactSkeleton />
              <CompactSkeleton />
              <CompactSkeleton />
            </div>
          </div>
        )}

        {isLoadingMessages ? null : chatMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-zinc-500">{t('noMessages')}</p>
          </div>
        ) : (
          /* Виртуализированный список: в DOM держатся только видимые сообщения
             плюс небольшой overscan, поэтому количество смонтированных
             MessageBubble не зависит от длины истории. */
          <MessageList
            ref={messageListRef}
            scrollRef={messagesContainerRef}
            items={renderItems}
            messageIndex={messageIndex}
            currentUserId={user?.id}
            pinnedMessageId={pinnedMsgId}
            otherMemberName={otherMemberName}
            otherMemberAvatar={chat?.type === 'personal' ? otherMember?.user.avatar ?? null : null}
            isGroup={isGroup}
            isMobile={isMobile}
            selectionMode={selectionMode}
            selectedMessages={selectedMessages}
            onViewProfile={handleViewProfile}
            onToggleSelect={handleToggleSelect}
            onStartSelectionMode={handleStartSelection}
            onReachTop={handleReachTop}
            topSlotVisible={hasMore}
            onVisibleDateChange={handleVisibleDateChange}
          />
        )}
      </div>

      {/* РљРЅРѕРїРєР° РїСЂРѕРєСЂСѓС‚РєРё РІРЅРёР· */}
      <AnimatePresence>
        {showScrollDown && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => scrollToBottom()}
            className="absolute bottom-20 right-6 w-11 h-11 rounded-full bg-[#272938] border-t border-border shadow-2xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-surface-hover hover:scale-105 transition-all z-20"
          >
            <ArrowDown size={20} />
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center shadow-lg border-2 border-surface-secondary"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </motion.span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Р“СЂР°РґРёРµРЅС‚РЅС‹Р№ scrim РґР»СЏ РїР»Р°РІРЅРѕРіРѕ РїРµСЂРµС…РѕРґР° СЃРѕРѕР±С‰РµРЅРёР№ РїРѕРґ РєР°РїСЃСѓР»Сѓ РІРІРѕРґР° */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-10 bg-gradient-to-t from-[#09090bb3] to-transparent" style={{ height: composerHeight ? `${composerHeight}px` : '60px' }} />

      {/* Typing РёРЅРґРёРєР°С‚РѕСЂ + Р’РІРѕРґ СЃРѕРѕР±С‰РµРЅРёСЏ вЂ” Р°Р±СЃРѕР»СЋС‚РЅРѕ СЃРЅРёР·Сѓ */}
      <div ref={composerRef} className="absolute bottom-0 left-0 right-0 z-20">
        {typingCount > 0 && (
          <div className="px-4 pb-1">
            <TypingIndicator />
          </div>
        )}

        <MessageInput chatId={activeChat} />
      </div>

      {/* РџСЂРѕС„РёР»СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ */}
      <AnimatePresence>
        {profileUserId && (
          <Suspense fallback={null}>
            <UserProfile
              userId={profileUserId}
              chatId={activeChat || undefined}
              onClose={() => setProfileUserId(null)}
              isSelf={profileUserId === user?.id}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* РќР°СЃС‚СЂРѕР№РєРё РіСЂСѓРїРїС‹ */}
      <AnimatePresence>
        {showGroupSettings && chat && chat.type === 'group' && (
          <Suspense fallback={null}>
            <GroupSettings
              chat={chat}
              onClose={() => setShowGroupSettings(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForwardModal && (
          <Suspense fallback={null}>
            <ForwardModal
              onClose={() => setShowForwardModal(false)}
              onForward={handleForward}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={!!confirmAction}
        message={confirmAction?.message || ''}
        onConfirm={() => {
          confirmAction?.action();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

const MemoActiveChatView = memo(ActiveChatView);

/**
 * Обёртка: решает, показывать заглушку или активный чат.
 *
 * Хуки здесь минимальны и объявлены ДО условного return, поэтому
 * Rules of Hooks соблюдаются в любом состоянии.
 */
function ChatView(props: ChatViewProps) {
  const hasActiveChat = useChatStore(s => !!s.activeChat && s.chats.some(c => c.id === s.activeChat));

  if (!hasActiveChat) {
    return <EmptyChatState />;
  }

  return <MemoActiveChatView {...props} />;
}

export default memo(ChatView);



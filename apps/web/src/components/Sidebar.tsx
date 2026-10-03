import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Download,
  Menu,
  MessageSquare,
  X,
  User as UserIcon,
  MoreVertical,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useAppUpdate } from '../lib/useAppUpdate';
import { useLang } from '../lib/i18n';
import { api } from '../lib/api';
import { getInitials, generateAvatarColor } from '../lib/utils';
import { getSocket } from '../lib/socket';
import { mediaUrl } from '../lib/media';
import Avatar from './Avatar';
import { StoryGroup } from '../lib/types';
import ChatListItem from './ChatListItem';
import { useAlwaysSearchBarScrollBehavior } from '../lib/useAlwaysSearchBarScrollBehavior';

// Lazy load modals — only needed when user opens them
const NewChatModal = lazy(() => import('./NewChatModal'));
const UserProfile = lazy(() => import('./UserProfile'));
const SideMenu = lazy(() => import('./SideMenu'));
const StoryViewer = lazy(() => import('./StoryViewer').then(m => ({ default: m.default })));
const CreateStoryModal = lazy(() => import('./StoryViewer').then(m => ({ default: m.CreateStoryModal })));

interface SidebarProps {
  isMobile?: boolean;
  onNewChatOpenChange?: (open: boolean) => void;
}

export default function Sidebar({ isMobile = false, onNewChatOpenChange }: SidebarProps) {
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  // Точечные селекторы: сайдбар не должен реагировать на изменения
  // messages/typingUsers/replyTo — это перерисовывало весь список чатов
  // (и вместе с ним ChatListItem) на каждое событие в открытом чате.
  const chats = useChatStore(s => s.chats);
  const activeChat = useChatStore(s => s.activeChat);
  const searchQuery = useChatStore(s => s.searchQuery);
  const setSearchQuery = useChatStore(s => s.setSearchQuery);
  const clearStore = useChatStore(s => s.clearStore);
  const t = useLang(s => s.t);
  const { updateAvailable, dismissed, applyUpdate } = useAppUpdate();
  const [showNewChat, setShowNewChat] = useState(false);

  // Notify parent when NewChat screen opens/closes (for hiding BottomNavigation)
  useEffect(() => {
    onNewChatOpenChange?.(showNewChat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showNewChat]);
  const [showProfile, setShowProfile] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [storyViewerIndex, setStoryViewerIndex] = useState<number | null>(null);
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showCreateAction, setShowCreateAction] = useState(false);
  const createActionRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { y, opacity, height } = useAlwaysSearchBarScrollBehavior(scrollRef, {
    searchBarHeight: isMobile ? 52 : 64,
  });

  useEffect(() => {
    const checkConnection = () => {
      const socket = getSocket();
      const isOffline = !navigator.onLine || !socket?.connected;
      setIsConnecting(isOffline);
    };

    // Проверяем сразу
    checkConnection();

    // Слушаем браузерный online/offline
    const handleOnline = () => checkConnection();
    const handleOffline = () => setIsConnecting(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Слушаем сокет
    const socket = getSocket();
    if (socket) {
      socket.on('connect', () => setIsConnecting(false));
      socket.on('disconnect', () => setIsConnecting(true));
      socket.on('connect_error', () => setIsConnecting(true));
    }

    // Периодическая проверка (на случай, если события не сработали)
    const interval = setInterval(checkConnection, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connect_error');
      }
      clearInterval(interval);
    };
  }, []);

  const loadStories = () => {
    api.getStories().then(setStoryGroups).catch(console.error);
  };

  useEffect(() => {
    loadStories();
    const interval = setInterval(loadStories, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Закрываем CreateAction dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (createActionRef.current && !createActionRef.current.contains(e.target as Node)) {
        setShowCreateAction(false);
      }
    };
    if (showCreateAction) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCreateAction]);

  const filteredChats = useMemo(() => chats.filter((chat) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    if (chat.name?.toLowerCase().includes(q)) return true;
    return chat.members.some(
      (m) =>
        m.user.id !== user?.id &&
        (m.user.username.toLowerCase().includes(q) ||
          m.user.displayName.toLowerCase().includes(q))
    );
  }).sort((a, b) => {
    // Favorites chat always on top
    if (a.type === 'favorites') return -1;
    if (b.type === 'favorites') return 1;
    return 0;
  }), [chats, searchQuery, user?.id]);

  const handleLogout = () => {
    clearStore();
    logout();
  };

  return (
    <>
      <div className={`${isMobile ? 'w-full' : 'w-[340px]'} h-full flex flex-col bg-surface-secondary ${isMobile ? 'rounded-none' : 'rounded-3xl'} overflow-hidden ${isMobile ? '' : 'border border-border/50 shadow-2xl'} relative z-10`}>
        {/* Шапка */}
        <div className={`${isMobile ? 'min-h-[50px] px-3 safe-top' : 'px-4'} flex items-center gap-3 border-border/40 bg-surface-secondary flex-shrink-0 relative z-30`}
        >
          {!isMobile && (
            <button
              onClick={() => setShowSideMenu(true)}
              className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
              title={t('menu')}
            >
              <Menu size={20} />
            </button>
          )}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">
              {isConnecting ? t('connecting') : t('modernMessengerShort')}
            </h1>
          </div>

          {/* Mini Banner — после dismiss full prompt */}
          <AnimatePresence>
            {updateAvailable && dismissed && (
              <motion.button
                key="sidebar-update-banner"
                layout
                initial={{ opacity: 0, scale: 0.85, x: 16 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85, x: 16 }}
                transition={{ type: 'spring', damping: 20, stiffness: 260 }}
                onClick={applyUpdate}
                className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-accent/90 border border-accent/30 shadow-sm active:scale-[0.97] transition-transform flex-shrink-0 overflow-hidden"
                title={t('updateApp')}
              >
                {/* Shimmer — белая полоса с наклоном, бегущая слева направо */}
                <motion.div
                  className="absolute inset-0 pointer-events-none z-0"
                  initial={{ x: '-100%' }}
                  animate={{ x: '200%' }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: 'linear', delay: 1 }}
                >
                  <div className="w-full h-full bg-gradient-to-r from-transparent via-white/25 to-transparent skew-x-[-20deg]" />
                </motion.div>

                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 relative z-[1]">
                  <Download size={12} className="text-white" />
                </div>
                <span className="text-[13px] font-semibold text-white whitespace-nowrap relative z-[1]">
                  {t('updateApp')}
                </span>
              </motion.button>
            )}
          </AnimatePresence>

          <div className="relative" ref={createActionRef}>
            <button
              onClick={() => setShowCreateAction(!showCreateAction)}
              className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
              title={t('newChat')}
            >
              <MoreVertical size={20} />
            </button>

            {showCreateAction && (
              <div className="absolute right-0 top-full mt-1 w-44 border border-border/50 rounded-2xl shadow-2xl overflow-hidden z-50" style={{ backgroundColor: 'rgb(24, 24, 31)' }}>
                <button
                  onClick={() => { setShowCreateAction(false); setShowNewChat(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-sm text-white"
                >
                  <MessageSquare size={16} className="text-zinc-400" />
                  {t('newChat')}
                </button>
                <button
                  onClick={() => { setShowCreateAction(false); setShowCreateStory(true); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors text-sm text-white"
                >
                  <span className="w-4 h-4 rounded-full border-2 border-dashed border-zinc-500 flex items-center justify-center flex-shrink-0">
                    <Plus size={10} className="text-zinc-500" />
                  </span>
                  {t('newStory')}
                </button>
              </div>
            )}
          </div>
        </div>

                {/* Story circles — только когда есть хотя бы одна история */}
        {storyGroups.length > 0 && (
          <div className={`flex items-center gap-3 ${isMobile ? 'px-3' : 'px-4 py-2'} overflow-x-auto scrollbar-hide border-border/20 flex-shrink-0 relative z-[15]`}>
            {storyGroups.map((group, idx) => {
              const avatarUrl = mediaUrl(group.user.avatar);
              const isMine = group.user.id === user?.id;
              return (
                <button
                  key={group.user.id}
                  onClick={() => setStoryViewerIndex(idx)}
                  className="flex flex-col items-center gap-1 flex-shrink-0 group"
                >
                  <div className={`${isMobile ? 'w-12 h-12' : 'w-14 h-14'} rounded-full p-[1.7px] transition-transform group-hover:scale-105 ${
                    group.hasUnviewed
                      ? 'bg-gradient-to-tr from-vortex-400 via-purple-500 to-pink-500 shadow-lg shadow-vortex-500/25'
                      : isMine
                        ? 'bg-gradient-to-tr from-zinc-500 to-zinc-600'
                        : 'bg-zinc-700'
                  }`}>
                    <div className="w-full h-full rounded-full overflow-hidden border-[2.5px] border-surface-secondary">
                      <Avatar
                        src={avatarUrl}
                        name={group.user.displayName || group.user.username}
                        size="lg"
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                  <span className={`text-[10px] text-zinc-400 truncate ${isMobile ? 'w-12' : 'w-14'} text-center`}>
                    {isMine ? t('myStory') : (group.user.displayName || group.user.username).split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Поиск — статичный, не уезжает и не схлопывается */}
        <div className="relative z-0 bg-transparent flex-shrink-0"
        >
          <div className={`${isMobile ? 'p-3' : 'p-4'}`}>
            <div className="relative group">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-accent transition-colors" />
              <input
                type="text"
                placeholder={t('searchChats')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-11 pr-10 ${isMobile ? 'py-2.5 rounded-xl text-sm' : 'py-3 rounded-2xl text-[15px]'} font-medium text-white placeholder-zinc-500 hover:border-border/60 focus:border-accent transition-all outline-none shadow-inner`}
                style={{ background: '#30323f' }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full bg-surface-hover text-zinc-400 hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Список чатов */}
        <div
          ref={scrollRef}
          className={`flex-1 overflow-y-auto scroll-container-gpu ${isMobile ? 'pb-20' : ''}`}
        >

          {filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3 px-6">
              <MessageSquare size={40} className="opacity-30" />
              <p className="text-sm text-center">
                {searchQuery ? t('nothingFound') : t('noChats')}
              </p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <ChatListItem key={chat.id} chat={chat} isActive={!isMobile && chat.id === activeChat} />
            ))
          )}
        </div>
      </div>

      {/* Модалки */}
      <AnimatePresence>
        {showNewChat && (
          <Suspense fallback={null}>
            <NewChatModal onClose={() => setShowNewChat(false)} />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showProfile && (
          <Suspense fallback={null}>
            <UserProfile userId={user!.id} onClose={() => setShowProfile(false)} isSelf />
          </Suspense>
        )}
      </AnimatePresence>
      {showSideMenu && (
        <Suspense fallback={null}>
          <SideMenu
            isOpen={showSideMenu}
            onClose={() => setShowSideMenu(false)}
            isMobile={isMobile}
          />
        </Suspense>
      )}
      <AnimatePresence>
        {storyViewerIndex !== null && storyGroups.length > 0 && (
          <Suspense fallback={null}>
            <StoryViewer
              stories={storyGroups}
              initialUserIndex={storyViewerIndex}
              onClose={() => { setStoryViewerIndex(null); loadStories(); }}
              onRefresh={loadStories}
            />
          </Suspense>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showCreateStory && (
          <Suspense fallback={null}>
            <CreateStoryModal
              onClose={() => setShowCreateStory(false)}
              onCreated={loadStories}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}

import { useState, useRef, useEffect, memo } from 'react';
import { Check, CheckCheck, Image, FileText, Mic, Video, Pin, Trash2, Bookmark } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { useLang } from '../lib/i18n';
import { useChatSettingsStore } from '../stores/chatSettingsStore';
import { stripMarkdown, formatChatTime } from '../lib/utils';
import { api } from '../lib/api';
import ConfirmModal from './ConfirmModal';
import Avatar from './Avatar';
import type { Chat } from '../lib/types';

interface ChatListItemProps {
  chat: Chat;
  isActive: boolean;
}

function ChatListItem({ chat, isActive }: ChatListItemProps) {
  const user = useAuthStore(s => s.user);
  const setActiveChat = useChatStore(s => s.setActiveChat);
  const loadMessages = useChatStore(s => s.loadMessages);
  const loadChats = useChatStore(s => s.loadChats);
  // Подписываемся только на «мои» данные этого чата, а не на весь store:
  // typing/draft в других чатах больше не перерисовывают этот элемент списка.
  const isTyping = useChatStore(s =>
    s.typingUsers.some((typingUser) => typingUser.chatId === chat.id && typingUser.userId !== user?.id),
  );
  const draft = useChatStore(s => s.drafts[chat.id] || '');
  const t = useLang(s => s.t);
  const lang = useLang(s => s.lang);
  const chatListStyle = useChatSettingsStore(s => s.chatListStyle);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const ctxRef = useRef<HTMLDivElement>(null);

  const myMember = chat.members.find((m) => m.user.id === user?.id);
  const isPinned = myMember?.isPinned ?? false;

  const otherMember = chat.members.find((m) => m.user.id !== user?.id);
  const isFavorites = chat.type === 'favorites';
  const chatName = isFavorites
    ? t('favorites')
    : chat.type === 'personal'
      ? otherMember?.user.displayName || otherMember?.user.username || t('chat')
      : chat.name || t('group');

  const chatAvatar = isFavorites
    ? null
    : chat.type === 'personal'
      ? otherMember?.user.avatar
      : chat.avatar;

  const isOnline = chat.type === 'personal' && otherMember?.user.isOnline;

  const lastMessage = chat.messages?.[0];
  const lastMessageText = lastMessage
    ? lastMessage.isDeleted
      ? t('messageDeleted')
      : lastMessage.type === 'voice'
        ? t('voice')
        : lastMessage.type === 'file' || lastMessage.type === 'image' || lastMessage.type === 'video' || lastMessage.type === 'video_message'
          ? lastMessage.media?.[0]?.type === 'image'
            ? t('photo')
            : lastMessage.media?.[0]?.type === 'video'
              ? t('video')
              : t('file')
          : lastMessage.content || ''
    : '';

  const previewText = stripMarkdown(lastMessageText);

  const isMine = lastMessage?.senderId === user?.id;

  // Галочки прочтения
  const isRead = lastMessage?.readBy?.some((r) => r.userId !== user?.id);

  const timeStr = lastMessage ? formatChatTime(lastMessage.createdAt, lang) : '';

  const handleClick = () => {
    setActiveChat(chat.id);
    // Загружаем сообщения только если их ещё нет в кеше
    const existingMessages = useChatStore.getState().messages[chat.id];
    if (!existingMessages || existingMessages.length === 0) {
      loadMessages(chat.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  const handlePin = async () => {
    setCtxMenu(null);
    try {
      await api.togglePinChat(chat.id);
      loadChats();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async () => {
    setCtxMenu(null);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    try {
      await api.deleteChat(chat.id);
      useChatStore.getState().removeChat(chat.id);
    } catch (e) { console.error(e); }
  };

  const initials = chatName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${
          isActive ? 'bg-accent/15 border-r-2 border-accent' : 'hover:bg-surface-hover'
        }`}
      >
        {/* Аватар */}
        <div className="relative flex-shrink-0">
          {isFavorites ? (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
              <Bookmark size={22} className="text-white" />
            </div>
          ) : (
            <Avatar src={chatAvatar} name={chatName} size="lg" online={isOnline ? true : undefined} />
          )}
        </div>

        {/* Инфо */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              {isPinned && <Pin size={12} className="text-vortex-400 flex-shrink-0 rotate-45" />}
              <span className="text-sm font-medium text-white truncate">{chatName}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {isMine && lastMessage && !lastMessage.isDeleted && (
                <span className="flex-shrink-0">
                  {isRead ? (
                    <CheckCheck size={18} className="text-vortex-400" />
                  ) : (
                    <Check size={18} className="text-zinc-500" />
                  )}
                </span>
              )}
              {timeStr && <span className={`text-xs flex-shrink-0 ${chat.unreadCount > 0 && !isActive ? 'text-accent' : 'text-zinc-500'}`}>{timeStr}</span>}
            </div>
          </div>
          <div className={`flex items-center justify-between ${chatListStyle === 'three-line' ? 'mt-1' : 'mt-0.5'}`}>
            <div className="flex items-center gap-1 min-w-0 flex-1">
              <p className={`text-xs ${chatListStyle === 'three-line' ? 'line-clamp-2' : 'truncate'} ${isTyping ? 'text-vortex-400 font-medium' : draft ? 'text-red-400' : 'text-zinc-400'}`}>
                {isTyping ? t('typing') : draft ? <><span className="font-medium">{t('draft')} </span>{stripMarkdown(draft)}</> : previewText}
              </p>
            </div>
            {chat.unreadCount > 0 && !isActive && (
              <span className="ml-2 flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-accent flex items-center justify-center text-[11px] text-white font-medium">
                {chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Context Menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-[9999] min-w-[180px] py-1 rounded-xl bg-surface-secondary border border-border shadow-xl animate-in fade-in zoom-in-95 duration-100"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button
            onClick={handlePin}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
          >
            <Pin size={16} className={isPinned ? 'rotate-45' : ''} />
            {isPinned ? t('unpinChat') : t('pinChat')}
          </button>
          <div className="border-t border-border my-1" />
          <button
            onClick={handleDelete}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={16} />
            {t('deleteChat')}
          </button>
        </div>
      )}

      <ConfirmModal
        open={showDeleteConfirm}
        message={t('deleteChatConfirm')}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

export default memo(ChatListItem);

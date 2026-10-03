import { useState, useRef, useEffect, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CheckCheck,
  Play,
  Pause,
  Download,
  FileText,
  Copy,
  Pencil,
  Trash2,
  Reply,
  Smile,
  MoreHorizontal,
  X,
  Volume2,
  VolumeX,
  Pin,
  Clock,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatSettingsStore, COLOR_THEMES } from '../stores/chatSettingsStore';
import { useChatStore } from '../stores/chatStore';
import { getSocket } from '../lib/socket';
import { useLang } from '../lib/i18n';
import {
  extractWaveform,
  flatWaveform,
  getCachedWaveform,
  waveformFromMedia,
  WAVEFORM_BARS,
} from '../lib/waveform';
import { mediaUrl, mediaPreviewUrl, mediaOriginalUrl } from '../lib/media';
import { openUrl } from '../lib/native';
import CachedImage from './CachedImage';
import type { Message } from '../lib/types';


// Lazy load lightbox — only needed when user clicks on an image
const ImageLightbox = lazy(() => import('./ImageLightbox'));

/** Заглушка waveform (ровные столбики) — один общий массив на всё приложение. */
const FLAT_WAVEFORM = flatWaveform();

/** Конвертирует HEX-цвет (#rrggbb) в CSS-строку `rgb(r, g, b)`. */
function hexToRgb(hex: string): string {
  const s = hex.replace('#', '');
  const r = parseInt(s.substring(0, 2), 16);
  const g = parseInt(s.substring(2, 4), 16);
  const b = parseInt(s.substring(4, 6), 16);
  return `rgb(${r},${g},${b})`;
}

/** Декоративный «псевдо-waveform» для обычных аудиофайлов (mp3 и т.п.). */
const AUDIO_DECOR_BARS = [
  40, 65, 35, 80, 50, 90, 45, 70, 55, 85, 30, 75, 60, 95,
  40, 80, 50, 70, 35, 90, 55, 65, 45, 85, 60, 75, 50, 40,
];

/** Быстрые реакции контекстного меню — вынесены из рендера. */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🥰'];

/**
 * Проверяет, состоит ли строка ТОЛЬКО из эмодзи (и пробелов).
 * Использует Unicode property `Extended_Pictographic` + комбайнеры эмодзи.
 */
function isEmojiOnly(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^[\s\p{Extended_Pictographic}\u200D\uFE0F\u20E3]*$/u.test(text) &&
         /\p{Extended_Pictographic}/u.test(text);
}

/** Приблизительный подсчёт эмодзи-символов (для выбора режима: 1 или 2+). */
function countEmojis(text: string): number {
  const stripped = text.replace(/\s/g, '');
  return (stripped.match(/\p{Extended_Pictographic}/gu) || []).length;
}

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  showAvatar: boolean;
  isLastInGroup?: boolean;
  isPinned?: boolean;
  otherMemberName?: string;
  otherMemberAvatar?: string | null;
  isGroup?: boolean;
  onViewProfile?: (userId: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onStartSelectionMode?: (id: string) => void;
  isMobile?: boolean;
}

/**
 * Плашка «сообщение удалено».
 *
 * Выделена в отдельный компонент, потому что раньше `MessageBubble` делал
 * условный `return` ПОСЛЕ части хуков, а остальные хуки (video/reactions)
 * объявлялись ниже — порядок хуков менялся между рендерами, что нарушало
 * Rules of Hooks. Теперь у удалённого и активного сообщения свои,
 * неизменные наборы хуков.
 */
const DeletedMessageBubble = memo(function DeletedMessageBubble({
  isMine,
}: {
  isMine: boolean;
}) {
  const t = useLang(s => s.t);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 1, height: 'auto' }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, height: 0 }}
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}
    />
  );
});

function ActiveMessageBubble({
  message,
  isMine,
  showAvatar,
  isLastInGroup = false,
  isPinned = false,
  otherMemberName = '',
  otherMemberAvatar = null,
  isGroup = false,
  onViewProfile,
  selectionMode,
  isSelected,
  onToggleSelect,
  onStartSelectionMode,
  isMobile = false,
}: MessageBubbleProps) {
  const user = useAuthStore(s => s.user);
  // Точечные селекторы вместо подписки на весь settings-store: смена любой
  // несвязанной настройки (тема, обои, стикеры) больше не перерисовывает
  // все смонтированные пузыри.
  const messageTextSize = useChatSettingsStore(s => s.messageTextSize);
  const messageCornerRadius = useChatSettingsStore(s => s.messageCornerRadius);
  const mediaCornerRadius = useChatSettingsStore(s => s.mediaCornerRadius);
  const usernameColor = useChatSettingsStore(s => s.usernameColor);
  const colorThemeId = useChatSettingsStore(s => s.colorThemeId);
  // TeMy: uBety gradienta dly puzirey
  const activeTheme = COLOR_THEMES.find(t => t.id === colorThemeId) ?? COLOR_THEMES[0];
  const bubbleColors = {
    bubbleMy: hexToRgb(activeTheme.bubbleMy),
    bubbleMyTo: hexToRgb(activeTheme.bubbleMyTo),
    bubbleOther: hexToRgb(activeTheme.bubbleOther),
    bubbleOtherTo: hexToRgb(activeTheme.bubbleOtherTo),
  };
  const setReplyTo = useChatStore(s => s.setReplyTo);
  const setEditingMessage = useChatStore(s => s.setEditingMessage);
  const t = useLang(s => s.t);
  const lang = useLang(s => s.lang);
  const [showContext, setShowContext] = useState(false);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const [deleteMenuMode, setDeleteMenuMode] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showPauseHint, setShowPauseHint] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const pauseHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [quotedText, setQuotedText] = useState<string | null>(null);

  // ── Swipe-to-reply gesture (Telegram-style) ──
  const SWIPE_THRESHOLD = 60; // px to trigger reply
  const MAX_SWIPE = 100; // max visual offset
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipeLockedRef = useRef<'horizontal' | 'vertical' | null>(null);
  const swipeTriggeredRef = useRef(false);
  const [swipeX, setSwipeX] = useState(0);

  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile || selectionMode) return;
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    swipeLockedRef.current = null;
    swipeTriggeredRef.current = false;
  }, [isMobile, selectionMode]);

  const handleSwipeTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeStartRef.current || !isMobile || selectionMode) return;
    const touch = e.touches[0];
    const dx = touch.clientX - swipeStartRef.current.x;
    const dy = touch.clientY - swipeStartRef.current.y;

    // Lock direction after 8px of movement
    if (!swipeLockedRef.current) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        swipeLockedRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      return;
    }

    // If vertical scroll detected — bail out
    if (swipeLockedRef.current === 'vertical') return;

    // Only allow swipe-left (negative dx)
    const offset = Math.max(0, Math.min(-dx, MAX_SWIPE));
    setSwipeX(offset);

    // Haptic feedback at threshold crossing
    if (offset >= SWIPE_THRESHOLD && !swipeTriggeredRef.current) {
      swipeTriggeredRef.current = true;
      try { navigator?.vibrate?.(12); } catch { /* unsupported */ }
    }
    if (offset < SWIPE_THRESHOLD) {
      swipeTriggeredRef.current = false;
    }
  }, [isMobile, selectionMode]);

  const handleSwipeTouchEnd = useCallback(() => {
    if (swipeX >= SWIPE_THRESHOLD) {
      // Trigger reply
      setReplyTo(message);
    }
    setSwipeX(0);
    swipeStartRef.current = null;
    swipeLockedRef.current = null;
    swipeTriggeredRef.current = false;
  }, [swipeX, message, setReplyTo]);

  // ── Разбор медиа сообщения ──
  // Считается один раз на изменение media (а не при каждом рендере) и ДО любых
  // условных return, чтобы порядок хуков был стабилен (Rules of Hooks).
  const mediaInfo = useMemo(() => {
    const media = message.media || [];
    const voice = media.find((m) => m.type === 'voice');
    const hasVoice = message.type === 'voice' || !!voice;
    return {
      media,
      voice,
      audio: media.find((m) => m.type === 'audio'),
      images: media.filter((m) => m.type === 'image'),
      videos: media.filter((m) => m.type === 'video'),
      files: media.filter(
        (m) => m.type !== 'image' && m.type !== 'voice' && m.type !== 'video' && m.type !== 'audio',
      ),
      hasVoice,
      hasAudio: !hasVoice && (message.type === 'audio' || media.some((m) => m.type === 'audio')),
    };
  }, [message.media, message.type]);

  const media = mediaInfo.media;
  const hasImage = mediaInfo.images.length > 0;
  const hasVideo = mediaInfo.videos.length > 0;
  const hasVoice = mediaInfo.hasVoice;
  const hasAudio = mediaInfo.hasAudio;
  const hasFile = mediaInfo.files.length > 0;
  const isVideoMessage = message.type === 'video_message';

  // ── Эмодзи-режимы (как в Telegram): без фона пузыря ──
  const isEmojiOnlyContent = isEmojiOnly(message.content || '');
  const emojiCount = isEmojiOnlyContent ? countEmojis(message.content || '') : 0;
  const isBigEmoji = emojiCount === 1;                    // 1 эмодзи → очень крупно
  const isEmojiGrid = emojiCount >= 2;                    // 2+ эмодзи → помельче, в несколько рядов

  const voiceUrl = mediaInfo.voice ? mediaUrl(mediaInfo.voice.url) : null;
  /** Waveform, пришедший с сервера — основной путь, без fetch/decode. */
  const serverWaveform = waveformFromMedia(mediaInfo.voice?.waveform);

  // Fallback только для старых голосовых без серверного waveform.
  // Инициализируем из общего кеша, чтобы повторный монтаж ряда виртуального
  // списка не запускал декодирование заново.
  const [decodedWaveform, setDecodedWaveform] = useState<number[] | null>(() =>
    voiceUrl && !serverWaveform ? getCachedWaveform(voiceUrl) ?? null : null,
  );

  useEffect(() => {
    // Есть готовый waveform с сервера — ничего не скачиваем и не декодируем.
    if (!voiceUrl || serverWaveform) return;

    const cached = getCachedWaveform(voiceUrl);
    if (cached) {
      setDecodedWaveform(cached);
      return;
    }

    // extractWaveform дедуплицирует одинаковые URL и ограничивает
    // параллелизм, поэтому несколько голосовых рядом не поднимают
    // несколько AudioContext одновременно.
    let cancelled = false;
    extractWaveform(voiceUrl, WAVEFORM_BARS).then((bars) => {
      if (!cancelled) setDecodedWaveform(bars);
    });
    return () => { cancelled = true; };
  }, [voiceUrl, serverWaveform]);

  const waveformBars = serverWaveform ?? decodedWaveform;

  // Прочитано
  const isRead = message.readBy?.some((r) => r.userId !== user?.id);

  const timeStr = new Date(message.createdAt).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleCopy = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
    }
    setShowContext(false);
  };

  const handleReply = () => {
    setReplyTo({ ...message, quote: quotedText });
    setShowContext(false);
    setQuotedText(null);
  };

  const handleEdit = () => {
    setEditingMessage(message);
    setShowContext(false);
  };

  const handleDeleteForAll = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('delete_messages', {
        messageIds: [message.id],
        chatId: message.chatId,
        deleteForAll: true,
      });
    }
    setShowContext(false);
    setDeleteMenuMode(false);
  };

  const handleDeleteForMe = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('delete_messages', {
        messageIds: [message.id],
        chatId: message.chatId,
        deleteForAll: false,
      });
    }
    // Optimistic hide
    useChatStore.getState().hideMessages([message.id], message.chatId);
    setShowContext(false);
    setDeleteMenuMode(false);
  };

  const handlePin = () => {
    const socket = getSocket();
    if (socket) {
      if (isPinned) {
        socket.emit('unpin_message', { messageId: message.id, chatId: message.chatId });
      } else {
        socket.emit('pin_message', { messageId: message.id, chatId: message.chatId });
      }
    }
    setShowContext(false);
  };

  const handleReaction = (emoji: string) => {
    const socket = getSocket();
    if (socket) {
      const existingReaction = message.reactions?.find(
        (r) => r.userId === user?.id && r.emoji === emoji
      );
      if (existingReaction) {
        socket.emit('remove_reaction', { messageId: message.id, chatId: message.chatId, emoji });
      } else {
        socket.emit('add_reaction', { messageId: message.id, chatId: message.chatId, emoji });
      }
    }
    setShowContext(false);
  };

  const handleDoubleClickReaction = () => {
    handleReaction('👍');
  };

  // Аудио плеер
  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      // Ensure audio is loaded before playing
      if (audio.readyState < 2) {
        audio.load();
      }
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Audio play error:', err);
        // Try reloading and playing again
        audio.load();
        audio.play().then(() => setIsPlaying(true)).catch(console.error);
      });
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setAudioProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const onLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setAudioProgress(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // ── Video playback handlers ──
  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = (e.currentTarget as HTMLElement).querySelector('video');
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
      setVideoPlaying(true);
    } else {
      video.pause();
      setVideoPlaying(false);
      // Flash pause hint
      setShowPauseHint(true);
      if (pauseHintTimerRef.current) clearTimeout(pauseHintTimerRef.current);
      pauseHintTimerRef.current = setTimeout(() => setShowPauseHint(false), 400);
    }
  }, []);

  // Cleanup pause hint timer
  useEffect(() => {
    return () => {
      if (pauseHintTimerRef.current) clearTimeout(pauseHintTimerRef.current);
    };
  }, []);  

  // Waveform больше не требует IntersectionObserver: виртуализатор сам
  // монтирует только видимые сообщения, а данные приходят с сервера
  // (см. useEffect с extractWaveform выше — он нужен лишь для старых голосовых).

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Close context menu logic
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showContext) return;
    const hideMenu = (e: MouseEvent) => {
      // Don't close if clicking inside the context menu
      if (contextMenuRef.current?.contains(e.target as Node)) {
        return;
      }
      setShowContext(false);
      setDeleteMenuMode(false);
    };
    window.addEventListener('click', hideMenu, true);
    window.addEventListener('contextmenu', hideMenu, true);
    return () => {
      window.removeEventListener('click', hideMenu, true);
      window.removeEventListener('contextmenu', hideMenu, true);
    };
  }, [showContext]);

  // Sync video events & auto-play on visibility
  useEffect(() => {
    const videos = Array.from(videoRefs.current.values());
    if (videos.length === 0) return;

    const onPlay = () => setVideoPlaying(true);
    const onPause = () => setVideoPlaying(false);
    const onEnded = () => { setVideoPlaying(false); setVideoProgress(0); setVideoCurrentTime(0); };
    const onTimeUpdate = () => {
      for (const v of videos) {
        if (!v.paused && v.duration) {
          setVideoProgress((v.currentTime / v.duration) * 100);
          setVideoCurrentTime(v.currentTime);
          if (videoDuration === 0 || Math.abs(v.duration - videoDuration) > 0.1) {
            setVideoDuration(v.duration);
          }
          break;
        }
      }
    };
    const onLoadedMetadata = () => {
      for (const v of videos) {
        if (v.duration) { setVideoDuration(v.duration); break; }
      }
    };

    for (const video of videos) {
      video.addEventListener('play', onPlay);
      video.addEventListener('pause', onPause);
      video.addEventListener('ended', onEnded);
      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('loadedmetadata', onLoadedMetadata);
    }

    // IntersectionObserver: auto-play when visible, pause when hidden
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      { threshold: 0.5 }
    );

    for (const video of videos) {
      observer.observe(video);
    }

    return () => {
      observer.disconnect();
      for (const video of videos) {
        video.removeEventListener('play', onPlay);
        video.removeEventListener('pause', onPause);
        video.removeEventListener('ended', onEnded);
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
      }
    };
  }, [hasVideo, message.id]);

  // Остановка воспроизведения при размонтировании ряда.
  //
  // С виртуализацией пузыри уходят из DOM при скролле. Без явного pause()
  // браузер может продолжать проигрывать уже «оторванный» медиаэлемент —
  // получался бы фантомный звук и удержание буфера в памяти.
  // (`src` не сбрасываем: load() на размонтировании вызвал бы лишний
  // error-эвент, а освобождение буфера сделает GC вместе с элементом.)
  useEffect(() => {
    const audio = audioRef.current;
    const videos = videoRefs.current;
    return () => {
      try { audio?.pause(); } catch { /* элемент уже уничтожен */ }
      videos.forEach((video) => {
        try { video.pause(); } catch { /* элемент уже уничтожен */ }
      });
    };
  }, [hasVoice, hasAudio, hasVideo]);

  // Группировка реакций
  const reactionGroups = useMemo(() => {
    const groups: Record<string, { count: number; users: string[]; userIds: string[]; isMine: boolean }> = {};
    (message.reactions || []).forEach((r) => {
      if (!groups[r.emoji]) {
        groups[r.emoji] = { count: 0, users: [], userIds: [], isMine: false };
      }
      groups[r.emoji].count++;
      groups[r.emoji].users.push(r.user?.displayName || r.user?.username || '');
      groups[r.emoji].userIds.push(r.userId);
      if (r.userId === user?.id) groups[r.emoji].isMine = true;
    });
    return groups;
  }, [message.reactions, user?.id]);

  const senderName = message.sender?.displayName || message.sender?.username || '';
  const senderAvatar = mediaUrl(message.sender?.avatar);
  // Показывать имя отправителя внутри первого пузыря в группе (как в Telegram)
  const showSenderName = !isMine && showAvatar && isGroup && !isVideoMessage;
  // Для медиа-сообщений имя рисуется оверлеем поверх содержимого (как в Telegram)
  const showNameOverlay = showSenderName && !message.forwardedFrom && (hasImage || hasVideo);

  // Simple Markdown + URL formatter
  const renderFormattedText = (text: string) => {
    if (!text) return text;
    // Split by *, _, ~, ` blocks, @mentions and URLs while keeping the delimiters
    const parts = text.split(/(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|_[\s\S]*?_|~[\s\S]*?~|`[\s\S]*?`|@\w+|https?:\/\/[^\s<>"']+)/g);

    return parts.map((part, i) => {
      // URL — кликабельная ссылка
      if (/^https?:\/\//i.test(part)) {
        const displayUrl = part.length > 40 ? part.slice(0, 38) + '…' : part;
        return (
          <a
            key={i}
            href={part}
            className={`underline decoration-dotted underline-offset-2 cursor-pointer ${isMine ? 'text-white/90 hover:text-white' : 'text-sky-400 hover:text-sky-300'}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              void openUrl(part);
            }}
            title={part}
          >{displayUrl}</a>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
      if (part.startsWith('_') && part.endsWith('_')) return <em key={i} className="italic">{part.slice(1, -1)}</em>;
      if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic">{part.slice(1, -1)}</em>;
      if (part.startsWith('~') && part.endsWith('~')) return <del key={i} className="line-through opacity-80">{part.slice(1, -1)}</del>;
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="font-mono text-[13px] bg-black/20 px-1 py-0.5 rounded-[0.35rem]">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith('@') && part.length > 1) {
        const mentionUsername = part.slice(1);
        return (
          <span
            key={i}
            className="font-semibold text-sky-300 cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              const chat = useChatStore.getState().chats.find(c => c.id === message.chatId);
              const members = chat?.members || [];
              const found = members.find((m) => m.user?.username === mentionUsername);
              if (found) {
                onViewProfile?.(found.user.id);
              }
            }}
          >{part}</span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Telegram-style border-radius: хвостик у последнего сообщения в группе
  const bubbleRadius = (() => {
    if (hasImage && !message.content) return `${mediaCornerRadius}px`;
    if (hasVideo && !message.content && !isVideoMessage) return `${mediaCornerRadius}px`;
    if (isVideoMessage) return '50%';
    const r = `${messageCornerRadius}px`;
    if (isLastInGroup) {
      if (isMine) return `${r} ${r} 4px ${r}`;
      return `${r} ${r} ${r} 4px`;
    }
    return `${r} ${r} ${r} ${r}`;
  })();

  // Extract first URL from message content for link preview
  const firstUrl = useMemo(() => {
    if (!message.content) return null;
    const match = message.content.match(/https?:\/\/[^\s<>"']+/i);
    return match ? match[0] : null;
  }, [message.content]);
  const swipeProgress = Math.min(swipeX / SWIPE_THRESHOLD, 1);
  const swipeActive = swipeX > 0;

  // ── Long press → selection mode (Telegram-style) ──
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const pointerMovedRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (selectionMode) return;
    pointerMovedRef.current = false;
    longPressTriggeredRef.current = false;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onStartSelectionMode?.(message.id);
      try { navigator?.vibrate?.(10); } catch { /* */ }
    }, 500);
  }, [selectionMode, message.id, onStartSelectionMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    if (dx > 8 || dy > 8) {
      pointerMovedRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // If long press triggered — suppress the click
    if (longPressTriggeredRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (pointerMovedRef.current) {
      pointerMovedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
    pointerStartRef.current = null;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (selectionMode) {
      onToggleSelect?.(message.id);
      return;
    }
    // Tap → open popup — left-aligned near the bubble
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 208;
    const menuHeight = 350;
    const PADDING = 12;
    let x = rect.left + PADDING;
    let y = rect.top - 8;
    if (x + menuWidth > window.innerWidth - PADDING) x = window.innerWidth - menuWidth - PADDING;
    if (x < PADDING) x = PADDING;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    setContextPos({ x, y });
    setShowContext(true);
  }, [selectionMode, message.id, onToggleSelect]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectionMode) {
      onToggleSelect?.(message.id);
      return;
    }
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Check if text is selected inside this bubble
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && bubbleRef.current?.contains(selection?.anchorNode || null)) {
      setQuotedText(text);
    } else {
      setQuotedText(null);
    }

    const menuWidth = 208;
    const menuHeight = 350;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;

    setContextPos({ x, y });
    setShowContext(true);
  }, [selectionMode, message.id, onToggleSelect]);

  return (
    <>
      {/* Swipe-to-reply outer wrapper */}
      <div
        className={`relative overflow-hidden ${isLastInGroup ? 'mb-1.5' : 'mb-[3px]'}`}
        onTouchStart={handleSwipeTouchStart}
        onTouchMove={handleSwipeTouchMove}
        onTouchEnd={handleSwipeTouchEnd}
        onTouchCancel={handleSwipeTouchEnd}
      >
        {/* Reply icon revealed behind the message */}
        {isMobile && swipeActive && (
          <div
            className="absolute right-0 top-0 bottom-0 flex items-center pointer-events-none z-0"
            style={{ width: swipeX }}
          >
            <div
              className="mr-3 flex items-center justify-center rounded-full"
              style={{
                width: 36,
                height: 36,
                background: swipeProgress >= 1 ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)',
                transform: `scale(${0.5 + swipeProgress * 0.5})`,
                opacity: Math.min(swipeProgress * 1.5, 1),
                transition: swipeProgress >= 1 ? 'background 0.15s' : 'none',
              }}
            >
              <Reply
                size={18}
                className={swipeProgress >= 1 ? 'text-accent' : 'text-zinc-400'}
                style={{
                  transform: `rotate(${-15 + swipeProgress * 15}deg)`,
                  transition: swipeProgress >= 1 ? 'color 0.15s' : 'none',
                }}
              />
            </div>
          </div>
        )}

        {/* Sliding message content */}
        <div
          ref={bubbleRef}
          className={`flex ${isMine ? 'justify-end' : 'justify-start'} group relative transition-colors duration-200 ${selectionMode ? 'pl-12 pr-4 -mx-4 cursor-pointer hover:bg-white/5 rounded-xl' : ''
            } ${isSelected ? 'bg-[#655ed414] hover:bg-[#655ed4]/20' : ''}`}
          style={{
            transform: swipeActive ? `translateX(${-swipeX}px)` : undefined,
            transition: swipeActive ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1)',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={handleClick}
          onContextMenu={handleContextMenu}
        >
          {/* Selection Checkbox — прижат к левому краю ряда */}
          {selectionMode && (
            <div className="absolute left-4 bottom-2 w-6 h-6 rounded-full border border-white/30 flex items-center justify-center transition-colors z-10">
              {isSelected && <div className="w-5 h-5 rounded-full bg-[#598b4d] flex items-center justify-center">
                <Check size={12} className="text-white" />
              </div>}
            </div>
          )}

        {/* Аватар (чужие) — в группах на всех устройствах, в личных только на десктопе */}
        {!isMine && (isGroup || !isMobile) && (
          <div className="w-8 flex-shrink-0 mr-2 self-end">
            {isLastInGroup ? (
              <button onClick={() => onViewProfile?.(message.senderId)}>
                {senderAvatar ? (
                  <img src={senderAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                    {senderName[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </button>
            ) : null}
          </div>
        )}

        <div className={`${isMobile ? 'max-w-[85%]' : 'max-w-[65%]'} ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
          {/* Имя отправителя для круговых видео (не помещается внутри пузыря) */}
          {!isMine && showAvatar && isGroup && isVideoMessage && (
            <button
              className="text-xs font-medium ml-3 mb-0.5 hover:underline"
              style={{ color: usernameColor }}
              onClick={() => onViewProfile?.(message.senderId)}
            >
              {senderName}
            </button>
          )}

          {/* Пузырь */}
          <div
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClickReaction}
            title={`${t('doubleClickToReact')} 👍`}
            style={{
              borderRadius: bubbleRadius,
              '--bubble-my': bubbleColors.bubbleMy,
              '--bubble-my-to': bubbleColors.bubbleMyTo,
              '--bubble-other': bubbleColors.bubbleOther,
              '--bubble-other-to': bubbleColors.bubbleOtherTo,
            } as React.CSSProperties}
            className={`cursor-pointer transition-all duration-300 min-w-0 ${
              (isBigEmoji || isEmojiGrid)
                ? 'p-0 shadow-none border-none bg-transparent overflow-visible'
                : isVideoMessage ? 'overflow-visible' : 'overflow-hidden'
            } ${
              (isBigEmoji || isEmojiGrid)
                ? ''
                : `${isMine ? 'bubble-sent text-white shadow-sm' : 'bubble-received text-zinc-100 shadow-sm'} ${
                    (!message.content && (hasImage || hasVideo))
                      ? 'p-0.5'
                      : isMobile ? 'px-3 py-1.5' : 'px-3.5 py-1.5'
                  }`
            }${showNameOverlay ? ' relative' : ''}`}
          >
            {/* Reply */}
            {message.replyTo && (
              <div className="max-w-full flex" style={{ backgroundColor: 'color-mix(in oklab, #080808 10%, #ffffff3b)' }}>
                <div className="w-1 bg-white/80 rounded-full self-stretch flex-shrink-0" />
                <div className="flex-1 min-w-0 px-3 py-1.5">
                  <p className="text-xs font-medium text-white truncate">
                    {message.replyTo.sender?.displayName || message.replyTo.sender?.username}
                  </p>
                  <p className="text-xs text-zinc-400 truncate">{message.quote || message.replyTo.content || t('media')}</p>
                </div>
              </div>
            )}

            {/* Рендер пересланного сообщения */}
            {message.forwardedFrom && (
              <div className="mb-2 text-xs opacity-90 border-l-[3px] border-white/30 pl-2">
                <span className="font-medium">{t('forwardedFrom')}: </span>
                {message.forwardedFrom.displayName || message.forwardedFrom.username}
              </div>
            )}

            {/* Имя отправителя внутри первого пузыря в группе (как в Telegram) */}
            {showSenderName && (
              <button
                className={`text-xs font-semibold text-left hover:underline transition-colors ${
                  showNameOverlay
                    ? 'absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-md bg-black/40 backdrop-blur-sm text-white/90 max-w-[calc(100%-12px)] truncate'
                    : 'mb-0.5 block'
                }`}
                style={!showNameOverlay ? { color: usernameColor } : {}}
                onClick={(e) => {
                  e.stopPropagation();
                  onViewProfile?.(message.senderId);
                }}
              >
                {senderName}
              </button>
            )}

            {/* Изображения */}
            {hasImage && (
              <div className={`${message.content ? 'mb-2' : ''} overflow-hidden bg-black/40`} style={{ borderRadius: `${Math.max(0, mediaCornerRadius - 2)}px` }}>
                {mediaInfo.images.map((m) => (
                  <CachedImage
                    key={m.id}
                    url={mediaPreviewUrl(m)}
                    type="image"
                    width={m.width ?? undefined}
                    height={m.height ?? undefined}
                    alt=""
                    className="max-w-full max-h-100 object-cover cursor-pointer hover:brightness-90 transition-all"
                    containerClassName="w-full"
                    onClick={(e) => { e.stopPropagation(); setLightboxUrl(mediaOriginalUrl(m)); }}
                  />
                ))}
              </div>
            )}

            {/* ── Видео ── */}
            {hasVideo &&
              mediaInfo.videos
                .map((m) => (
                  <div
                    key={m.id}
                    className={
                      !isVideoMessage
                        ? `video-message ${message.content ? 'mb-2' : ''} relative overflow-hidden`
                        : `video-message-circle ${videoPlaying ? 'playing' : ''} ${showPauseHint ? 'flash-pause' : ''}`
                    }
                    style={!isVideoMessage ? { borderRadius: `${Math.max(0, mediaCornerRadius - 2)}px` } : undefined}
                    onClick={isVideoMessage ? handleVideoClick : (e) => e.stopPropagation()}
                  >
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current.set(m.id, el);
                        else videoRefs.current.delete(m.id);
                      }}
                      src={mediaUrl(m.url)}
                      preload={m.thumbnail ? 'none' : 'metadata'}
                      poster={mediaUrl(m.thumbnail) ?? undefined}
                      muted
                      playsInline
                      loop
                      disablePictureInPicture
                      controls={false}
                      style={!isVideoMessage && m.width && m.height ? { aspectRatio: `${m.width} / ${m.height}` } : undefined}
                      className={!isVideoMessage ? 'w-full max-h-80 object-cover' : ''}
                      onError={(e) => {
                        const v = e.currentTarget;
                        v.poster = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"><rect fill="%2318181b" width="300" height="200"/><text x="150" y="100" text-anchor="middle" fill="%2371717a" font-size="14">⚠ Видео недоступно</text></svg>';
                      }}
                    />
                    {/* ── Circles overlay ── */}
                    {isVideoMessage && (
                      <>
                        {!videoPlaying && (
                          <div className="video-play-overlay">
                            <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <circle cx="32" cy="32" r="30" fill="rgba(255,255,255,0.2)" stroke="white" strokeWidth="2" />
                              <polygon points="24,18 24,46 46,32" fill="white" />
                            </svg>
                          </div>
                        )}
                        <div className="video-pause-hint">
                          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="32" cy="32" r="30" fill="rgba(255,255,255,0.2)" stroke="white" strokeWidth="2" />
                            <rect x="21" y="19" width="8" height="26" rx="2" fill="white" />
                            <rect x="35" y="19" width="8" height="26" rx="2" fill="white" />
                          </svg>
                        </div>
                        {videoPlaying && (
                          <svg className="video-progress-ring" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="49" fill="none" stroke="rgba(255, 0, 0, 0.25)" strokeWidth="2" />
                            <circle cx="50" cy="50" r="49" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 49}`}
                              strokeDashoffset={`${2 * Math.PI * 49 * (1 - videoProgress / 100)}`}
                              transform="rotate(-90 50 50)" />
                          </svg>
                        )}
                      </>
                    )}
                    {/* ── Regular video overlays: timer + mute + message time ── */}
                    {!isVideoMessage && (
                      <>
                        <div className="video-timer-overlay">
                          {videoDuration > 0 ? formatDuration(Math.max(0, videoDuration - videoCurrentTime)) : formatDuration(videoCurrentTime)}
                          <VolumeX size={14} className="ml-1.5 opacity-70" />
                        </div>
                        <div className="video-time-overlay">
                          {timeStr}
                          {isMine && (
                            isRead ? <CheckCheck size={12} className="text-white/80 ml-1" />
                              : <Check size={12} className="text-white/70 ml-1" />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}

            {/* Голосовое */}
            {hasVoice && (
              <div className="min-w-[200px]">
                <audio
                  ref={audioRef}
                  src={voiceUrl ?? undefined}
                  preload="none"
                  onError={(e) => console.error('Audio load error:', e)}
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-vortex-500/20 hover:bg-vortex-500/30'
                      } transition-colors`}
                  >
                    {isPlaying ? (
                      <Pause size={16} className={isMine ? 'text-white' : 'text-vortex-400'} />
                    ) : (
                      <Play size={16} className={`${isMine ? 'text-white' : 'text-vortex-400'} ml-0.5`} />
                    )}
                  </button>
                  <div
                    className="flex-1 flex items-center gap-[2px] h-6 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      const audio = audioRef.current;
                      if (!audio || !audio.duration) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = (e.clientX - rect.left) / rect.width;
                      audio.currentTime = pct * audio.duration;
                      setAudioProgress(pct * 100);
                      if (!isPlaying) toggleAudio();
                    }}
                  >
                    {(waveformBars ?? FLAT_WAVEFORM).map((val, i) => {
                      const barHeight = Math.max(10, val * 100);
                      const progress = audioProgress / 100;
                      const barProgress = i / WAVEFORM_BARS;
                      const isActive = barProgress < progress;
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-full transition-colors duration-150 ${isActive
                            ? isMine ? 'bg-white/80' : 'bg-vortex-400'
                            : isMine ? 'bg-white/20' : 'bg-white/10'
                            }`}
                          style={{ height: `${barHeight}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-between items-end mt-0.5">
                  <span className={`pl-12 ${isMine ? 'text-white/60' : 'text-zinc-500'}`} style={{ fontSize: '12px' }}>
                    {isPlaying
                      ? formatDuration(audioRef.current?.currentTime || 0)
                      : formatDuration(audioDuration || mediaInfo.voice?.duration || 0)}
                  </span>
                  <span className={`message-meta flex-shrink-0 ${isMine ? 'text-white/60' : 'text-zinc-500'}`}>
                    {message.isEdited && <span>{t('edited')} </span>}
                    {message.scheduledAt && <Clock size={11} className="text-amber-400 mr-0.5" />}
                    {timeStr}
                    {isMine && !message.scheduledAt && (
                      <span className="inline-flex items-end ml-1" style={{ verticalAlign: 'text-bottom' }}>
                        {isRead ? (
                          <CheckCheck size={14} className="text-green-300" />
                        ) : (
                          <Check size={14} className="text-white/60" />
                        )}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Аудио (mp3 файлы) */}
            {hasAudio && (() => {
              const audioMedia = mediaInfo.audio;
              return (
                <div className="min-w-[220px]">
                  {audioMedia?.filename && (
                    <div className="flex items-center gap-2 mb-2">
                      <Volume2 size={14} className={isMine ? 'text-white/60' : 'text-vortex-400'} />
                      <span className={`text-xs truncate ${isMine ? 'text-white/70' : 'text-zinc-400'}`}>{audioMedia.filename}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 min-h-[48px]">
                    <audio
                      ref={audioRef}
                      src={mediaUrl(audioMedia?.url) ?? undefined}
                      // Было "auto": каждый аудиофайл в истории качался целиком
                      // при монтировании пузыря. Теперь загрузка стартует
                      // только по нажатию Play (toggleAudio вызывает load()).
                      preload="none"
                      onError={(e) => console.error('Audio load error:', e)}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-vortex-500/20 hover:bg-vortex-500/30'
                        } transition-colors`}
                    >
                      {isPlaying ? (
                        <Pause size={16} className={isMine ? 'text-white' : 'text-vortex-400'} />
                      ) : (
                        <Play size={16} className={`${isMine ? 'text-white' : 'text-vortex-400'} ml-0.5`} />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-[2px] h-6">
                        {AUDIO_DECOR_BARS.map((barHeight, i) => {
                          const progress = audioProgress / 100;
                          const barProgress = i / AUDIO_DECOR_BARS.length;
                          const isActive = barProgress < progress;
                          return (
                            <div
                              key={i}
                              className={`flex-1 rounded-full transition-colors duration-150 ${isActive
                                ? isMine ? 'bg-white/80' : 'bg-vortex-400'
                                : isMine ? 'bg-white/20' : 'bg-white/10'
                                }`}
                              style={{ height: `${barHeight}%` }}
                            />
                          );
                        })}
                      </div>
                      <span className={`text-xs mt-0.5 block ${isMine ? 'text-white/60' : 'text-zinc-500'}`}>
                        {isPlaying
                          ? formatDuration(audioRef.current?.currentTime || 0)
                          : formatDuration(audioDuration || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Файлы */}
            {hasFile &&
              mediaInfo.files
                .map((m) => (
                  <a
                    key={m.id}
                    href={mediaUrl(m.url)}
                    download={m.filename || 'file'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-3 p-2 rounded-xl ${isMine ? 'bg-white/10 hover:bg-white/15' : 'bg-surface-tertiary hover:bg-surface-hover'
                      } transition-colors mb-1`}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isMine ? 'bg-white/20' : 'bg-vortex-500/20'
                      }`}>
                      <FileText size={20} className={isMine ? 'text-white' : 'text-vortex-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{m.filename || t('fileLabel')}</p>
                      <p className={`text-xs ${isMine ? 'text-white/50' : 'text-zinc-500'}`}>
                        {m.size ? `${(m.size / 1024).toFixed(1)} ${t('kb')}` : t('download')}
                      </p>
                    </div>
                    <Download size={16} className={isMine ? 'text-white/50' : 'text-zinc-500'} />
                  </a>
                ))}

            {/* Текст */}
            {message.content && (
              isBigEmoji ? (
                /* 1 эмодзи — очень крупно, без фона */
                <div className="flex flex-col items-end pr-2">
                  <span className="leading-none select-none"
                    style={{ fontSize: '7rem' }}
                  >{message.content.trim()}</span>
                </div>
              ) : isEmojiGrid ? (
                /* 2+ эмодзи — помельче, в несколько рядов, без фона */
                <div className={`flex flex-col pr-2 ${isMine ? 'items-end' : 'items-start'}`}>
                  <div className="flex flex-wrap gap-x-0.5 select-none"
                    style={{ fontSize: '2.75rem', lineHeight: 1.3 }}
                  >{message.content.trim()}</div>
                  {message.isEdited && <span>{t('edited')} </span>}
                  {message.scheduledAt && <Clock size={11} className="text-amber-400 mr-0.5 inline" />}
                  {timeStr}
                  {isMine && !message.scheduledAt && (
                    isRead ? (
                      <CheckCheck size={13} />
                    ) : (
                      <Check size={13} />
                    )
                  )}
                </div>
              ) : (
                /* Обычный текст (с форматированием) */
                <p className="whitespace-pre-wrap break-words" style={{ fontSize: `${messageTextSize}px`, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                  {renderFormattedText(message.content)}
                </p>
              )
            )}

             

            {/* Реакции + время */}
            {(Object.keys(reactionGroups).length > 0 || message.content) ? (
              <div className="flex justify-end items-end gap-2">
                {Object.keys(reactionGroups).length > 0 && (
                  <div className="flex flex-wrap gap-1 mr-auto">
                    {Object.entries(reactionGroups).map(([emoji, data]) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(emoji)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm transition-colors ${data.isMine
                          ? ''
                          : 'bg-surface-tertiary border border-border hover:border-zinc-600'
                          }`}
                        style={data.isMine ? { backgroundColor: 'color-mix(in oklab, var(--color-white) 10%, transparent)' } : undefined}
                        title={data.users.join(', ')}
                      >
                        <span>{emoji}</span>
                        {!isGroup ? (
                          <div className="flex -space-x-1">
                            {data.userIds.map((uid) => {
                              const isCurrentUser = uid === user?.id;
                              const avatar = isCurrentUser ? user?.avatar : otherMemberAvatar;
                              const name = isCurrentUser
                                ? (user?.displayName || user?.username || '?')
                                : (data.users.find((_, i) => data.userIds[i] === uid) || '?');
                              const initial = name[0]?.toUpperCase() || '?';
                              return (
                                <div
                                  key={uid}
                                  className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-semibold overflow-hidden ring-1 ring-black/20"
                                  title={name}
                                >
                                  {avatar ? (
                                    <img src={mediaUrl(avatar)} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span>{initial}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-zinc-400">{data.count}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                <span className={`message-meta flex-shrink-0 ${isMine ? 'text-white/60' : 'text-zinc-500'}`}>
                  {message.isEdited && <span>{t('edited')} </span>}
                  {message.scheduledAt && <Clock size={11} className="text-amber-400 mr-0.5" />}
                  {timeStr}
                  {isMine && !message.scheduledAt && (
                    <span className="inline-flex items-end ml-1" style={{ verticalAlign: 'text-bottom' }}>
                      {isRead ? (
                        <CheckCheck size={14} className="text-green-300" />
                      ) : (
                        <Check size={14} className="text-white/60" />
                      )}
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <>
                {/* Время для медиа без текста (только изображения, видео — внутри оверлея) */}
                {!message.content && hasImage && (
                  <div className="flex justify-end px-3 py-1 -mt-7 relative z-10">
                    <span className="text-[11px] flex items-center gap-1 text-white/80 bg-black/40 px-2 py-0.5 rounded-full">
                      {timeStr}
                      {isMine && (
                        isRead ? (
                          <CheckCheck size={14} className="text-green-300" />
                        ) : (
                          <Check size={14} className="text-white/70" />
                        )
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Аватар (свои) — скрыт на мобильных */}
        {isMine && !isMobile && (
          <div className="w-8 flex-shrink-0 ml-2 self-end">
            {isLastInGroup ? (
              <button onClick={() => onViewProfile?.(message.senderId)}>
                {senderAvatar ? (
                  <img src={senderAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                    {senderName[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </button>
            ) : null}
          </div>
        )}
        </div>{/* end sliding message content */}
      </div>{/* end swipe-to-reply wrapper */}

      {/* Контекстное меню */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showContext && (
            <>
              {/* Backdrop — closes menu on outside click */}
              <div
                className="fixed inset-0 z-[9998]"
                onClick={() => {
                  setShowContext(false);
                  setDeleteMenuMode(false);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setShowContext(false);
                  setDeleteMenuMode(false);
                }}
              />
              <motion.div
                ref={contextMenuRef}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="fixed z-[9999] w-52 flex flex-col gap-1.5"
                style={{ left: contextPos.x, top: contextPos.y }}
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
              {/* Быстрые реакции — отдельный контейнер сверху */}
              {!deleteMenuMode && (
                <div className="rounded-[1.25rem] bg-[#2e3346] overflow-hidden -mr-10">
                  <div className="flex items-center gap-1 pl-2 pr-2 py-1 ml-auto">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleReaction(emoji)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-hover transition-colors text-[1.65rem]"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Основное меню */}
              <div className="rounded-[1.25rem] bg-[#2e3346] py-1.5 overflow-hidden">
              {deleteMenuMode ? (
                <>
                  {/* Delete submenu */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      onClick={() => setDeleteMenuMode(false)}
                      className="p-1 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <span className="text-sm font-medium text-zinc-300">{t('delete')}</span>
                  </div>
                  <button
                    onClick={handleDeleteForMe}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                  >
                    <Trash2 size={16} className="text-zinc-400" />
                    {t('deleteForMe')}
                  </button>
                  <button
                    onClick={handleDeleteForAll}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                  >
                    <Trash2 size={16} />
                    {otherMemberName
                      ? `${t('deleteAlsoFor')} ${otherMemberName}`
                      : t('deleteForAll')}
                  </button>
                </>
              ) : (
                <>
              <button
                onClick={handleReply}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
              >
                <Reply size={16} />
                {quotedText ? t('replyWithQuote') : t('reply')}
              </button>

              <button
                onClick={() => {
                  setShowContext(false);
                  onStartSelectionMode?.(message.id);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
              >
                <CheckCheck size={16} />
                {t('select')}
              </button>

              <button
                onClick={handlePin}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
              >
                <Pin size={16} />
                {isPinned ? t('unpinMessage') : t('pinMessage')}
              </button>

              {message.content && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                >
                  <Copy size={16} />
                  {t('copy')}
                </button>
              )}

              {isMine && message.content && (
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                >
                  <Pencil size={16} />
                  {t('edit')}
                </button>
              )}

              <button
                onClick={() => setDeleteMenuMode(true)}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
              >
                <Trash2 size={16} />
                {t('delete')}
              </button>
                </>
              )}
              </div>
            </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Lightbox — оригинал грузится только здесь, после явного клика */}
      <AnimatePresence>
        {lightboxUrl && (
          <Suspense fallback={null}>
            <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
          </Suspense>
        )}
      </AnimatePresence>
    </>
  );
}

const MemoActiveMessageBubble = memo(ActiveMessageBubble);

/**
 * Пузырь сообщения.
 *
 * Разделён на две мемоизированные ветки с независимыми наборами хуков:
 *   - `DeletedMessageBubble` — лёгкая плашка «сообщение удалено»;
 *   - `ActiveMessageBubble`  — вся тяжёлая логика (медиа, реакции, меню, свайп).
 *
 * Раньше это был один компонент с условным `return` в середине, из-за чего
 * при удалении сообщения порядок хуков менялся (нарушение Rules of Hooks).
 */
function MessageBubble(props: MessageBubbleProps) {
  if (props.message.isDeleted) {
    return <DeletedMessageBubble isMine={props.isMine} />;
  }
  return <MemoActiveMessageBubble {...props} />;
}

export default memo(MessageBubble);

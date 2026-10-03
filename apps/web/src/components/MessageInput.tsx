import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense, type MutableRefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Paperclip,
  Smile,
  Mic,
  X,
  Reply,
  Pencil,
  Image as ImageIcon,
  FileText,
  Music,
  Clock,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Check,
  Lock,
  Trash2,
  Pause,
  Play,
  Square,
  Video,
  Keyboard,
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useChatSettingsStore } from '../stores/chatSettingsStore';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { enqueueOfflineMessage, generateTempId } from '../lib/offlineQueue';
import { mediaUrl, pickAudioMimeType, pickVideoMimeType, createImageThumbnail } from '../lib/media';
import { normalizeWaveform, WAVEFORM_BARS } from '../lib/waveform';
import { useLang } from '../lib/i18n';
import { registerBackHandler } from '../lib/native';
import { lastGraphemeLength } from '../lib/utils';
import { VideoCircleRecorder } from './VideoCircleRecorder';
import { AUDIO_EXTENSIONS, MAX_FILE_SIZE } from '../lib/types';

// Lazy load EmojiPicker — heavy dependency (emoji-mart ~400KB)
const EmojiPicker = lazy(() => import('./EmojiPicker'));

interface Attachment {
  file: File;
  preview?: string;
  type: 'image' | 'video' | 'file' | 'audio';
}

interface MessageInputProps {
  chatId: string;
}

export default function MessageInput({ chatId }: MessageInputProps) {
  const user = useAuthStore(s => s.user);
  const t = useLang(s => s.t);
  const replyTo = useChatStore(s => s.replyTo);
  const editingMessage = useChatStore(s => s.editingMessage);
  const setReplyTo = useChatStore(s => s.setReplyTo);
  const setEditingMessage = useChatStore(s => s.setEditingMessage);
  const getDraft = useChatStore(s => s.getDraft);
  const setDraft = useChatStore(s => s.setDraft);
  // Точечный селектор: MessageInput использует из настроек только sendByEnter,
  // поэтому не должен перерисовываться на смену темы/обоев/размера текста.
  const sendByEnter = useChatSettingsStore(s => s.sendByEnter);
  const [text, setText] = useState(() => getDraft(chatId));
  // Дублирует «есть ли текст» по данным самой textarea.
  // Нужно из-за составного ввода (IME) в Android WebView: Gboard держит
  // набираемое слово в composing-region и React-событие change до пробела
  // не приходит — state `text` остаётся пустым, хотя буквы в поле есть.
  // Без этого флага кнопка «Отправить» не появлялась до нажатия пробела.
  const [hasRawText, setHasRawText] = useState(() => !!getDraft(chatId).trim());
  // Реактивный признак активного составного ввода (IME/Gboard).
  // В отличие от isComposingRef, это state — его изменение вызывает ререндер,
  // поэтому hasContent сразу пересчитывается при старте/окончании композиции.
  const [isComposing, setIsComposing] = useState(false);

  // Get current chat members for @mentions
  const chat = useChatStore(s => s.chats.find(c => c.id === chatId) || undefined);
  const isGroup = chat?.type === 'group';
  const chatMembers = (chat?.members || []).filter((m) => m.user.id !== user?.id);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLocked, setIsLocked] = useState(false);        // locked (hands-free) recording mode
  const [slideOffset, setSlideOffset] = useState(0);       // horizontal drag offset (slide-to-cancel)
  const [lockOffset, setLockOffset] = useState(0);         // vertical drag offset (lock gesture)
  const [isHolding, setIsHolding] = useState(false);       // pointer is held down on mic button
  const [isPaused, setIsPaused] = useState(false);         // recording paused
  const [voicePreview, setVoicePreview] = useState<string | null>(null); // blob URL for preview playback
  const [inputMode, setInputMode] = useState<'voice' | 'video'>('voice'); // mic for voice, camera for video-circle
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [formatMenu, setFormatMenu] = useState<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 });
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleStep, setScheduleStep] = useState<'presets' | 'custom'>('presets');
  const [scheduleHour, setScheduleHour] = useState('12');
  const [scheduleMinute, setScheduleMinute] = useState('00');
  const [scheduleCalDate, setScheduleCalDate] = useState(''); // YYYY-MM-DD
  const [scheduleCalMonth, setScheduleCalMonth] = useState(new Date().getMonth());
  const [scheduleCalYear, setScheduleCalYear] = useState(new Date().getFullYear());
  const [scheduleToast, setScheduleToast] = useState<string | null>(null);

  // Filtered members for @mention
  const filteredMembers = mentionQuery !== null && isGroup
    ? chatMembers.filter((m) => {
        const q = mentionQuery.toLowerCase();
        return m.user.displayName.toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  const insertMention = (member: { user: { username: string } }) => {
    const el = inputRef.current;
    if (!el) return;
    const cursorPos = el.selectionStart;
    const val = el.value;   // из DOM: state может отставать при составном вводе
    const before = val.substring(0, cursorPos);
    const after = val.substring(cursorPos);
    // Find the @ that started this mention
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) return;
    const newText = before.substring(0, atIdx) + `@${member.user.username} ` + after;
    applyText(newText);
    setMentionQuery(null);
    setMentionIndex(0);
    setTimeout(() => {
      el.focus();
      const newPos = atIdx + member.user.username.length + 2;
      el.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isComposingRef = useRef(false);   // активен составной ввод (IME/Gboard)
  const lastSyncedRef = useRef(text);     // последнее значение, с которым синхронизировали state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordingTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const micBtnRef = useRef<HTMLButtonElement>(null);
  const recordStartedByPointerRef = useRef(false);        // distinguish hold-to-record from locked click
  const autoLockTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const slideOffsetRef = useRef(0);   // mirror of slideOffset for document-level listener
  const lockOffsetRef = useRef(0);    // mirror of lockOffset for document-level listener
  const voicePreviewRef = useRef<HTMLAudioElement | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recordingMimeRef = useRef('audio/webm');           // saved mimeType for preview/send
  const recordingExtRef = useRef('webm');
  // Пики громкости, накопленные во время записи из уже работающего AnalyserNode.
  // Отправляются вместе с голосовым, чтобы получателям не пришлось качать и
  // декодировать аудиофайл целиком ради отрисовки waveform.
  const recordedPeaksRef = useRef<number[]>([]);
  // Было React-состояние: каждый setLiveBars вызывал перерендер всего MessageInput (2318 строк)
  // на каждом кадре requestAnimationFrame (~60 fps). Теперь — прямой DOM через ref.
  const liveBarsRef = useRef<number[]>(Array(32).fill(5));
  /** Ссылки на DOM-элементы 32 столбиков waveform — обновляются напрямую, без React. */
  const barDomRefs = useRef<(HTMLDivElement | null)[]>(Array(32).fill(null));
  /** Обновляет высоту DOM-столбиков waveform напрямую (без React). */
  const updateBarDOM = (bars: number[]) => {
    liveBarsRef.current = bars;
    for (let i = 0; i < barDomRefs.current.length; i++) {
      const el = barDomRefs.current[i];
      if (el) el.style.height = `${bars[i]}%`;
    }
  };
  const MAX_RECORD_DURATION = 300; // 5 minutes
  // Стабильные ссылки style-объектов — React не будет трогать DOM-стили столбиков
  // при ререндерах (recordingTime и т.д.), потому что ссылка не меняется.
  // Реальная высота обновляется через прямой DOM в updateBarDOM.
  const waveformBarInitStyle = useMemo(() => ({ height: '5%' } as React.CSSProperties), []);
  const waveformBarPausedStyle = useMemo(() => ({ height: '15%' } as React.CSSProperties), []);
  const SLIDE_CANCEL_THRESHOLD = 120; // px
  const LOCK_THRESHOLD = 70;          // px
  const AUTO_LOCK_DELAY = 2000;       // ms — auto-lock after holding 2s
  const LONG_PRESS_DELAY = 300;       // ms — distinguish tap (toggle mode) from hold (start recording)

  /** Программная установка значения поля: синхронно правит и DOM, и state */
  const setInputValue = useCallback((next: string) => {
    const el = inputRef.current;
    if (el) el.value = next;
    lastSyncedRef.current = next;
    setText(next);
    setHasRawText(!!next.trim());
  }, []);

  /** Программная установка текста с сохранением черновика */
  const applyText = useCallback((next: string) => {
    setInputValue(next);
    setDraft(chatId, next);
  }, [chatId, setDraft, setInputValue]);

  /**
   * Вставляет эмодзи в позицию курсора (как в Telegram), а не в конец строки.
   * Фокус в поле не ставим — иначе в WebView откроется системная клавиатура
   * и «перекроет» панель эмодзи.
   */
  const insertEmoji = useCallback((emoji: string) => {
    const el = inputRef.current;
    const value = el?.value ?? '';

    if (!el) {
      applyText(value + emoji);
      return;
    }

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const next = value.slice(0, start) + emoji + value.slice(end);
    applyText(next);

    const caret = start + emoji.length;
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node) node.setSelectionRange(caret, caret);
    });
  }, [applyText]);

  /**
   * Backspace из панели эмодзи: удаляет выделение, а если его нет —
   * один графемный кластер перед курсором (эмодзи целиком, а не по байтам).
   */
  const handleEmojiBackspace = useCallback(() => {
    const el = inputRef.current;
    const value = el?.value ?? '';
    if (!value) return;

    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;

    let nextStart: number;
    let nextEnd: number;
    if (start !== end) {
      nextStart = start;
      nextEnd = end;
    } else {
      if (start === 0) return;
      nextStart = start - lastGraphemeLength(value.slice(0, start));
      nextEnd = start;
    }

    applyText(value.slice(0, nextStart) + value.slice(nextEnd));
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node) node.setSelectionRange(nextStart, nextStart);
    });
  }, [applyText]);

  // Cleanup recording resources on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (autoLockTimerRef.current) clearTimeout(autoLockTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (videoStreamRef.current) videoStreamRef.current.getTracks().forEach(t => t.stop());
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (videoRecorderRef.current?.state === 'recording') {
        videoRecorderRef.current.stop();
      }
    };
  }, []);

  // Автоподгон высоты textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
  }, [text]);

  // При редактировании — заполнить текст
  useEffect(() => {
    if (editingMessage?.content) {
      setInputValue(editingMessage.content);
      inputRef.current?.focus();
    }
  }, [editingMessage, setInputValue]);

  // Load draft when switching chats
  useEffect(() => {
    if (!editingMessage) {
      setInputValue(getDraft(chatId));
    }
  }, [chatId]);

  // Cleanup preview URLs
  useEffect(() => {
    return () => {
      if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    };
  }, [attachment]);

  // Аппаратная кнопка «Назад» (Android) сначала закрывает панель эмодзи
  useEffect(() => {
    if (!showEmoji) return;
    return registerBackHandler(() => {
      setShowEmoji(false);
      return true;
    });
  }, [showEmoji]);

  // При смене чата панель эмодзи закрывается
  useEffect(() => {
    setShowEmoji(false);
  }, [chatId]);

  // Typing events
  const emitTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('typing_start', chatId);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_stop', chatId);
    }, 2000);
  }, [chatId]);

  // Определение @упоминания по текущему значению и позиции курсора
  const detectMention = useCallback((val: string, cursorPos: number) => {
    if (!isGroup) return;
    const before = val.substring(0, cursorPos);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }, [isGroup]);

  // Единая синхронизация React-state со значением textarea.
  // Вызывается и из React onChange, и из нативных слушателей — поэтому
  // побочные эффекты (черновик, typing) выполняются только при реальном
  // изменении значения, чтобы не дублировать socket-события.
  const syncFromInput = useCallback((el: HTMLTextAreaElement) => {
    const val = el.value;
    const changed = lastSyncedRef.current !== val;
    lastSyncedRef.current = val;
    // Не сбрасываем hasRawText в false, пока composition активен —
    // для кириллицы (Gboard) el.value может быть пустым, но пользователь
    // уже вводит текст.
    setHasRawText(!isComposingRef.current || !!val.trim());
    setText(prev => (prev === val ? prev : val));
    if (changed) {
      setDraft(chatId, val);
      emitTyping();
    }
    detectMention(val, el.selectionStart ?? val.length);
  }, [chatId, setDraft, emitTyping, detectMention]);

  // Нативные слушатели ввода.
  // React-обработчик onChange в Android WebView во время составного ввода
  // (русская раскладка Gboard с предсказанием) срабатывает только после
  // пробела/знака препинания. Слушаем DOM-события напрямую, чтобы state,
  // черновик, индикатор «печатает» и @упоминания обновлялись с первой буквы.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    // После (ре)монтирования textarea согласуем флаг и высоту с реальным value
    lastSyncedRef.current = el.value;
    setHasRawText(!!el.value.trim());
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';

    // Поллинг значения textarea на время составного ввода (IME).
    // В Android Capacitor WebView события input/compositionupdate могут
    // не срабатывать для кириллицы (Gboard), поэтому опрашиваем DOM
    // в каждом кадре, пока composition активен.
    let pollRaf = 0;
    const pollValue = () => {
      const node = inputRef.current;
      if (node && node.value !== lastSyncedRef.current) {
        syncFromInput(node);
      }
      // Дополнительная страховка для кириллицы: пока composition активен,
      // гарантированно держим кнопку отправки видимой, даже если value пуст.
      // Gboard (русская раскладка) не обновляет textarea.value до compositionend.
      if (isComposingRef.current) {
        setHasRawText(true);
        pollRaf = requestAnimationFrame(pollValue);
      }
    };

    const onInput = () => syncFromInput(el);
    const onBeforeInput = () => {
      // Дополнительная страховка: beforeinput + отложенная проверка
      requestAnimationFrame(() => {
        const node = inputRef.current;
        if (node && node.value !== lastSyncedRef.current) {
          syncFromInput(node);
        }
      });
    };
    const onCompositionStart = () => {
      setIsComposing(true);
      isComposingRef.current = true;
      // Сразу показываем кнопку отправки: пользователь начал составной ввод.
      // Gboard для кириллицы может не обновлять textarea.value до compositionend,
      // поэтому без этого флага кнопка не появится до пробела.
      setHasRawText(true);
      // Запускаем поллинг — будет крутиться до compositionend
      pollRaf = requestAnimationFrame(pollValue);
    };
    const onCompositionUpdate = (e: CompositionEvent) => {
      isComposingRef.current = true;
      setIsComposing(true);
      // Сначала фиксируем наличие composing-текста из события
      // (el.value для кириллицы может ещё не обновиться),
      // затем синхронизируем DOM → state.
      if (e.data?.trim()) {
        setHasRawText(true);
        setDraft(chatId, e.data);
      }
      syncFromInput(el);
    };
    const onCompositionEnd = (e: CompositionEvent) => {
      setIsComposing(false);
      isComposingRef.current = false;
      cancelAnimationFrame(pollRaf);
      // Финальная синхронизация — после закрытия IME значение точно в DOM
      syncFromInput(el);
    };

    el.addEventListener('input', onInput);
    el.addEventListener('beforeinput', onBeforeInput);
    el.addEventListener('compositionstart', onCompositionStart);
    el.addEventListener('compositionupdate', onCompositionUpdate);
    el.addEventListener('compositionend', onCompositionEnd);
    return () => {
      cancelAnimationFrame(pollRaf);
      el.removeEventListener('input', onInput);
      el.removeEventListener('beforeinput', onBeforeInput);
      el.removeEventListener('compositionstart', onCompositionStart);
      el.removeEventListener('compositionupdate', onCompositionUpdate);
      el.removeEventListener('compositionend', onCompositionEnd);
    };
  }, [syncFromInput, isRecording, isRecordingVideo, voicePreview, chatId, setDraft]);

  /**
   * Полностью очищает поле ввода — и DOM, и state (важно при IME).
   *
   * `sentText` — то, что реально ушло в сообщение. Android IME может
   * дописать остаток составного слова уже после очистки, поэтому на
   * следующем тике проверяем поле: если там оказался «хвост» отправленного
   * текста — убираем его. Новый ввод пользователя при этом не теряется.
   */
  const clearInput = useCallback((sentText?: string) => {
    const el = inputRef.current;
    if (el) {
      el.value = '';
      el.style.height = 'auto';
    }
    setIsComposing(false);
    isComposingRef.current = false;
    lastSyncedRef.current = '';
    setHasRawText(false);
    setText('');
    setDraft(chatId, '');

    if (!sentText) return;
    setTimeout(() => {
      const node = inputRef.current;
      if (!node) return;
      const leftover = node.value;
      if (leftover && sentText.includes(leftover)) {
        node.value = '';
        node.style.height = 'auto';
        lastSyncedRef.current = '';
        setHasRawText(false);
        setText('');
      }
    }, 0);
  }, [chatId, setDraft]);

  const handleSend = async (scheduledAt?: string) => {
    // Источник истины — DOM: при составном вводе (IME) state может отставать
    const raw = inputRef.current?.value ?? text;
    const trimmed = raw.trim();
    const hasAttachment = !!attachment;

    if (!trimmed && !hasAttachment) return;
    if (isSending) return;

    const socket = getSocket();
    const isOnline = socket?.connected && navigator.onLine;

    // ── Офлайн-режим: сохраняем в очередь ──
    if (!isOnline && !hasAttachment) {
      // Только текстовые сообщения (без файлов) можно сохранить в офлайн-очередь
      const tempId = generateTempId();
      const msg = {
        id: tempId,
        chatId,
        content: trimmed,
        type: 'text' as const,
        replyToId: replyTo?.id || null,
        quote: replyTo?.quote || null,
        scheduledAt: scheduledAt || null,
        mediaUrl: null,
        mediaType: null,
        fileName: null,
        fileSize: null,
        thumbnail: null,
        width: null,
        height: null,
        createdAt: new Date().toISOString(),
      };
      await enqueueOfflineMessage(msg);

      // Добавляем временное сообщение в UI
      const tempMessage: any = {
        id: tempId,
        chatId,
        senderId: user?.id || '',
        content: trimmed,
        type: 'text',
        replyToId: replyTo?.id || null,
        quote: replyTo?.quote || null,
        isEdited: false,
        isDeleted: false,
        createdAt: msg.createdAt,
        updatedAt: null,
        sender: user,
        isSending: true, // индикатор отправки в UI
      };
      const addMessage = useChatStore.getState().addMessage;
      addMessage(tempMessage);

      setReplyTo(null);
      clearInput(raw);
      return;
    }

    if (!socket) return;

    // Остановить typing
    socket.emit('typing_stop', chatId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (editingMessage) {
      socket.emit('edit_message', {
        messageId: editingMessage.id,
        content: trimmed,
        chatId,
      });
      setEditingMessage(null);
      clearInput(raw);
      return;
    }

    if (hasAttachment) {
      setIsSending(true);
      try {
        // Для изображений заранее готовим уменьшенное превью (~720px) и
        // запоминаем размеры оригинала. В пузыре сообщения показывается именно
        // превью, поэтому получатели больше не декодируют многомегапиксельные
        // оригиналы при скролле истории.
        const thumbnailInfo = attachment!.type === 'image'
          ? await createImageThumbnail(attachment!.file)
          : null;

        const result = await api.uploadFile(attachment!.file);

        // Превью грузим отдельным файлом, только если оно реально меньше
        // оригинала (createImageThumbnail возвращает исходный файл, если
        // картинка и так небольшая).
        let thumbnailUrl: string | undefined;
        if (thumbnailInfo && thumbnailInfo.file !== attachment!.file) {
          try {
            const thumbResult = await api.uploadFile(thumbnailInfo.file);
            thumbnailUrl = thumbResult.url;
          } catch (e) {
            // Не критично: без превью пузырь покажет оригинал, как раньше.
            console.warn('Не удалось загрузить превью изображения:', e);
          }
        }

        if (!socket) {
          console.error("❌ MessageInput attachment: сокет не подключён — файл загружен, но не отправлен");
          alert("Ошибка отправки: нет соединения с сервером. Попробуйте перезагрузить страницу.");
          setIsSending(false);
          return;
        }
        socket.emit('send_message', {
          chatId,
          content: trimmed || null,
          type: attachment!.type,
          mediaUrl: result.url,
          mediaType: attachment!.type,
          fileName: result.filename,
          fileSize: result.size,
          ...(thumbnailUrl ? { thumbnail: thumbnailUrl } : {}),
          ...(thumbnailInfo ? { width: thumbnailInfo.width, height: thumbnailInfo.height } : {}),
          replyToId: replyTo?.id || null,
          quote: replyTo?.quote || null,
          ...(scheduledAt ? { scheduledAt } : {}),
        });
        setReplyTo(null);
        clearAttachment();
      } catch (e) {
        console.error('Ошибка загрузки файла:', e);
      } finally {
        setIsSending(false);
      }
    } else {
      socket.emit('send_message', {
        chatId,
        content: trimmed,
        type: 'text',
        replyToId: replyTo?.id || null,
        quote: replyTo?.quote || null,
        ...(scheduledAt ? { scheduledAt } : {}),
      });
      setReplyTo(null);
    }

    clearInput(raw);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const native = e.nativeEvent as KeyboardEvent;

    // ── Универсальный детект ввода (работает для ЛЮБОЙ раскладки) ──
    // IME/Gboard: keyCode=229 / key='Unidentified' — системная клавиатура
    // обрабатывает нажатие. Сразу показываем кнопку отправки и выходим,
    // не трогая composing-регион.
    if (native.isComposing || native.keyCode === 229 || e.key === 'Unidentified') {
      setHasRawText(true);
      setIsComposing(true);
      return;
    }

    // Обычная печатная клавиша (латиница, цифры, знаки) — не управляющая.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      setHasRawText(true);
    }

    // Enter в Android WebView иногда приходит без key, только с keyCode
    const isEnter = e.key === 'Enter' || native.keyCode === 13;

    // Handle @mention navigation
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (isEnter || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (isEnter && !e.shiftKey) {
      e.preventDefault();
      if (sendByEnter) {
        handleSend();
      } else {
        // Insert newline when sendByEnter is disabled
        const el = inputRef.current;
        if (el) {
          const start = el.selectionStart;
          const end = el.selectionEnd;
          const val = el.value;   // из DOM: state может отставать при IME
          const newText = val.substring(0, start) + '\n' + val.substring(end);
          applyText(newText);
          setTimeout(() => {
            el.focus();
            el.setSelectionRange(start + 1, start + 1);
          }, 0);
        }
      }
    }
  };

  const clearAttachment = () => {
    if (attachment?.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment(null);
  };

  /**
   * Сворачивает накопленные во время записи пики в компактный waveform.
   * Возвращает undefined, если данных нет (например, AnalyserNode не завёлся).
   */
  const takeRecordedWaveform = (): number[] | undefined => {
    const peaks = recordedPeaksRef.current;
    recordedPeaksRef.current = [];
    if (peaks.length === 0) return undefined;
    return normalizeWaveform(peaks, WAVEFORM_BARS);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        alert(t('fileTooLarge'));
        e.target.value = '';
        return;
      }
      const isAudio = file.type.startsWith('audio/') || AUDIO_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
      setAttachment({ file, type: isAudio ? 'audio' : 'file' });
      inputRef.current?.focus();
    }
    e.target.value = '';
    setShowAttachMenu(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isVideo = file.type.startsWith('video/');
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      setAttachment({ file, preview, type: isVideo ? 'video' : 'image' });
      inputRef.current?.focus();
    }
    e.target.value = '';
    setShowAttachMenu(false);
  };

  // Запись голосового
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // ogg/opus → webm/opus → mp4/aac (для iOS и части WebView)
      const { mimeType, ext } = pickAudioMimeType();
      recordingMimeRef.current = mimeType;
      recordingExtRef.current = ext;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recordedPeaksRef.current = [];

      // Set up AnalyserNode for live waveform
      const actx = new AudioContext();
      const source = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      audioContextRef.current = actx;
      analyserRef.current = analyser;

      const timeDomainData = new Uint8Array(analyser.frequencyBinCount);
      const updateBars = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(timeDomainData);
        // Downsample to 32 bars
        const bars: number[] = [];
        const step = Math.floor(timeDomainData.length / 32);
        let framePeak = 0;
        for (let i = 0; i < 32; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            const val = Math.abs(timeDomainData[i * step + j] - 128);
            sum += val;
            if (val > framePeak) framePeak = val;
          }
          const avg = sum / step;
          // Map 0-128 to 8-100 with some exaggeration for visibility
          bars.push(Math.max(8, Math.min(100, avg * 1.8 + 8)));
        }
        // Прямое обновление DOM — без React, без перерендера всего MessageInput
        updateBarDOM(bars);
        // Запоминаем пик кадра (0..1) — из этих значений соберётся
        // итоговый waveform сообщения. Данные уже есть в памяти,
        // дополнительных вычислений и загрузок не требуется.
        recordedPeaksRef.current.push(Math.min(1, framePeak / 128));
        animFrameRef.current = requestAnimationFrame(updateBars);
      };
      animFrameRef.current = requestAnimationFrame(updateBars);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `voice.${ext}`, { type: mimeType });
        const waveform = takeRecordedWaveform();

        try {
          const result = await api.uploadFile(file);
          const socket = getSocket();
          if (!socket) {
            console.error("❌ MessageInput voice: сокет не подключён — аудио загружено, но не отправлено");
            alert("Ошибка отправки: нет соединения с сервером. Попробуйте перезагрузить страницу.");
            return;
          }
          socket.emit('send_message', {
            chatId,
            content: null,
            type: 'voice',
            mediaUrl: result.url,
            mediaType: 'voice',
            fileName: result.filename,
            fileSize: result.size,
            duration: recordingTimeRef.current,
            // Готовый waveform — получателю не нужен decodeAudioData.
            ...(waveform ? { waveform } : {}),
            replyToId: replyTo?.id || null,
          });
          setReplyTo(null);
        } catch (e) {
          console.error('Ошибка отправки голосового:', e);
          alert('Не удалось отправить голосовое сообщение: ' + (e instanceof Error ? e.message : 'неизвестная ошибка'));
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (e) {
      console.error('Ошибка записи:', e);
    }
  };

  // Запись видео-кружка (видео-сообщение)
  const startVideoRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: 1 },
        audio: true,
      });
      videoStreamRef.current = stream;

      // Set up AnalyserNode for live waveform (audio-only visualisation)
      try {
        const actx = new AudioContext();
        const source = actx.createMediaStreamSource(stream);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        audioContextRef.current = actx;
        analyserRef.current = analyser;

        const timeDomainData = new Uint8Array(analyser.frequencyBinCount);
        const updateBars = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(timeDomainData);
          const bars: number[] = [];
          const step = Math.floor(timeDomainData.length / 32);
          for (let i = 0; i < 32; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
              sum += Math.abs(timeDomainData[i * step + j] - 128);
            }
            bars.push(Math.max(8, Math.min(100, (sum / step) * 1.8 + 8)));
          }
          // Прямое обновление DOM — без React
          updateBarDOM(bars);
          animFrameRef.current = requestAnimationFrame(updateBars);
        };
        animFrameRef.current = requestAnimationFrame(updateBars);
      } catch { /* audio analyser is optional for video */ }

      // webm/vp8 → webm/vp9 → mp4/h264 (для iOS и части WebView)
      const { mimeType, ext: videoExt } = pickVideoMimeType();
      recordingMimeRef.current = mimeType;
      recordingExtRef.current = videoExt;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      videoRecorderRef.current = recorder;
      videoChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        videoStreamRef.current = null;
        const blob = new Blob(videoChunksRef.current, { type: mimeType });
        const file = new File([blob], `video_message.${videoExt}`, { type: mimeType });

        try {
          const result = await api.uploadFile(file);
          const socket = getSocket();
          if (!socket) {
            console.error("❌ MessageInput video: сокет не подключён — видео загружено, но не отправлено");
            alert("Ошибка отправки: нет соединения с сервером. Попробуйте перезагрузить страницу.");
            return;
          }
          socket.emit('send_message', {
            chatId,
            content: null,
            type: 'video_message',
            mediaUrl: result.url,
            mediaType: 'video',
            fileName: result.filename,
            fileSize: result.size,
            duration: recordingTimeRef.current,
            replyToId: replyTo?.id || null,
          });
          setReplyTo(null);
        } catch (e) {
          console.error('Ошибка отправки видеосообщения:', e);
          alert('Не удалось отправить видеосообщение: ' + (e instanceof Error ? e.message : 'неизвестная ошибка'));
        }
      };

      recorder.start(250); // timeslice 250ms for low-latency chunks
      setIsRecordingVideo(true);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (e) {
      console.error('Ошибка записи видео:', e);
    }
  };

  const cleanupAnalyser = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    // Сбрасываем waveform через прямой DOM (без React)
    updateBarDOM(Array(32).fill(5));
  };

  const resetRecordingState = () => {
    setIsRecording(false);
    setRecordingTime(0);
    setIsLocked(false);
    setIsHolding(false);
    setIsPaused(false);
    setSlideOffset(0);
    setLockOffset(0);
    slideOffsetRef.current = 0;
    lockOffsetRef.current = 0;
    pointerStartRef.current = null;
    recordStartedByPointerRef.current = false;
    // Cleanup preview
    if (voicePreview) URL.revokeObjectURL(voicePreview);
    setVoicePreview(null);
    setIsPreviewPlaying(false);
    if (voicePreviewRef.current) {
      voicePreviewRef.current.pause();
      voicePreviewRef.current = null;
    }
    if (autoLockTimerRef.current) {
      clearTimeout(autoLockTimerRef.current);
      autoLockTimerRef.current = undefined;
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupAnalyser();
    resetRecordingState();
    // recordingTimeRef is consumed in onstop, don't reset here
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupAnalyser();
    resetRecordingState();
    recordingTimeRef.current = 0;
  };

  // Stop video recording — send it
  const stopVideoRecording = () => {
    if (videoRecorderRef.current?.state === 'recording') {
      videoRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupAnalyser();
    setIsRecordingVideo(false);
    resetRecordingState();
  };

  // Cancel video recording
  const cancelVideoRecording = () => {
    if (videoRecorderRef.current?.state === 'recording') {
      videoRecorderRef.current.ondataavailable = null;
      videoRecorderRef.current.onstop = null;
      videoRecorderRef.current.stop();
      videoRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      videoStreamRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupAnalyser();
    setIsRecordingVideo(false);
    resetRecordingState();
    recordingTimeRef.current = 0;
  };

  // Pause / resume recording (locked mode)
  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupAnalyser();
      setIsPaused(true);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      // Restart timer
      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime((t) => t + 1);
      }, 1000);
      // Restart analyser
      if (audioContextRef.current && streamRef.current) {
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
        source.connect(analyser);
        analyserRef.current = analyser;
        const timeDomainData = new Uint8Array(analyser.frequencyBinCount);
        const updateBars = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(timeDomainData);
          const bars: number[] = [];
          const step = Math.floor(timeDomainData.length / 32);
          for (let i = 0; i < 32; i++) {
            let sum = 0;
            for (let j = 0; j < step; j++) {
              const val = Math.abs(timeDomainData[i * step + j] - 128);
              sum += val;
            }
            bars.push(Math.max(8, Math.min(100, (sum / step) * 1.8 + 8)));
          }
          // Прямое обновление DOM — без React
          updateBarDOM(bars);
          animFrameRef.current = requestAnimationFrame(updateBars);
        };
        animFrameRef.current = requestAnimationFrame(updateBars);
      }
    }
  };

  // Stop recording to preview (don't send yet) — locked mode only
  const stopToPreview = () => {
    if (!mediaRecorderRef.current) return;
    // Replace the onstop handler to create a preview instead of sending
    const mimeType = recordingMimeRef.current;
    mediaRecorderRef.current.onstop = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setVoicePreview(url);
    };
    if (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupAnalyser();
    setIsRecording(false);
    setIsPaused(false);
  };

  // Send the previewed recording
  const sendPreview = async () => {
    if (!voicePreview || chunksRef.current.length === 0) return;
    const mimeType = recordingMimeRef.current;
    const ext = recordingExtRef.current;
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const file = new File([blob], `voice.${ext}`, { type: mimeType });
    const waveform = takeRecordedWaveform();
    try {
      const result = await api.uploadFile(file);
      const socket = getSocket();
      if (!socket) {
        console.error("❌ MessageInput sendPreview: сокет не подключён — аудио загружено, но не отправлено");
        alert("Ошибка отправки: нет соединения с сервером. Попробуйте перезагрузить страницу.");
        return;
      }
      socket.emit('send_message', {
        chatId,
        content: null,
        type: 'voice',
        mediaUrl: result.url,
        mediaType: 'voice',
        fileName: result.filename,
        fileSize: result.size,
        duration: recordingTimeRef.current,
        // Готовый waveform — получателю не нужен decodeAudioData.
        ...(waveform ? { waveform } : {}),
        replyToId: replyTo?.id || null,
      });
      setReplyTo(null);
    } catch (e) {
      console.error('Ошибка отправки голосового:', e);
      alert('Не удалось отправить голосовое сообщение: ' + (e instanceof Error ? e.message : 'неизвестная ошибка'));
    }
    resetRecordingState();
    recordingTimeRef.current = 0;
  };

  // Toggle preview playback
  const togglePreviewPlay = () => {
    if (!voicePreview) return;
    if (isPreviewPlaying && voicePreviewRef.current) {
      voicePreviewRef.current.pause();
      setIsPreviewPlaying(false);
    } else {
      if (!voicePreviewRef.current) {
        const audio = new Audio(voicePreview);
        audio.onended = () => setIsPreviewPlaying(false);
        voicePreviewRef.current = audio;
      }
      voicePreviewRef.current.play();
      setIsPreviewPlaying(true);
    }
  };

  // Auto-stop recording after MAX_RECORD_DURATION
  useEffect(() => {
    if (isRecording && recordingTime >= MAX_RECORD_DURATION) {
      if (isRecordingVideo) stopVideoRecording();
      else stopRecording();
    }
  }, [recordingTime, isRecording, isRecordingVideo]);

  // ── Pointer handlers for Telegram-style mic button ──
  // pointerDown starts on the mic button; move/up are tracked on document
  // so they survive React re-renders that replace the button DOM node.
  // Short tap (< LONG_PRESS_DELAY without significant movement) → toggle voice/video mode
  // Long press (≥ LONG_PRESS_DELAY) → start recording in current mode

  const handleMicPointerDown = useCallback(async (e: React.PointerEvent) => {
    e.preventDefault();
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    slideOffsetRef.current = 0;
    lockOffsetRef.current = 0;
    setIsHolding(true);
    setSlideOffset(0);
    setLockOffset(0);

    // After LONG_PRESS_DELAY, start recording in current mode
    longPressTimerRef.current = setTimeout(async () => {
      if (!pointerStartRef.current) return; // already released (tap)

      // Auto-lock: if held for 2s without swipe → lock mode automatically
      autoLockTimerRef.current = setTimeout(() => {
        if (!recordStartedByPointerRef.current) return;
        setIsLocked(true);
        setIsHolding(false);
        setSlideOffset(0);
        setLockOffset(0);
        pointerStartRef.current = null;
        recordStartedByPointerRef.current = false;
        try { navigator.vibrate?.(20); } catch {}
      }, AUTO_LOCK_DELAY - LONG_PRESS_DELAY);

      recordStartedByPointerRef.current = true;
      try {
        if (inputMode === 'video') {
          setShowVideoRecorder(true);
        } else {
          await startRecording();
        }
      } catch {
        if (autoLockTimerRef.current) clearTimeout(autoLockTimerRef.current);
        resetRecordingState();
        setIsRecordingVideo(false);
      }
    }, LONG_PRESS_DELAY);
  }, [chatId, replyTo, inputMode]);

  // Global pointermove/pointerup for TAP detection (before recording starts)
  useEffect(() => {
    if (!isHolding || isRecording) return;

    const onMove = (e: PointerEvent) => {
      if (!pointerStartRef.current) return;
      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = undefined;
        }
      }
    };

    const onUp = () => {
      if (longPressTimerRef.current) {
        // Released before LONG_PRESS_DELAY → TAP: toggle mode
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = undefined;
        setInputMode((prev) => (prev === 'voice' ? 'video' : 'voice'));
        try { navigator.vibrate?.(10); } catch {}
      }
      setIsHolding(false);
      pointerStartRef.current = null;
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [isHolding, isRecording]);

  // Document-level pointermove/pointerup — survives DOM re-renders (recording mode)
  useEffect(() => {
    if ((!isRecording && !showVideoRecorder) || isLocked || !recordStartedByPointerRef.current) return;

    const onMove = (e: PointerEvent) => {
      if (!pointerStartRef.current) return;

      const dx = e.clientX - pointerStartRef.current.x;
      const dy = e.clientY - pointerStartRef.current.y;

      if (dx < 0) {
        slideOffsetRef.current = dx;
        lockOffsetRef.current = 0;
        setSlideOffset(dx);
        setLockOffset(0);
      }
      if (dy < 0 && dx >= -20) {
        lockOffsetRef.current = dy;
        slideOffsetRef.current = 0;
        setLockOffset(dy);
        setSlideOffset(0);
      }

      // If swiping, cancel the auto-lock timer
      if (Math.abs(dx) > 15 || Math.abs(dy) > 15) {
        if (autoLockTimerRef.current) {
          clearTimeout(autoLockTimerRef.current);
          autoLockTimerRef.current = undefined;
        }
      }
    };

    const onUp = () => {
      if (autoLockTimerRef.current) {
        clearTimeout(autoLockTimerRef.current);
        autoLockTimerRef.current = undefined;
      }

      if (!recordStartedByPointerRef.current) {
        setIsHolding(false);
        return;
      }

      const dx = slideOffsetRef.current;
      const dy = lockOffsetRef.current;

      // Slide to cancel
      if (dx < -SLIDE_CANCEL_THRESHOLD) {
        if (showVideoRecorder) {
          // Close overlay — unmount cleans up recorder without sending
          setShowVideoRecorder(false);
          setIsHolding(false);
          pointerStartRef.current = null;
          recordStartedByPointerRef.current = false;
          setSlideOffset(0);
          setLockOffset(0);
          try { navigator.vibrate?.(30); } catch {}
          return;
        }
        if (isRecordingVideo) cancelVideoRecording();
        else cancelRecording();
        try { navigator.vibrate?.(30); } catch {}
        return;
      }

      // Lock mode — swipe up past threshold
      if (dy < -LOCK_THRESHOLD) {
        setIsLocked(true);
        setIsHolding(false);
        setSlideOffset(0);
        setLockOffset(0);
        pointerStartRef.current = null;
        recordStartedByPointerRef.current = false;
        try { navigator.vibrate?.(20); } catch {}
        return;
      }

      // Normal release — send (min 1s to avoid accidental taps)
      setIsHolding(false);
      pointerStartRef.current = null;
      recordStartedByPointerRef.current = false;

      // Video overlay: keep it open, user continues inside the overlay
      if (showVideoRecorder) {
        setSlideOffset(0);
        setLockOffset(0);
        return;
      }

      if (recordingTimeRef.current < 1) {
        if (isRecordingVideo) cancelVideoRecording();
        else cancelRecording();
        return;
      }
      if (isRecordingVideo) stopVideoRecording();
      else stopRecording();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [isRecording, isLocked, isRecordingVideo, showVideoRecorder]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleInputContextMenu = (e: React.MouseEvent) => {
    const el = inputRef.current;
    if (el && el.selectionStart !== el.selectionEnd) {
      e.preventDefault();
      setFormatMenu({ show: true, x: e.clientX, y: e.clientY });
    }
  };

  const applyFormat = (prefix: string, suffix: string) => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;
    const selected = val.substring(start, end);
    const newVal = val.substring(0, start) + prefix + selected + suffix + val.substring(end);
    applyText(newVal);
    setFormatMenu({ show: false, x: 0, y: 0 });

    // refocus and update cursor
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.opus'];
      const isAudio = file.type.startsWith('audio/') || audioExts.some(ext => file.name.toLowerCase().endsWith(ext));

      const type = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file';
      const preview = isImage ? URL.createObjectURL(file) : undefined;

      setAttachment({ file, type, preview });
      inputRef.current?.focus();
    }
  };

  // hasRawText читается из самой textarea — при составном вводе (IME)
  // React-state отстаёт, и без него кнопка отправки появлялась только
  // после пробела.
  // isComposing (state) — гарантирует, что кнопка видна всё время,
  // пока Gboard для кириллицы держит composing-регион открытым.
  const hasContent = text.trim() || hasRawText || isComposing || attachment;

  return (
    <div
      className="z-10 px-3 md:px-6 pt-2 pb-[max(1rem,env(safe-area-inset-bottom,0px))] md:pb-6 flex-shrink-0 relative bg-transparent"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 rounded-[2rem] mx-6 mb-6 mt-2 bg-vortex-500/10 border-2 border-dashed border-vortex-400 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-2 text-vortex-300">
              <FileText size={32} className="animate-bounce" />
              <p className="font-semibold">{t('dropFileHere')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attachment preview */}
      <AnimatePresence>
        {attachment && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: 10, scale: 0.95 }}
            animate={{ height: 'auto', opacity: 1, y: 0, scale: 1 }}
            exit={{ height: 0, opacity: 0, y: 10, scale: 0.95 }}
            className="mb-2 max-w-3xl mx-auto overflow-hidden px-1.5"
          >
            <div className="flex items-center gap-3 px-3 py-2.5 bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-2xl shadow-xl relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/5 bg-gradient-to-b from-sky-400 to-blue-500 rounded-r-md" />
              {attachment.preview ? (
                <img
                  src={attachment.preview}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover flex-shrink-0 ring-1 ring-white/10 ml-2"
                />
              ) : attachment.type === 'video' ? (
                <div className="w-12 h-12 rounded-xl bg-vortex-500/20 flex items-center justify-center flex-shrink-0 ring-1 ring-white/10 ml-2">
                  <ImageIcon size={20} className="text-vortex-400" />
                </div>
              ) : attachment.type === 'audio' ? (
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0 ring-1 ring-white/10 ml-2">
                  <Music size={20} className="text-emerald-400" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center flex-shrink-0 ring-1 ring-white/10 ml-2">
                  <FileText size={20} className="text-sky-400" />
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-sm font-medium text-white truncate tracking-wide">{attachment.file.name}</p>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  {(attachment.file.size / 1024).toFixed(1)} {t('kb')}
                  {isSending && <span className="ml-2 text-vortex-400 animate-pulse">{t('sending')}</span>}
                </p>
              </div>
              <button
                onClick={clearAttachment}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Recording UI — «кружок» */}
      {isRecordingVideo && !voicePreview ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-white/[0.04] backdrop-blur-[40px] rounded-[2rem] w-full max-w-3xl mx-auto px-2 py-2"
        >
          {/* Camera preview (circular) */}
          <div className="relative w-12 h-12 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0 ring-2 ring-amber-500/60 recording-pulse-ring">
            <VideoPreview stream={videoStreamRef.current} />
          </div>

          {/* Timer + Waveform */}
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-sm text-zinc-300 font-mono flex-shrink-0">{formatTime(recordingTime)}</span>
            <div className="flex-1 flex items-center gap-0.5 h-8">
              {Array.from({ length: 32 }, (_, i) => (
                <div key={i} ref={el => { barDomRefs.current[i] = el; }} className="flex-1 rounded-full bg-amber-400/60" style={waveformBarInitStyle} />
              ))}
            </div>
          </div>

          {/* Cancel */}
          <button onClick={cancelVideoRecording} className="w-12 h-12 flex items-center justify-center rounded-full text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0">
            <Trash2 size={18} />
          </button>

          {/* Send */}
          <div className="relative flex-shrink-0">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(245,158,11,0.15)" strokeWidth="2" />
              <circle cx="24" cy="24" r="21" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 21}
                strokeDashoffset={(1 - recordingTime / MAX_RECORD_DURATION) * 2 * Math.PI * 21}
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <button onClick={stopVideoRecording} className="w-12 h-12 flex items-center justify-center rounded-full bg-amber-500 hover:bg-amber-600 transition-colors text-white shadow-md">
              <svg fill="#f0f0f0" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" stroke="#f0f0f0" className="w-[22px] h-[22px] translate-x-[1px]">
                <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
                <g id="SVGRepo_iconCarrier">
                  <path d="M29.919 6.163l-4.225 19.925c-0.319 1.406-1.15 1.756-2.331 1.094l-6.438-4.744-3.106 2.988c-0.344 0.344-0.631 0.631-1.294 0.631l0.463-6.556 11.931-10.781c0.519-0.462-0.113-0.719-0.806-0.256l-14.75 9.288-6.35-1.988c-1.381-0.431-1.406-1.381 0.288-2.044l24.837-9.569c1.15-0.431 2.156 0.256 1.781 2.013z" fill="#f0f0f0"></path>
                </g>
              </svg>
            </button>
          </div>
        </motion.div>
      ) : isRecording || voicePreview ? (
      <>
      {/* Voice Recording UI — Telegram-style */}
      {voicePreview ? (
          /* ── Preview mode: listen before sending ── */
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-white/[0.04] backdrop-blur-[40px] rounded-[2rem] w-full max-w-3xl mx-auto px-2 py-2"
          >
            <button onClick={cancelRecording} className="w-10 h-10 flex items-center justify-center rounded-full text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0">
              <Trash2 size={22} />
            </button>
            <button onClick={togglePreviewPlay} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors text-white flex-shrink-0">
              {isPreviewPlaying ? <Pause size={22} /> : <Play size={22} className="translate-x-[1px]" />}
            </button>
            <div className="flex-1 flex items-center gap-3 min-w-0">
              <span className="text-sm text-zinc-300 font-mono flex-shrink-0">{formatTime(recordingTimeRef.current)}</span>
              <div className="flex-1 h-0.5 rounded-full bg-white/10">
                <div className="h-full rounded-full bg-vortex-400/80" style={{ width: '100%' }} />
              </div>
            </div>
            <button onClick={sendPreview} className="w-10 h-10 flex items-center justify-center rounded-full bg-accent hover:bg-accent-hover transition-colors text-white flex-shrink-0 shadow-md">
              <svg fill="#f0f0f0" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" stroke="#f0f0f0" className="w-[22px] h-[22px] translate-x-[1px]">
                <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
                <g id="SVGRepo_iconCarrier">
                  <path d="M29.919 6.163l-4.225 19.925c-0.319 1.406-1.15 1.756-2.331 1.094l-6.438-4.744-3.106 2.988c-0.344 0.344-0.631 0.631-1.294 0.631l0.463-6.556 11.931-10.781c0.519-0.462-0.113-0.719-0.806-0.256l-14.75 9.288-6.35-1.988c-1.381-0.431-1.406-1.381 0.288-2.044l24.837-9.569c1.15-0.431 2.156 0.256 1.781 2.013z" fill="#f0f0f0"></path>
                </g>
              </svg>
            </button>
          </motion.div>
        ) : isLocked ? (
          /* ── Locked mode: hands-free recording ── */
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 bg-white/[0.04] backdrop-blur-[40px] rounded-[2rem] w-full max-w-3xl mx-auto px-2 py-1.5"
          >
            {/* Delete */}
            <button onClick={cancelRecording} className="w-10 h-10 flex items-center justify-center rounded-full text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0">
              <Trash2 size={18} />
            </button>

            {/* Timer + Waveform */}
            <div className="flex-1 flex items-center gap-3 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isPaused ? 'bg-zinc-500' : 'bg-red-500 animate-pulse'}`} />
              <span className="text-sm text-zinc-300 font-mono flex-shrink-0">{formatTime(recordingTime)}</span>
              <div className="flex-1 flex items-center gap-0.5 h-8">
                {Array.from({ length: 32 }, (_, i) => (
                  <div key={i} ref={el => { barDomRefs.current[i] = el; }} className={`flex-1 rounded-full ${isPaused ? 'bg-zinc-600' : 'bg-vortex-400/60'}`} style={isPaused ? waveformBarPausedStyle : waveformBarInitStyle} />
                ))}
              </div>
            </div>

            {/* Pause / Resume */}
            <button
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors text-white flex-shrink-0"
            >
              {isPaused ? <Mic size={16} /> : <Pause size={16} />}
            </button>

            {/* Stop (to preview) */}
            <button onClick={stopToPreview} className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors text-red-400 flex-shrink-0">
              <Square size={14} />
            </button>

            {/* Send directly */}
            <div className="relative flex-shrink-0">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="2" />
                <circle cx="24" cy="24" r="21" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 21}
                  strokeDashoffset={(1 - recordingTime / MAX_RECORD_DURATION) * 2 * Math.PI * 21}
                  className="transition-[stroke-dashoffset] duration-1000 ease-linear"
                />
              </svg>
              <button onClick={stopRecording} className="w-12 h-12 flex items-center justify-center rounded-full bg-accent hover:bg-accent-hover transition-colors text-white shadow-md">
                <svg fill="#f0f0f0" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" stroke="#f0f0f0" className="w-[22px] h-[22px] translate-x-[1px]">
                  <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                  <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
                  <g id="SVGRepo_iconCarrier">
                    <path d="M29.919 6.163l-4.225 19.925c-0.319 1.406-1.15 1.756-2.331 1.094l-6.438-4.744-3.106 2.988c-0.344 0.344-0.631 0.631-1.294 0.631l0.463-6.556 11.931-10.781c0.519-0.462-0.113-0.719-0.806-0.256l-14.75 9.288-6.35-1.988c-1.381-0.431-1.406-1.381 0.288-2.044l24.837-9.569c1.15-0.431 2.156 0.256 1.781 2.013z" fill="#f0f0f0"></path>
                  </g>
                </svg>
              </button>
            </div>
          </motion.div>
        ) : (
          /* ── Hold mode: slide-to-cancel / swipe-up-to-lock ── */
          <RecordingHoldUI
            slideOffset={slideOffset}
            lockOffset={lockOffset}
            isHolding={isHolding}
            recordingTime={recordingTime}
            barDomRefs={barDomRefs}
            formatTime={formatTime}
            MAX_RECORD_DURATION={MAX_RECORD_DURATION}
            SLIDE_CANCEL_THRESHOLD={SLIDE_CANCEL_THRESHOLD}
            LOCK_THRESHOLD={LOCK_THRESHOLD}
            t={t}
          />
        )}
      </>
      ) : (
        <div className="flex flex-col bg-[#272938] rounded-[1rem] w-full max-w-3xl mx-auto transition-all duration-300 hover:bg-white/[0.06] group border-t border-[#393c49]">
          {/* Reply / Edit indicator — inside at the top */}
          <AnimatePresence>
            {(replyTo || editingMessage) && (
              <motion.div
                initial={{ height: 0, opacity: 0, y: 10, scale: 0.95 }}
                animate={{ height: 'auto', opacity: 1, y: 0, scale: 1 }}
                exit={{ height: 0, opacity: 0, y: 10, scale: 0.95 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 px-4 py-2.5 relative">
                  <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                    {editingMessage ? (
                      <Pencil size={12} className="text-vortex-400" />
                    ) : (
                      <Reply size={12} className="text-vortex-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className="text-xs font-semibold text-vortex-400 mb-0.5">
                      {editingMessage
                        ? t('editing')
                        : `${t('replyTo')} ${replyTo?.sender?.displayName || replyTo?.sender?.username || ''}`}
                    </p>
                    <div className="text-xs text-zinc-300 truncate opacity-80 border-l border-white/20 pl-2 ml-1">
                      {replyTo?.quote ? `«${replyTo.quote}»` : (editingMessage || replyTo)?.content || t('media') || 'Медиа'}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setReplyTo(null);
                      setEditingMessage(null);
                      clearInput();
                    }}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-trash preview-icon"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input row */}
          <div className="flex items-end gap-1.5">
          {/* Emoji / Keyboard toggle — как в Telegram */}
          <div className="relative flex-shrink-0 self-center">
            <button
              onClick={() => {
                if (showEmoji) {
                  setShowEmoji(false);
                  inputRef.current?.focus();
                } else {
                  inputRef.current?.blur();
                  setShowEmoji(true);
                }
              }}
              aria-label={showEmoji ? t('message') : t('emojiTab')}
              aria-expanded={showEmoji}
              className="p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              {showEmoji ? <Keyboard size={30} /> : <Smile size={30} />}
            </button>
          </div>

          {/* Input */}
          <div className="flex-1 relative align-middle self-center">
            {/* @Mention popup */}
            <AnimatePresence>
              {mentionQuery !== null && filteredMembers.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-xl glass-strong shadow-2xl border border-white/10 py-1 z-50 max-h-48 overflow-y-auto"
                >
                  {filteredMembers.map((m, i) => (
                    <button
                      key={m.user.id}
                      onClick={() => insertMention(m)}
                      className={`flex items-center gap-3 w-full px-3 py-2 text-left transition-colors ${
                        i === mentionIndex ? 'bg-accent/20 text-white' : 'text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      {m.user.avatar ? (
                        <img src={mediaUrl(m.user.avatar)} className="w-7 h-7 rounded-full object-cover" alt="" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                          {(m.user.displayName || m.user.username)[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{m.user.displayName || m.user.username}</p>
                        <p className="text-xs text-zinc-500 truncate">@{m.user.username}</p>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <textarea
              ref={inputRef}
              // Неконтролируемое поле: value в Android WebView при составном
              // вводе (IME) конфликтует с composing-region и «съедает» буквы.
              // Значение синхронизируется через syncFromInput / setInputValue.
              defaultValue={text}
              onChange={(e) => syncFromInput(e.target)}
              onKeyDown={handleKeyDown}
              onContextMenu={handleInputContextMenu}
              // Тап по полю ввода = возврат к системной клавиатуре
              onFocus={() => setShowEmoji(false)}
              placeholder={attachment ? t('addCaption') : t('message')}
              rows={1}
              autoCorrect="off"
              autoCapitalize="sentences"
              spellCheck={false}
              enterKeyHint={sendByEnter ? 'send' : 'enter'}
              className="w-full resize-none bg-transparent text-[15px] text-white placeholder-white/40 leading-relaxed py-0.5 px-2 border-none focus:ring-0 max-h-[150px] outline-none"
            />
          </div>

          {/* Attach */}
          <div className="relative mb-0.5 mr-1 flex-shrink-0 self-center">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors group-focus-within:text-white/70"
            >
              <Paperclip size={25} />
            </button>
            <AnimatePresence>
              {showAttachMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    className="absolute bottom-[calc(100%+12px)] right-0 w-52 rounded-[1.5rem] glass-strong shadow-2xl z-50 p-2 border border-white/10 backdrop-blur-3xl"
                  >
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className="flex items-center gap-4 w-full px-3 py-3 rounded-xl text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-white transition-all group"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-vortex-400/20 to-purple-500/20 flex items-center justify-center ring-1 ring-vortex-400/30 group-hover:scale-110 transition-transform shadow-inner">
                        <ImageIcon size={18} className="text-vortex-400" />
                      </div>
                      {t('photoVideo')}
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-4 w-full px-3 py-3 rounded-xl text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-white transition-all group mt-1"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400/20 to-teal-500/20 flex items-center justify-center ring-1 ring-emerald-400/30 group-hover:scale-110 transition-transform shadow-inner">
                        <FileText size={18} className="text-emerald-400" />
                      </div>
                      {t('file')}
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleImageChange}
            />
          </div>

          {/* Send / Mic */}
          <div className="flex-shrink-0 self-center mr-0.5 relative">
            {hasContent ? (
              <>
                <button
                  onClick={() => handleSend()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setScheduleStep('presets');
                    setShowSchedule(true);
                  }}
                  disabled={isSending}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-accent hover:bg-accent-hover transition-colors text-white disabled:opacity-50 shadow-md transform hover:scale-105"
                >
                  <svg fill="#f0f0f0" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" stroke="#f0f0f0" className="w-[22px] h-[22px] translate-x-[1px] translate-y-[1px]">
                  <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                  <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
                  <g id="SVGRepo_iconCarrier">
                    <path d="M29.919 6.163l-4.225 19.925c-0.319 1.406-1.15 1.756-2.331 1.094l-6.438-4.744-3.106 2.988c-0.344 0.344-0.631 0.631-1.294 0.631l0.463-6.556 11.931-10.781c0.519-0.462-0.113-0.719-0.806-0.256l-14.75 9.288-6.35-1.988c-1.381-0.431-1.406-1.381 0.288-2.044l24.837-9.569c1.15-0.431 2.156 0.256 1.781 2.013z" fill="#f0f0f0"></path>
                  </g>
                </svg>
                </button>
                <AnimatePresence>
                  {showSchedule && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSchedule(false)} />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                        className="absolute bottom-[calc(100%+12px)] right-0 w-72 rounded-2xl glass-strong shadow-2xl z-50 border border-white/10 backdrop-blur-3xl overflow-hidden"
                      >
                        {/* Header */}
                        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                          {scheduleStep === 'custom' && (
                            <button onClick={() => setScheduleStep('presets')} className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                              <ChevronLeft size={16} />
                            </button>
                          )}
                          <Clock size={16} className="text-vortex-400" />
                          <span className="text-sm font-medium text-zinc-200">{t('scheduleMessage')}</span>
                        </div>

                        {scheduleStep === 'presets' ? (
                          <div className="p-2 space-y-1">
                            {/* Preset: 1 hour */}
                            <button
                              onClick={() => {
                                const d = new Date(Date.now() + 3600000);
                                handleSend(d.toISOString());
                                setShowSchedule(false);
                                setScheduleToast(d.toLocaleString());
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-200 hover:bg-white/10 transition-colors text-left"
                            >
                              <Clock size={15} className="text-zinc-400 flex-shrink-0" />
                              {t('scheduleIn1h')}
                            </button>
                            {/* Preset: 3 hours */}
                            <button
                              onClick={() => {
                                const d = new Date(Date.now() + 3 * 3600000);
                                handleSend(d.toISOString());
                                setShowSchedule(false);
                                setScheduleToast(d.toLocaleString());
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-200 hover:bg-white/10 transition-colors text-left"
                            >
                              <Clock size={15} className="text-zinc-400 flex-shrink-0" />
                              {t('scheduleIn3h')}
                            </button>
                            {/* Preset: Tomorrow 9:00 */}
                            <button
                              onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() + 1);
                                d.setHours(9, 0, 0, 0);
                                handleSend(d.toISOString());
                                setShowSchedule(false);
                                setScheduleToast(d.toLocaleString());
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-zinc-200 hover:bg-white/10 transition-colors text-left"
                            >
                              <Calendar size={15} className="text-zinc-400 flex-shrink-0" />
                              {t('scheduleTomorrow')}
                            </button>
                            <div className="border-t border-white/5 my-1" />
                            {/* Custom */}
                            <button
                              onClick={() => {
                                const now = new Date();
                                setScheduleCalYear(now.getFullYear());
                                setScheduleCalMonth(now.getMonth());
                                const m = String(now.getMonth() + 1).padStart(2, '0');
                                const d = String(now.getDate()).padStart(2, '0');
                                setScheduleCalDate(`${now.getFullYear()}-${m}-${d}`);
                                setScheduleHour(String(Math.min(now.getHours() + 1, 23)).padStart(2, '0'));
                                setScheduleMinute(String(now.getMinutes()).padStart(2, '0'));
                                setScheduleStep('custom');
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-vortex-400 hover:bg-white/10 transition-colors text-left"
                            >
                              <Calendar size={15} className="flex-shrink-0" />
                              {t('scheduleCustom')}
                            </button>
                          </div>
                        ) : (
                          <ScheduleCalendar
                            calDate={scheduleCalDate}
                            setCalDate={setScheduleCalDate}
                            calMonth={scheduleCalMonth}
                            setCalMonth={setScheduleCalMonth}
                            calYear={scheduleCalYear}
                            setCalYear={setScheduleCalYear}
                            hour={scheduleHour}
                            setHour={setScheduleHour}
                            minute={scheduleMinute}
                            setMinute={setScheduleMinute}
                            onSend={(iso) => {
                              handleSend(iso);
                              setShowSchedule(false);
                              setScheduleToast(new Date(iso).toLocaleString());
                            }}
                            t={t}
                          />
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <button
                ref={micBtnRef}
                onPointerDown={handleMicPointerDown}
                className={`w-10 h-10 flex items-center justify-center rounded-full text-white transition-all shadow-md transform hover:scale-105 touch-none select-none ${
                  inputMode === 'voice'
                    ? 'bg-[#6366f1] hover:bg-[#5555e0]'
                    : 'bg-[#6366f1] hover:bg-[#d97706]'
                }`}
              >
                {inputMode === 'voice' ? <Mic size={22} /> : <Video size={22} />}
              </button>
            )}
          </div>
        </div>
        </div>
      )}

      {/* Formatting Context Menu */}
      <AnimatePresence>
        {formatMenu.show && (
          <>
            <div className="fixed inset-0 z-50 cursor-pointer" onClick={() => setFormatMenu({ ...formatMenu, show: false })} onContextMenu={(e) => { e.preventDefault(); setFormatMenu({ ...formatMenu, show: false }); }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed z-[9999] w-48 rounded-2xl glass-strong shadow-2xl py-1"
              style={{ left: formatMenu.x, top: formatMenu.y - 180 }}
            >
              <button
                onClick={() => applyFormat('**', '**')}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 transition-colors"
              >
                <b className="font-bold">{t('formatBold')}</b> <span className="text-xs text-zinc-500 ml-auto">{t('formatBoldHint')}</span>
              </button>
              <button
                onClick={() => applyFormat('_', '_')}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 transition-colors"
              >
                <em className="italic">{t('formatItalic')}</em> <span className="text-xs text-zinc-500 ml-auto">{t('formatItalicHint')}</span>
              </button>
              <button
                onClick={() => applyFormat('~', '~')}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 transition-colors"
              >
                <del className="line-through">{t('formatStrike')}</del> <span className="text-xs text-zinc-500 ml-auto">{t('formatStrikeHint')}</span>
              </button>
              <button
                onClick={() => applyFormat('`', '`')}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 transition-colors"
              >
                <code className="bg-black/20 rounded px-1 font-mono">{t('formatMono')}</code> <span className="text-xs text-zinc-500 ml-auto">{t('formatMonoHint')}</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Schedule toast notification */}
      <AnimatePresence>
        {scheduleToast && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            onAnimationComplete={() => {
              setTimeout(() => setScheduleToast(null), 3500);
            }}
            className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-[9999] px-4 py-2.5 rounded-xl bg-surface shadow-2xl border border-border flex items-center gap-2 whitespace-nowrap"
          >
            <Check size={16} className="text-emerald-400 flex-shrink-0" />
            <span className="text-sm text-zinc-200">{t('messageScheduled')}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Панель эмодзи — инлайн под полем ввода */}
      <AnimatePresence initial={false}>
        {showEmoji && !isRecording && !isRecordingVideo && !voicePreview && (
          <Suspense key="emoji-picker" fallback={null}>
            <div className="-mx-3 md:-mx-6 -mb-[max(1rem,env(safe-area-inset-bottom,0px))] md:-mb-6 mt-2">
              <EmojiPicker
                onSelect={insertEmoji}
                onBackspace={handleEmojiBackspace}
                onSelectGif={(gifUrl) => {
                  const socket = getSocket();
                  if (socket) {
                    socket.emit('send_message', {
                      chatId,
                      content: null,
                      type: 'image',
                      mediaUrl: gifUrl,
                      mediaType: 'image',
                      fileName: 'gif',
                      replyToId: replyTo?.id || null,
                    });
                    setReplyTo(null);
                  }
                  setShowEmoji(false);
                }}
                onClose={() => setShowEmoji(false)}
              />
            </div>
          </Suspense>
        )}
      </AnimatePresence>

      {/* Video circle recorder overlay */}
      <AnimatePresence>
        {showVideoRecorder && (
          <VideoCircleRecorder
            chatId={chatId}
            autoStart={true}
            onClose={() => setShowVideoRecorder(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* =================== Schedule Mini Calendar =================== */
function ScheduleCalendar({
  calDate, setCalDate, calMonth, setCalMonth, calYear, setCalYear,
  hour, setHour, minute, setMinute, onSend, t,
}: {
  calDate: string;
  setCalDate: (v: string) => void;
  calMonth: number;
  setCalMonth: (v: number) => void;
  calYear: number;
  setCalYear: (v: number) => void;
  hour: string;
  setHour: (v: string) => void;
  minute: string;
  setMinute: (v: string) => void;
  onSend: (iso: string) => void;
  t: (k: any) => any;
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDayRaw = new Date(calYear, calMonth, 1).getDay();
  const firstDay = firstDayRaw === 0 ? 6 : firstDayRaw - 1;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d2 = 1; d2 <= daysInMonth; d2++) cells.push(d2);

  const weekDays = t('weekDays') as string[];
  const months = t('months') as string[];

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  const selectDay = (day: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    setCalDate(`${calYear}-${m}-${d}`);
  };

  const isSelected = (day: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return calDate === `${calYear}-${m}-${d}`;
  };

  const isToday = (day: number) => {
    return today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;
  };

  const isPast = (day: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${calYear}-${m}-${d}` < todayStr;
  };

  const canSend = (() => {
    if (!calDate) return false;
    const dt = new Date(`${calDate}T${hour}:${minute}:00`);
    return dt.getTime() > Date.now();
  })();

  const handleSend = () => {
    if (!canSend) return;
    const dt = new Date(`${calDate}T${hour}:${minute}:00`);
    onSend(dt.toISOString());
  };

  return (
    <div>
      {/* Mini calendar header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-medium text-zinc-300">{months[calMonth]} {calYear}</span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-2 pt-1">
        {weekDays.map((d) => (
          <div key={d} className="text-center text-[10px] text-zinc-500 font-medium py-0.5">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 px-2 pb-2">
        {cells.map((day, i) => (
          <div key={i} className="flex items-center justify-center">
            {day ? (
              <button
                onClick={() => !isPast(day) && selectDay(day)}
                disabled={isPast(day)}
                className={`w-7 h-7 rounded-full text-xs flex items-center justify-center transition-all ${
                  isSelected(day)
                    ? 'bg-accent text-white font-semibold shadow-lg shadow-accent/30'
                    : isPast(day)
                      ? 'text-zinc-600 cursor-not-allowed'
                      : isToday(day)
                        ? 'text-vortex-400 font-semibold ring-1 ring-vortex-500/50'
                        : 'text-zinc-300 hover:bg-white/10'
                }`}
              >
                {day}
              </button>
            ) : (
              <span className="w-7 h-7" />
            )}
          </div>
        ))}
      </div>

      {/* Time picker */}
      <div className="px-3 pb-2">
        <label className="text-[11px] text-zinc-500 mb-1 block">{t('scheduleTime')}</label>
        <div className="flex items-center gap-2">
          <select
            value={hour}
            onChange={(e) => setHour(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-vortex-500/50 appearance-none text-center"
          >
            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
              <option key={h} value={h} className="bg-zinc-800">{h}</option>
            ))}
          </select>
          <span className="text-zinc-400 font-bold">:</span>
          <select
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-vortex-500/50 appearance-none text-center"
          >
            {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
              <option key={m} value={m} className="bg-zinc-800">{m}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Send button */}
      <div className="px-3 pb-3">
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full py-2 rounded-xl bg-accent hover:bg-accent-hover disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium transition-colors"
        >
          {t('scheduleSend')}
        </button>
      </div>
    </div>
  );
}

/* =================== Telegram-style Hold-to-Record overlay =================== */
function RecordingHoldUI({
  slideOffset, lockOffset, isHolding, recordingTime, barDomRefs, formatTime,
  MAX_RECORD_DURATION, SLIDE_CANCEL_THRESHOLD, LOCK_THRESHOLD, t,
}: {
  slideOffset: number;
  lockOffset: number;
  isHolding: boolean;
  recordingTime: number;
  barDomRefs: MutableRefObject<(HTMLDivElement | null)[]>;
  formatTime: (s: number) => string;
  MAX_RECORD_DURATION: number;
  SLIDE_CANCEL_THRESHOLD: number;
  LOCK_THRESHOLD: number;
  t: (k: any) => any;
}) {
  const circumference = 2 * Math.PI * 21;
  const progress = recordingTime / MAX_RECORD_DURATION;
  const cancelActive = slideOffset < -SLIDE_CANCEL_THRESHOLD;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-0 w-full max-w-3xl mx-auto relative overflow-visible select-none"
      style={{ touchAction: 'none' }}
    >
      {/* Left: timer + waveform (slides with finger) */}
      <div
        className="flex-1 flex items-center gap-3 px-4 py-2 transition-transform duration-75"
        style={{ transform: `translateX(${slideOffset * 0.6}px)` }}
      >
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
        <span className="text-sm text-zinc-300 font-mono flex-shrink-0">
          {formatTime(recordingTime)}
        </span>
        <div className="flex-1 flex items-center gap-0.5 h-6">
          {Array.from({ length: 32 }, (_, i) => (
            <div
              key={i}
              ref={el => { barDomRefs.current[i] = el; }}
              className="flex-1 bg-vortex-400/60 rounded-full"
              style={{ height: '5%' }}
            />
          ))}
        </div>
      </div>

      {/* Center: slide-to-cancel hint */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-1.5 transition-opacity duration-200"
        style={{ opacity: Math.abs(slideOffset) > 30 ? Math.min(1, Math.abs(slideOffset) / 80) : 0.6 }}
      >
        <ChevronLeft size={14} className={cancelActive ? 'text-red-400' : 'text-zinc-500 slide-cancel-hint'} />
        <span className={`text-xs whitespace-nowrap ${cancelActive ? 'text-red-400 font-medium' : 'text-zinc-500'}`}>
          {cancelActive ? t('releaseToCancel') : t('slideToCancel')}
        </span>
      </div>

      {/* Right: lock indicator + mic button with progress ring */}
      <div className="flex flex-col items-center flex-shrink-0 relative mr-1">
        {/* Lock hint above the mic button */}
        <AnimatePresence>
          {isHolding && lockOffset >= -LOCK_THRESHOLD && lockOffset < -8 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute -top-14 flex flex-col items-center"
            >
              <div
                className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center"
                style={{ transform: `translateY(${Math.max(lockOffset * 0.25, -16)}px)` }}
              >
                <Lock size={13} className="text-zinc-300 lock-bounce" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mic button with SVG progress ring */}
        <div className="relative w-12 h-12">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="21" fill="none" stroke="rgba(239,68,68,0.15)" strokeWidth="2.5" />
            <circle
              cx="24" cy="24" r="21"
              fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={(1 - progress) * circumference}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <div
            className="absolute inset-1 rounded-full bg-red-500 text-white flex items-center justify-center recording-pulse-ring pointer-events-none"
          >
            <Mic size={18} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* =================== Video Camera Preview =================== */
function VideoPreview({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  if (!stream) {
    return (
      <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
        <Video size={16} className="text-zinc-500" />
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      className="w-full h-full object-cover scale-x-[-1]"
    />
  );
}

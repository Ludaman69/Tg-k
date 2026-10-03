import { useRef, useCallback, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { CATEGORY_META, RECENT_CATEGORY_ID } from './emojiData';
import type { EmojiData, CategoryData } from './emojiData';
import { useLang } from '../lib/i18n';
import SkinTonePicker from './SkinTonePicker';

interface Props {
  categories: CategoryData[];
  recentEmojis: EmojiData[];
  activeCategory: string;
  searchQuery: string;
  searchResults: EmojiData[];
  columns: number;
  onSelect: (emoji: EmojiData) => void;
  onCategoryChange: (categoryId: string) => void;
  onSearchChange: (query: string) => void;
  onScrollDirection?: (dir: 'up' | 'down') => void;
}

export default function EmojiGrid({
  categories,
  recentEmojis,
  activeCategory,
  searchQuery,
  searchResults,
  columns,
  onSelect,
  onCategoryChange,
  onSearchChange,
  onScrollDirection,
}: Props) {
  const t = useLang(s => s.t);
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [skinPicker, setSkinPicker] = useState<{ emoji: EmojiData; x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const longPressTarget = useRef<EmojiData | null>(null);
  const touchMoved = useRef(false);
  // Флаг: true — скролл пользователя, не скроллить программно
  const isManualScroll = useRef(false);
  const lastScrollTop = useRef(0);

  const handlePointerDown = useCallback((emoji: EmojiData, e: React.PointerEvent) => {
    touchMoved.current = false;
    longPressTarget.current = emoji;
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current && emoji.skins.length > 1) {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setSkinPicker({ emoji, x: rect.left + rect.width / 2 - 50, y: rect.top });
      }
    }, 400);
  }, []);

  const handlePointerMove = useCallback(() => { touchMoved.current = true; }, []);
  const handlePointerUp = useCallback((emoji: EmojiData) => {
    clearTimeout(longPressTimer.current);
    if (!touchMoved.current && !skinPicker) onSelect(emoji);
  }, [onSelect, skinPicker]);
  const handlePointerLeave = useCallback(() => { clearTimeout(longPressTimer.current); }, []);

  // Прокрутка к категории — только внутри контейнера, без scrollIntoView,
  // который в WebView прокручивает всю страницу и «сбивает» вёрстку чата
  useEffect(() => {
    if (searchQuery) return;
    // Если смена категории произошла от скролла — не дёргаем скролл
    if (isManualScroll.current) { isManualScroll.current = false; return; }
    const container = containerRef.current;
    const section = sectionRefs.current.get(activeCategory);
    if (!container || !section) return;

    const target = section.offsetTop;
    if (Math.abs(target - container.scrollTop) < 4) return;

    container.scrollTo({ top: target, behavior: 'smooth' });
  }, [activeCategory, searchQuery]);

  // Подсветка категории по скроллу — без дёргания скролла
  const handleScroll = useCallback(() => {
    if (searchQuery) return;
    const container = containerRef.current;
    if (!container) return;

    // Определяем направление скролла
    const currentScroll = container.scrollTop;
    if (currentScroll > lastScrollTop.current + 5) {
      onScrollDirection?.('down');
    } else if (currentScroll < lastScrollTop.current - 5) {
      onScrollDirection?.('up');
    }
    lastScrollTop.current = currentScroll;

    const threshold = container.scrollTop + 12;
    let currentId = activeCategory;
    let bestTop = -Infinity;
    sectionRefs.current.forEach((el, id) => {
      if (el.offsetTop <= threshold && el.offsetTop > bestTop) {
        bestTop = el.offsetTop;
        currentId = id;
      }
    });
    if (currentId !== activeCategory) {
      isManualScroll.current = true;
      onCategoryChange(currentId);
    }
  }, [activeCategory, searchQuery, onCategoryChange]);

  const tonePicker = skinPicker ? (
    <SkinTonePicker
      emoji={skinPicker.emoji}
      position={{ x: skinPicker.x, y: skinPicker.y }}
      onSelect={(n) => { onSelect({ ...skinPicker.emoji, native: n }); setSkinPicker(null); }}
      onClose={() => setSkinPicker(null)}
    />
  ) : null;

  // Результаты поиска
  if (searchQuery) {
    return (
      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto overscroll-contain px-1.5 py-1 scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {searchResults.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-white/35">{t('nothingFound')}</div>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {searchResults.map((emoji) => (
              <EmojiButton key={emoji.id} emoji={emoji} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerLeave} />
            ))}
          </div>
        )}
        {tonePicker}
      </div>
    );
  }

  // Секции: «Недавние» + категории emoji-mart
  const sections: { id: string; label: string; emojis: EmojiData[] }[] = [];
  if (recentEmojis.length > 0) {
    sections.push({ id: RECENT_CATEGORY_ID, label: t('emojiRecent'), emojis: recentEmojis });
  }
  categories.forEach((cat) => {
    const meta = CATEGORY_META[cat.id];
    sections.push({ id: cat.id, label: meta ? t(meta.labelKey) : cat.id, emojis: cat.emojis });
  });

  return (
    <div
      ref={containerRef}
      /* relative — чтобы offsetTop секций считался от этого контейнера */
      className="relative flex-1 overflow-y-auto overscroll-contain px-1.5 scrollbar-hide"
      style={{ WebkitOverflowScrolling: 'touch' }}
      onScroll={handleScroll}
    >
      <div className="px-2 pt-1 pb-1.5">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("emojiSearch")}
            autoCorrect="off" autoCapitalize="none" spellCheck={false}
            className="w-full pl-10 pr-4 py-2 rounded-full bg-[#333647] text-sm text-white placeholder-white/30 outline-none border border-transparent focus:border-white/10 transition-colors"
          />
        </div>
      </div>
      {sections.map((section) => (
        <div key={section.id} ref={(el) => { if (el) sectionRefs.current.set(section.id, el); }}>
          <div className="px-2 pb-1">
            <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">{section.label}</span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {section.emojis.map((emoji) => (
              <EmojiButton key={emoji.id} emoji={emoji} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerLeave} />
            ))}
          </div>
        </div>
      ))}
      <div className="h-4" />
      {tonePicker}
    </div>
  );
}
// --- Emoji Button ---

function EmojiButton({
  emoji,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}: {
  emoji: EmojiData;
  onPointerDown: (e: EmojiData, ev: React.PointerEvent) => void;
  onPointerMove: () => void;
  onPointerUp: (e: EmojiData) => void;
  onPointerLeave: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 1.25 }}
      transition={{ duration: 0.12 }}
      onPointerDown={(e) => onPointerDown(emoji, e)}
      onPointerMove={onPointerMove}
      onPointerUp={() => onPointerUp(emoji)}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
      title={emoji.name}
      aria-label={emoji.name}
      className="flex items-center justify-center rounded-xl hover:bg-white/[0.07] active:bg-white/10 transition-colors select-none touch-manipulation"
      style={{ aspectRatio: '1 / 1', minHeight: 42, fontSize: '1.75rem', lineHeight: 1 }}
    >
      {emoji.native}
    </motion.button>
  );
}
import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Smile, Cat, Apple, Volleyball, Car, Lightbulb, Hash, Flag } from 'lucide-react';
import { springIcon } from '../lib/motion';
import { CATEGORY_META, RECENT_CATEGORY_ID } from './emojiData';
import type { CategoryData, CategoryIconName } from './emojiData';
import { useLang } from '../lib/i18n';

/** Контурные иконки категорий — как в Telegram (не цветные эмодзи) */
const ICONS: Record<CategoryIconName, typeof Smile> = {
  recent: Clock,
  smile: Smile,
  cat: Cat,
  apple: Apple,
  activity: Volleyball,
  car: Car,
  bulb: Lightbulb,
  hash: Hash,
  flag: Flag,
};

interface Props {
  categories: CategoryData[];
  activeCategory: string;
  hasRecent: boolean;
  onSelect: (categoryId: string) => void;
}

export default function EmojiCategoryBar({ categories, activeCategory, hasRecent, onSelect }: Props) {
  const t = useLang(s => s.t);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Автопрокрутка активной категории в видимую область (без скролла страницы)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const btn = container.querySelector<HTMLButtonElement>(`[data-cat="${activeCategory}"]`);
    if (!btn) return;

    const target = btn.offsetLeft + btn.offsetWidth / 2 - container.clientWidth / 2;
    const max = container.scrollWidth - container.clientWidth;
    const next = Math.max(0, Math.min(target, max));
    if (Math.abs(next - container.scrollLeft) > 4) {
      container.scrollTo({ left: next, behavior: 'smooth' });
    }
  }, [activeCategory]);

  const items: { id: string; icon: CategoryIconName; label: string }[] = [];
  if (hasRecent) {
    items.push({ id: RECENT_CATEGORY_ID, icon: 'recent', label: t('emojiRecent') });
  }
  categories.forEach((cat) => {
    const meta = CATEGORY_META[cat.id];
    if (!meta) return;
    items.push({ id: cat.id, icon: meta.icon, label: t(meta.labelKey) });
  });

  return (
    <div className="px-2 pt-1.5 pb-1">
      <div
        ref={scrollRef}
        /* relative — чтобы offsetLeft кнопок считался от этого контейнера */
        className="relative flex items-center gap-0.5 px-1 py-1 rounded-full bg-black/25 overflow-x-auto scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map(({ id, icon, label }) => {
          const Icon = ICONS[icon];
          const isActive = id === activeCategory;

          return (
            <button
              key={id}
              data-cat={id}
              onClick={() => onSelect(id)}
              title={label}
              aria-label={label}
              aria-selected={isActive}
              className={`relative flex-shrink-0 flex items-center justify-center rounded-full transition-colors duration-200 active:scale-90 ${
                isActive ? 'text-white' : 'text-white/35 hover:text-white/70'
              }`}
              style={{ width: 40, height: 34 }}
            >
              {isActive && (
                <motion.span
                  layoutId="emojiActiveCategory"
                  className="absolute inset-0 rounded-full bg-white/[0.12]"
                  transition={springIcon}
                />
              )}
              <Icon size={20} strokeWidth={1.8} className="relative z-10" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
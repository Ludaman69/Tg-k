import { motion } from 'framer-motion';
import { Delete } from 'lucide-react';
import { springIcon } from '../lib/motion';
import { useLang } from '../lib/i18n';

export type TabType = 'emoji' | 'gif' | 'stickers';

interface Props {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  onBackspace: () => void;
}

/**
 * Нижняя панель пикера в стиле Telegram: капсула-переключатель
 * «Эмодзи / GIF / Стикеры» по центру и круглый backspace справа.
 */
export default function EmojiPickerTabs({ activeTab, onTabChange, onBackspace }: Props) {
  const t = useLang(s => s.t);

  const tabs: { id: TabType; label: string }[] = [
    { id: 'emoji', label: t('emojiTab') },
    { id: 'gif', label: t('gifTab') },
    { id: 'stickers', label: t('stickersTab') },
  ];

  return (
    <div className="relative flex items-center justify-center px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
      {/* Капсула с табами — по центру, как в Telegram */}
      <div className="flex items-center gap-0 p-0.5 rounded-full bg-[#181818f7] border-t border-[#393c49]">
        {tabs.map(({ id, label }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              aria-selected={isActive}
              className={`relative px-4 rounded-full text-[13px] font-semibold transition-colors duration-200 ${
                isActive ? 'text-white' : 'text-white/45 hover:text-white/75'
              }`}
              style={{ minHeight: 34 }}
            >
              {isActive && (
                <motion.span
                  layoutId="emojiActiveTab"
                  className="absolute inset-0 rounded-full bg-white/[0.14]"
                  transition={springIcon}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Backspace — прижат вправо */}
      <button
        onClick={onBackspace}
        aria-label="Backspace"
        className="absolute right-3 flex items-center justify-center rounded-full bg-[#181818f7] text-white/55 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
        style={{ width: 44, height: 34 }}
      >
        <Delete size={20} strokeWidth={1.8} />
      </button>
    </div>
  );
}
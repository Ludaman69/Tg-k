import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";

import { getCategories, searchEmojis, RECENT_CATEGORY_ID } from "./emojiData";
import type { EmojiData } from "./emojiData";
import { useLang } from "../lib/i18n";
import EmojiCategoryBar from "./EmojiCategoryBar";
import EmojiGrid from "./EmojiGrid";
import EmojiPickerTabs from "./EmojiPickerTabs";
import type { TabType } from "./EmojiPickerTabs";

const RECENT_KEY = "vortex_recent_emoji";
const MAX_RECENT = 24;

function loadRecent(): EmojiData[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecent(list: EmojiData[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

function panelHeightFor(viewportHeight: number): number {
  return Math.round(Math.min(Math.max(viewportHeight * 0.46, 260), 380));
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onSelectGif?: (url: string, preview: string) => void;
  onBackspace?: () => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onBackspace, onClose }: EmojiPickerProps) {
  const t = useLang(s => s.t);
  const [tab, setTab] = useState<TabType>("emoji");
  const [searchQuery, setSearchQuery] = useState("");
  const [recentEmojis, setRecentEmojis] = useState<EmojiData[]>(loadRecent);
  const [activeCategory, setActiveCategory] = useState(() =>
    recentEmojis.length > 0 ? RECENT_CATEGORY_ID : "people"
  );
  const [columns, setColumns] = useState(8);
  const [panelHeight, setPanelHeight] = useState(panelHeightFor(window.innerHeight));
  const [tabsVisible, setTabsVisible] = useState(true);

  const categories = useMemo(() => getCategories(), []);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 360) setColumns(7);
      else if (w < 420) setColumns(8);
      else if (w < 520) setColumns(9);
      else if (w < 720) setColumns(10);
      else setColumns(12);
      setPanelHeight(panelHeightFor(window.innerHeight));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const searchResults = useMemo(
    () => (searchQuery ? searchEmojis(searchQuery, 80) : []),
    [searchQuery]
  );

  const handleEmojiSelect = useCallback((emoji: EmojiData) => {
    onSelect(emoji.native);
    setRecentEmojis((prev) => {
      const filtered = prev.filter((e) => e.id !== emoji.id);
      const next = [emoji, ...filtered].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  }, [onSelect]);

  const handleSearchChange = useCallback((v: string) => {
    setSearchQuery(v);
    if (!v) setActiveCategory(recentEmojis.length > 0 ? RECENT_CATEGORY_ID : "people");
  }, [recentEmojis.length]);

  const handleScrollDirection = useCallback((dir: 'up' | 'down') => {
    setTabsVisible(dir === 'up');
  }, []);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: panelHeight, opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.7 }}
      className="relative w-full overflow-hidden bg-[#272938] backdrop-blur-lg flex flex-col rounded-t-[24px] border-t border-[#393c49]"
    >
      {tab === "emoji" && !searchQuery && (
        <div className="flex-shrink-0">
          <EmojiCategoryBar
            categories={categories}
            activeCategory={activeCategory}
            hasRecent={recentEmojis.length > 0}
            onSelect={setActiveCategory}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 relative flex flex-col">
        {tab === "emoji" && (
          <EmojiGrid
            categories={categories}
            recentEmojis={recentEmojis}
            activeCategory={activeCategory}
            searchQuery={searchQuery}
            searchResults={searchResults}
            columns={columns}
            onSelect={handleEmojiSelect}
            onCategoryChange={setActiveCategory}
            onSearchChange={handleSearchChange}
            onScrollDirection={handleScrollDirection}
          />
        )}
        {tab === "gif" && <div className="flex-1 flex items-center justify-center text-sm text-white/30">{t("gifsSoon")}</div>}
        {tab === "stickers" && <div className="flex-1 flex items-center justify-center text-sm text-white/30">{t("stickersSoon")}</div>}
        {/* Оверлей с табами поверх скролла — Telegram-style */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 z-10"
          animate={{ y: tabsVisible ? 0 : '100%', opacity: tabsVisible ? 1 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 36 }}
        >
          <EmojiPickerTabs
            activeTab={tab}
            onTabChange={setTab}
            onBackspace={() => onBackspace?.()}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

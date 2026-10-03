import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EmojiData } from './emojiData';

interface Props {
  emoji: EmojiData;
  position: { x: number; y: number };
  onSelect: (native: string) => void;
  onClose: () => void;
}

const SKIN_TONES = ['🏻', '🏼', '🏽', '🏾', '🏿'];

function applySkinTone(base: string, tone: string): string {
  // Simple approach: append skin tone modifier after the base emoji
  // Works for most single-codepoint + ZWJ emojis
  if (base.length <= 4) return base + tone;
  // For more complex emojis, try to insert before ZWJ
  const zwjIdx = base.indexOf('\u200D');
  if (zwjIdx > 0) {
    return base.slice(0, zwjIdx) + tone + base.slice(zwjIdx);
  }
  return base + tone;
}

export default function SkinTonePicker({ emoji, position, onSelect, onClose }: Props) {
  const baseNative = emoji.native.replace(/[🏻🏼🏽🏾🏿]/g, '');
  const variants = SKIN_TONES.map((tone) => applySkinTone(baseNative, tone));

  // Position adjustment to keep popup in viewport
  const popupRef = useRef<HTMLDivElement>(null);
  const [adjX, setAdjX] = useState(position.x);

  useEffect(() => {
    if (popupRef.current) {
      const rect = popupRef.current.getBoundingClientRect();
      if (rect.right > window.innerWidth - 16) {
        setAdjX(position.x - (rect.right - window.innerWidth + 16));
      }
    }
  }, [position.x]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999]"
        onClick={onClose}
      >
        <motion.div
          ref={popupRef}
          initial={{ opacity: 0, scale: 0.8, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 8 }}
          transition={{ duration: 0.18 }}
          className="absolute flex gap-1 p-2 rounded-xl bg-[#2a2b3d] border border-white/10 shadow-2xl"
          style={{ left: adjX, top: position.y - 60 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Default (no tone) */}
          <button
            onClick={() => onSelect(baseNative)}
            className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-90 transition-all text-2xl"
          >
            {baseNative}
          </button>
          {/* Tone variants */}
          {variants.map((v, i) => (
            <button
              key={i}
              onClick={() => onSelect(v)}
              className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-white/10 active:scale-90 transition-all text-2xl"
            >
              {v}
            </button>
          ))}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
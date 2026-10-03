import type { Transition, Variants } from 'framer-motion';
import { useCallback, useState, useRef } from 'react';

// ─── Spring constants (Telegram-inspired) ───

/** Spring для появления модалок и оверлеев — упругий, но мягкий */
export const springModal: Transition = {
  type: 'spring',
  stiffness: 250,
  damping: 28,
  mass: 0.8,
};

/** Spring для герой-переходов (сторис, аватары) — энергичный */
export const springHero: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 26,
  mass: 0.9,
};

/** Spring для интерактивного dismiss (свайп) — плавный возврат */
export const springSwipe: Transition = {
  type: 'spring',
  stiffness: 350,
  damping: 30,
  mass: 0.7,
};

/** Spring для бейджей и маленьких элементов — быстрый */
export const springBadge: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 25,
};

/** Spring для иконок (табы, кнопки) */
export const springIcon: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 22,
  mass: 0.6,
};

// ─── Variants для модалок и оверлеев ───
export const modalSlideUp: Variants = {
  hidden: {
    opacity: 0,
    y: 40,
    scale: 0.92,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springModal,
  },
  exit: {
    opacity: 0,
    y: 30,
    scale: 0.95,
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

/** Для оверлея (затемнение/блюр) */
export const overlayVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Для blur-оверлея (сторис) */
export const blurOverlayVariants: Variants = {
  hidden: { opacity: 0, backdropFilter: 'blur(0px)' },
  visible: {
    opacity: 1,
    backdropFilter: 'blur(20px)',
    transition: { duration: 0.25, ease: 'easeOut' },
  },
  exit: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
    transition: { duration: 0.2, ease: 'easeIn' },
  },
};

/** Для поисковой панели — slide-down */
export const searchBarVariants: Variants = {
  hidden: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  visible: {
    height: 'auto' as unknown as number,
    opacity: 1,
    transition: { type: 'spring', stiffness: 350, damping: 30, mass: 0.8 },
  },
  exit: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    transition: { duration: 0.15, ease: 'easeIn' },
  },
};

/** Для Hero-перехода (сторис) — scale + opacity */
export const heroVariants: Variants = {
  hidden: (custom: { scale: number; x?: number; y?: number }) => ({
    opacity: 0,
    scale: custom.scale,
    x: custom.x || 0,
    y: custom.y || 0,
  }),
  visible: {
    opacity: 1,
    scale: 1,
    x: 0,
    y: 0,
    transition: springHero,
  },
  exit: {
    opacity: 0,
    scale: 0.85,
    transition: { duration: 0.18, ease: 'easeIn' },
  },
};
// ─── Hook: useSwipeDown (Telegram-style interactive dismiss) ───

interface SwipeDownOptions {
  /** Порог закрытия в px (default: 120) */
  threshold?: number;
  /** Скорость свайпа для принудительного закрытия (default: 400) */
  velocityThreshold?: number;
  /** Коллбэк при закрытии */
  onClose: () => void;
}

interface SwipeDownResult {
  /** Текущее смещение по Y */
  dragY: number;
  /** Сеттер для dragY */
  setDragY: (y: number) => void;
  /** Обработчик окончания drag */
  handleDragEnd: (_: any, info: { offset: { y: number }; velocity: { y: number } }) => void;
  /** Параметры для motion.div: drag, whileDrag, style */
  dragProps: {
    drag: 'y';
    dragConstraints: { top: number; bottom: number };
    dragElastic: { top: number; bottom: number };
    onDrag: (_: any, info: { offset: { y: number } }) => void;
    onDragEnd: (_: any, info: { offset: { y: number }; velocity: { y: number } }) => void;
    style: { y: number };
    whileDrag: { scale: number };
  };
}

/**
 * Hook для интерактивного закрытия свайпом вниз (как в Telegram Stories).
 * Использование:
 *   const { dragY, setDragY, handleDragEnd, dragProps } = useSwipeDown({ onClose });
 *   <motion.div {...dragProps}>...</motion.div>
 */
export function useSwipeDown({ threshold = 120, velocityThreshold = 400, onClose }: SwipeDownOptions): SwipeDownResult {
  const [dragY, setDragY] = useState(0);

  const handleDragEnd = useCallback(
    (_: any, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y > threshold || (info.velocity.y > velocityThreshold && info.offset.y > 40)) {
        onClose();
      } else {
        setDragY(0);
      }
    },
    [threshold, velocityThreshold, onClose]
  );

  const dragProps = {
    drag: 'y' as const,
    dragConstraints: { top: 0, bottom: 300 },
    dragElastic: { top: 0, bottom: 0.4 },
    onDrag: (_: any, info: { offset: { y: number } }) => setDragY(info.offset.y),
    onDragEnd: handleDragEnd,
    style: { y: dragY },
    whileDrag: { scale: 1 - Math.min(dragY / 800, 0.08) },
  };

  return { dragY, setDragY, handleDragEnd, dragProps };
}

// ─── Hook: useSwipeToReply (Telegram-style swipe to reply) ───

interface SwipeToReplyOptions {
  isMobile?: boolean;
  selectionMode?: boolean;
  onReply: () => void;
}

export function useSwipeToReply({ isMobile, selectionMode, onReply }: SwipeToReplyOptions) {
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const swipeLockedRef = useRef<'horizontal' | 'vertical' | null>(null);
  const swipeTriggeredRef = useRef(false);
  const [swipeX, setSwipeX] = useState(0);

  const SWIPE_THRESHOLD = 60;
  const MAX_SWIPE = 100;

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobile || selectionMode) return;
      const touch = e.touches[0];
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      swipeLockedRef.current = null;
      swipeTriggeredRef.current = false;
    },
    [isMobile, selectionMode]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!swipeStartRef.current || !isMobile || selectionMode) return;
      const touch = e.touches[0];
      const dx = touch.clientX - swipeStartRef.current.x;
      const dy = touch.clientY - swipeStartRef.current.y;

      if (!swipeLockedRef.current) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          swipeLockedRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        }
      }
      if (swipeLockedRef.current !== 'horizontal' || swipeTriggeredRef.current) return;

      const clamped = Math.max(0, Math.min(dx, MAX_SWIPE));
      setSwipeX(clamped);

      if (clamped >= SWIPE_THRESHOLD) {
        swipeTriggeredRef.current = true;
        onReply();
        setSwipeX(0);
      }
    },
    [isMobile, selectionMode, onReply]
  );

  const handleTouchEnd = useCallback(() => {
    if (swipeX > 0) setSwipeX(0);
    swipeStartRef.current = null;
    swipeLockedRef.current = null;
  }, [swipeX]);

  return {
    swipeX,
    setSwipeX,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

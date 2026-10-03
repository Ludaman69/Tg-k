import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useTransform } from 'framer-motion';

interface AlwaysSearchBarScrollBehaviorOptions {
  /** Height of the search bar in px — threshold for full collapse (default: 56) */
  searchBarHeight?: number;
  /** Spring stiffness (default: 300) */
  stiffness?: number;
  /** Spring damping (default: 40) */
  damping?: number;
}

/**
 * Hook that provides animated MotionValues for a Telegram‑style search bar
 * that sits BELOW the header (outside the scroll container) and, as the
 * user scrolls down, **slides up over the header** while **collapsing its
 * height**, so the chat list below it pushes into the freed space.
 *
 * ```tsx
 * <header>…</header>
 * <motion.div style={{ y, opacity, height, overflow: 'hidden' }}>
 *   …search input…
 * </motion.div>
 * <div ref={scrollRef} className="flex-1 overflow-y-auto">
 *   …chat list…
 * </div>
 * ```
 */
export function useAlwaysSearchBarScrollBehavior(
  scrollRef: React.RefObject<HTMLElement | null>,
  options: AlwaysSearchBarScrollBehaviorOptions = {},
) {
  const { searchBarHeight = 76, stiffness = 300, damping = 40 } = options;

  // 0 = fully visible, 1 = fully collapsed
  const rawProgress = useMotionValue(0);
  const smoothProgress = useSpring(rawProgress, {
    stiffness,
    damping,
    mass: 0.5,
  });

  // y: whole container slides upward; opacity fades out
  // marginBottom shrinks so the chat list fills the freed space
  const y = useTransform(smoothProgress, [0, 1], [0, -searchBarHeight]);
  const opacity = useTransform(smoothProgress, [0, 0.6, 1], [1, 0, 0]);
  const height = useTransform(smoothProgress, [0, 1], [searchBarHeight, 0]);

  const canScrollRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const checkScrollable = () => {
      canScrollRef.current = el.scrollHeight > el.clientHeight;
      if (!canScrollRef.current) {
        rawProgress.set(0);
      }
    };

    const onScroll = () => {
      if (!canScrollRef.current) return;
      const scrollTop = el.scrollTop;
      const progress = Math.min(1, scrollTop / searchBarHeight);
      rawProgress.set(progress);
    };

    checkScrollable();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', checkScrollable);

    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', checkScrollable);
    };
  }, [scrollRef, searchBarHeight, rawProgress]);

  return { y, opacity, height };
}
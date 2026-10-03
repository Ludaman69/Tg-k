import { memo, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Users, Settings } from 'lucide-react';
import { useLang } from '../lib/i18n';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import Avatar from './Avatar';

export type MobileTab = 'chats' | 'contacts' | 'settings' | 'profile';

interface BottomNavigationProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  /** Custom width for the inner navigation container (e.g. '400px', '90%') */
  width?: string | number;
  /** Custom max-width for the inner navigation container */
  maxWidth?: string | number;
  /**
   * Border color and additional border classes for the unread badge.
   * Set to '' for no border, or pass custom Tailwind border classes (e.g. 'border-red-500/20').
   * @default 'border-[#272a3d]'
   */
  badgeBorder?: string;
  /**
   * Border width for the unread badge. Independent of badgeBorder color/style.
   * Use Tailwind border-width utilities: 'border', 'border-2', 'border-4', etc.
   * @default 'border'
   */
  badgeBorderWidth?: string;
  /**
   * Color for active tab icons. Accepts any valid CSS color value.
   * @default '#6366f1'
   */
  iconColorActive?: string;
  /**
   * Color for inactive tab icons. Accepts any valid CSS color value.
   * @default '#ffffff'
   */
  iconColorInactive?: string;
  /**
   * Color for active tab label text. Accepts any valid CSS color value.
   * @default '#6366f1'
   */
  labelColorActive?: string;
  /**
   * Color for inactive tab label text. Accepts any valid CSS color value.
   * @default '#ffffff'
   */
  labelColorInactive?: string;
  /** Number of incoming friend requests to show a badge on the contacts tab */
  friendRequestsCount?: number;
}

const tabs: { id: MobileTab; icon: typeof MessageCircle | null }[] = [
  { id: 'chats', icon: MessageCircle },
  { id: 'contacts', icon: Users },
  { id: 'settings', icon: Settings },
  { id: 'profile', icon: null },
];

const tabLabelKeys: Record<MobileTab, string> = {
  chats: 'tabChats',
  contacts: 'tabContacts',
  settings: 'tabSettings',
  profile: 'tabProfile',
};

const bubbleSpring = { type: 'spring' as const, stiffness: 380, damping: 28, mass: 0.8 };
const iconSpring = { type: 'spring' as const, stiffness: 400, damping: 22, mass: 0.6 };

function haptic() {
  try { navigator?.vibrate?.(8); } catch { /* unsupported */ }
}

function BottomNavigationInner({
  activeTab,
  onTabChange,
  width,
  maxWidth,
  badgeBorder = 'border-[#272a3d]',
  badgeBorderWidth = 'border-2',
  iconColorActive = '#6366f1',
  iconColorInactive = '#ffffff',
  labelColorActive = '#6366f1',
  labelColorInactive = '#ffffff',
  friendRequestsCount = 0,
}: BottomNavigationProps) {
  const { t } = useLang();
  const chats = useChatStore((s) => s.chats);
  const user = useAuthStore((s) => s.user);

  const totalUnreadChats = useMemo(
    () => chats.filter((chat) => (chat.unreadCount || 0) > 0).length,
    [chats],
  );

  const handleTab = useCallback(
    (tab: MobileTab) => { haptic(); onTabChange(tab); },
    [onTabChange],
  );

  return (
    <nav className="absolute bottom-0 left-0 right-0 z-50 pointer-events-none" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Bottom scrim — gradient fade above the nav bar, like Telegram */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: 80,
          background: 'linear-gradient(to top, rgba(35,35,50) 2%, transparent 100%)',
        }}
      />
      <div
        className="mx-auto mb-2 flex items-center justify-center gap-3 rounded-3xl py-1 pointer-events-auto relative"
        style={{
          background: '#272a3d',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          width: width ?? '315px',
          ...(maxWidth !== undefined ? { maxWidth } : {}),
        }}
      >
        {tabs.map(({ id, icon: Icon }) => {
          const isActive = activeTab === id;
          const label = t(tabLabelKeys[id] as any);
          const isProfile = id === 'profile';

          return (
            <motion.button
              key={id}
              onClick={() => handleTab(id)}
              whileTap={{ scale: 0.85 }}
              transition={{ duration: 0.1 }}
              className="relative flex flex-col items-center flex-none min-w-0 outline-none"
            >
              {/* Bouncy bubble indicator */}
              {isActive && (
                <motion.div
                  layoutId="nav-bubble"
                  className="absolute inset-x-2 top-0.5 bottom-0.5 rounded-xl"
                  style={{
                    //background: 'radial-gradient(ellipse at 50% 30%, #2b304d, #2b304d 70%)',
                  }}
                  transition={bubbleSpring}
                />
              )}

              {/* Icon / Avatar */}
              <div className="relative flex items-center justify-center w-[60px] h-[30px]">
                {isProfile ? (
                  <motion.div animate={{ scale: isActive ? 1.15 : 1 }} transition={iconSpring}>
                    <div className={`rounded-full transition-shadow duration-200 ${isActive ? 'ring-[1.5px] ring-accent ring-offset-1 ring-offset-transparent' : ''}`}>
                      <Avatar src={user?.avatar} name={user?.displayName || user?.username || '?'} size="xs" />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div animate={{ scale: isActive ? 1.18 : 1 }} transition={iconSpring} className="flex items-center justify-center">
                    {Icon && <Icon size={22} strokeWidth={isActive ? 2.2 : 1.6} style={{ color: isActive ? iconColorActive : iconColorInactive }} className="transition-colors duration-200" />}
                  </motion.div>
                )}

                {/* Unread badge — chats */}
                <AnimatePresence>
                  {id === 'chats' && totalUnreadChats > 0 && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      className={`absolute -top-0 right-3 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-accent text-white text-[12px] font-bold leading-none shadow-lg ${badgeBorderWidth} ${badgeBorder}`}
                    >
                      {totalUnreadChats > 99 ? '99+' : totalUnreadChats}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Friend requests badge — contacts */}
                <AnimatePresence>
                  {id === 'contacts' && friendRequestsCount > 0 && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      className={`absolute -top-0 right-3 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-accent text-white text-[12px] font-bold leading-none shadow-lg ${badgeBorderWidth} ${badgeBorder}`}
                    >
                      {friendRequestsCount > 99 ? '99+' : friendRequestsCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* Label */}
              <motion.span
                animate={{ scale: isActive ? 1.05 : 1 }}
                transition={{ duration: 0.2 }}
                className="text-[12px] leading-tight font-medium relative z-10"
                style={{ color: isActive ? labelColorActive : labelColorInactive }}
              >
                {label}
              </motion.span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}

const BottomNavigation = memo(BottomNavigationInner);
export default BottomNavigation;

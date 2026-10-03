import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SwipeAction = 'read' | 'archive' | 'mute';
export type ChatListStyle = 'two-line' | 'three-line';
export type AnimationMode = 'all' | 'reduced' | 'off';
export type DistanceUnit = 'auto' | 'metric' | 'imperial';
export type AppIcon = 'default' | 'classic' | 'ocean' | 'premium' | 'neon' | 'aurora';
export type ColorThemeId = 'midnight' | 'ocean' | 'forest' | 'sunset' | 'classic' | 'neon' | 'aurora' | 'cyber' | 'glass' | 'void';

export interface ColorTheme { id: ColorThemeId; name: string; nameEn: string; bg: string; surface: string; accent: string; text: string; textSecondary: string; bubbleMy: string; bubbleMyTo: string; bubbleOther: string; bubbleOtherTo: string; bubbleTextMy: string; bubbleTextOther: string; headerBg: string; inputBg: string; }

export const COLOR_THEMES: ColorTheme[] = [
  { id: 'midnight', name: 'Полночь', nameEn: 'Midnight', bg: '#18181f', surface: '#1e1e2a', accent: '#8b5cf6', text: '#ffffff', textSecondary: '#9ca3af', bubbleMy: '#6366f1', bubbleMyTo: '#818cf8', bubbleOther: '#27272f', bubbleOtherTo: '#3f3f46', bubbleTextMy: '#ffffff', bubbleTextOther: '#e5e5e5', headerBg: '#18181f', inputBg: '#27272f' },
  { id: 'ocean', name: 'Океан', nameEn: 'Ocean', bg: '#0f172a', surface: '#1e293b', accent: '#06b6d4', text: '#ffffff', textSecondary: '#94a3b8', bubbleMy: '#0891b2', bubbleMyTo: '#22d3ee', bubbleOther: '#1e293b', bubbleOtherTo: '#334155', bubbleTextMy: '#ffffff', bubbleTextOther: '#e2e8f0', headerBg: '#0f172a', inputBg: '#1e293b' },
  { id: 'forest', name: 'Лес', nameEn: 'Forest', bg: '#0f1a0f', surface: '#1a2f1a', accent: '#22c55e', text: '#ffffff', textSecondary: '#86efac', bubbleMy: '#16a34a', bubbleMyTo: '#4ade80', bubbleOther: '#1a2f1a', bubbleOtherTo: '#2d4a2d', bubbleTextMy: '#ffffff', bubbleTextOther: '#dcfce7', headerBg: '#0f1a0f', inputBg: '#1a2f1a' },
  { id: 'sunset', name: 'Закат', nameEn: 'Sunset', bg: '#1c0f0f', surface: '#2d1a1a', accent: '#f97316', text: '#ffffff', textSecondary: '#fdba74', bubbleMy: '#ea580c', bubbleMyTo: '#fb923c', bubbleOther: '#2d1a1a', bubbleOtherTo: '#4a2a2a', bubbleTextMy: '#ffffff', bubbleTextOther: '#fed7aa', headerBg: '#1c0f0f', inputBg: '#2d1a1a' },
  { id: 'classic', name: 'Классика', nameEn: 'Classic', bg: '#1a1a2e', surface: '#252540', accent: '#4f8cff', text: '#ffffff', textSecondary: '#a0a0c0', bubbleMy: '#4f8cff', bubbleMyTo: '#93c5fd', bubbleOther: '#252540', bubbleOtherTo: '#3d3d66', bubbleTextMy: '#ffffff', bubbleTextOther: '#d0d0e0', headerBg: '#1a1a2e', inputBg: '#252540' },
  { id: 'neon', name: 'Неон', nameEn: 'Neon', bg: '#0a0a0a', surface: '#1a1a1a', accent: '#f472b6', text: '#ffffff', textSecondary: '#c084fc', bubbleMy: '#ec4899', bubbleMyTo: '#f9a8d4', bubbleOther: '#1a1a1a', bubbleOtherTo: '#2e2e2e', bubbleTextMy: '#ffffff', bubbleTextOther: '#fce7f3', headerBg: '#0a0a0a', inputBg: '#1a1a1a' },
  { id: 'aurora', name: 'Аврора', nameEn: 'Aurora', bg: '#0c1929', surface: '#152238', accent: '#2dd4bf', text: '#ffffff', textSecondary: '#5eead4', bubbleMy: '#14b8a6', bubbleMyTo: '#5eead4', bubbleOther: '#152238', bubbleOtherTo: '#1e3a5f', bubbleTextMy: '#ffffff', bubbleTextOther: '#ccfbf1', headerBg: '#0c1929', inputBg: '#152238' },
  { id: 'cyber', name: 'Кибер', nameEn: 'Cyber', bg: '#0d0d1a', surface: '#1a1a30', accent: '#a855f7', text: '#ffffff', textSecondary: '#c4b5fd', bubbleMy: '#7c3aed', bubbleMyTo: '#a78bfa', bubbleOther: '#1a1a30', bubbleOtherTo: '#2d2d4a', bubbleTextMy: '#ffffff', bubbleTextOther: '#ede9fe', headerBg: '#0d0d1a', inputBg: '#1a1a30' },
  { id: 'glass', name: 'Стекло', nameEn: 'Glass', bg: '#111827', surface: '#1f2937', accent: '#38bdf8', text: '#ffffff', textSecondary: '#7dd3fc', bubbleMy: '#0284c7', bubbleMyTo: '#38bdf8', bubbleOther: '#1f2937', bubbleOtherTo: '#374151', bubbleTextMy: '#ffffff', bubbleTextOther: '#e0f2fe', headerBg: '#111827', inputBg: '#1f2937' },
  { id: 'void', name: 'Пустота', nameEn: 'Void', bg: '#09090b', surface: '#18181b', accent: '#71717a', text: '#ffffff', textSecondary: '#a1a1aa', bubbleMy: '#52525b', bubbleMyTo: '#737373', bubbleOther: '#18181b', bubbleOtherTo: '#27272a', bubbleTextMy: '#ffffff', bubbleTextOther: '#d4d4d8', headerBg: '#09090b', inputBg: '#18181b' },
];
export const APP_ICONS: { id: AppIcon; name: string; nameEn: string; isPremium?: boolean }[] = [
  { id: 'default', name: 'Основная', nameEn: 'Default' }, { id: 'classic', name: 'Классика', nameEn: 'Classic' },
  { id: 'ocean', name: 'Океан', nameEn: 'Ocean' }, { id: 'premium', name: 'Premium', nameEn: 'Premium', isPremium: true },
  { id: 'neon', name: 'Неон', nameEn: 'Neon', isPremium: true }, { id: 'aurora', name: 'Аврора', nameEn: 'Aurora', isPremium: true },
];

export interface StickerSettings { autoDownload: boolean; showEmoji: boolean; enableReactions: boolean; animateEmoji: boolean; animateStickers: boolean; }
export interface MediaSettings { swipeMedia: boolean; raiseToListen: boolean; raiseToSpeak: boolean; pauseMusicOnRecord: boolean; pauseMusicOnMedia: boolean; microphone: string; }
export interface ThemeCustomSettings { customBg: string; customSurface: string; customAccent: string; customBubbleMy: string; customBubbleMyTo: string; customBubbleOther: string; customBubbleOtherTo: string; customText: string; customTextSecondary: string; transparency: number; }

export interface ChatSettingsState {
  messageTextSize: number; setMessageTextSize: (size: number) => void;
  wallpaper: string | null; setWallpaper: (url: string | null) => void;
  usernameColor: string; setUsernameColor: (color: string) => void;
  colorThemeId: ColorThemeId; setColorThemeId: (id: ColorThemeId) => void;
  isDayTheme: boolean; setIsDayTheme: (v: boolean) => void;
  themeCustomSettings: ThemeCustomSettings; setThemeCustomSettings: (s: Partial<ThemeCustomSettings>) => void;
  messageCornerRadius: number; setMessageCornerRadius: (r: number) => void;
  mediaCornerRadius: number; setMediaCornerRadius: (r: number) => void;
  chatListStyle: ChatListStyle; setChatListStyle: (style: ChatListStyle) => void;
  appIcon: AppIcon; setAppIcon: (icon: AppIcon) => void;
  swipeAction: SwipeAction; setSwipeAction: (action: SwipeAction) => void;
  nightThemeEnabled: boolean; setNightThemeEnabled: (v: boolean) => void;
  nightThemeStart: string; setNightThemeStart: (t: string) => void; nightThemeEnd: string; setNightThemeEnd: (t: string) => void;
  inAppBrowser: boolean; setInAppBrowser: (v: boolean) => void;
  animationMode: AnimationMode; setAnimationMode: (mode: AnimationMode) => void;
  stickerSettings: StickerSettings; setStickerSettings: (s: Partial<StickerSettings>) => void;
  mediaSettings: MediaSettings; setMediaSettings: (s: Partial<MediaSettings>) => void;
  directShare: boolean; setDirectShare: (v: boolean) => void;
  showAdultContent: boolean; setShowAdultContent: (v: boolean) => void;
  sendByEnter: boolean; setSendByEnter: (v: boolean) => void;
  distanceUnit: DistanceUnit; setDistanceUnit: (unit: DistanceUnit) => void;
  resetSettings: () => void;
}

const DS: StickerSettings = { autoDownload: true, showEmoji: true, enableReactions: true, animateEmoji: true, animateStickers: true };
const DM: MediaSettings = { swipeMedia: true, raiseToListen: true, raiseToSpeak: false, pauseMusicOnRecord: true, pauseMusicOnMedia: false, microphone: 'builtin' };
const DTC: ThemeCustomSettings = { customBg: '#18181f', customSurface: '#1e1e2a', customAccent: '#8b5cf6', customBubbleMy: '#6366f1', customBubbleMyTo: '#818cf8', customBubbleOther: '#27272f', customBubbleOtherTo: '#3f3f46', customText: '#ffffff', customTextSecondary: '#9ca3af', transparency: 100 };

export const useChatSettingsStore = create<ChatSettingsState>()(persist((set) => ({
  messageTextSize: 16, wallpaper: null, usernameColor: '#8b5cf6', colorThemeId: 'midnight', isDayTheme: false,
  themeCustomSettings: DTC, messageCornerRadius: 17, mediaCornerRadius: 20, chatListStyle: 'two-line',
  appIcon: 'default', swipeAction: 'archive', nightThemeEnabled: false, nightThemeStart: '22:00', nightThemeEnd: '06:00',
  inAppBrowser: true, animationMode: 'all', stickerSettings: DS, mediaSettings: DM,
  directShare: false, showAdultContent: false, sendByEnter: true, distanceUnit: 'auto',

  setMessageTextSize: (s) => set({ messageTextSize: Math.max(10, Math.min(28, s)) }),
  setWallpaper: (u) => set({ wallpaper: u }),
  setUsernameColor: (c) => set({ usernameColor: c }),
  setColorThemeId: (id) => set({ colorThemeId: id }),
  setIsDayTheme: (v) => set({ isDayTheme: v }),
  setThemeCustomSettings: (s) => set((st) => ({ themeCustomSettings: { ...st.themeCustomSettings, ...s } })),
  setMessageCornerRadius: (r) => set({ messageCornerRadius: Math.max(0, Math.min(30, r)) }),
  setMediaCornerRadius: (r) => set({ mediaCornerRadius: Math.max(0, Math.min(40, r)) }),
  setChatListStyle: (s) => set({ chatListStyle: s }),
  setAppIcon: (i) => set({ appIcon: i }),
  setSwipeAction: (a) => set({ swipeAction: a }),
  setNightThemeEnabled: (v) => set({ nightThemeEnabled: v }),
  setNightThemeStart: (t) => set({ nightThemeStart: t }),
  setNightThemeEnd: (t) => set({ nightThemeEnd: t }),
  setInAppBrowser: (v) => set({ inAppBrowser: v }),
  setAnimationMode: (m) => set({ animationMode: m }),
  setStickerSettings: (s) => set((st) => ({ stickerSettings: { ...st.stickerSettings, ...s } })),
  setMediaSettings: (s) => set((st) => ({ mediaSettings: { ...st.mediaSettings, ...s } })),
  setDirectShare: (v) => set({ directShare: v }),
  setShowAdultContent: (v) => set({ showAdultContent: v }),
  setSendByEnter: (v) => set({ sendByEnter: v }),
  setDistanceUnit: (u) => set({ distanceUnit: u }),

  resetSettings: () => set({
    messageTextSize: 16, wallpaper: null, usernameColor: '#8b5cf6', colorThemeId: 'midnight', isDayTheme: false,
    themeCustomSettings: DTC, messageCornerRadius: 17, mediaCornerRadius: 20, chatListStyle: 'two-line',
    appIcon: 'default', swipeAction: 'archive', nightThemeEnabled: false, nightThemeStart: '22:00', nightThemeEnd: '06:00',
    inAppBrowser: true, animationMode: 'all', stickerSettings: DS, mediaSettings: DM,
    directShare: false, showAdultContent: false, sendByEnter: true, distanceUnit: 'auto',
  }),
}), { name: 'vortex-chat-settings' }));
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ChatTheme = 'midnight' | 'ocean' | 'forest' | 'sunset' | 'classic' | 'neon' | 'aurora' | 'cyber' | 'glass' | 'void';

interface ThemeState {
    chatTheme: ChatTheme;
    setChatTheme: (theme: ChatTheme) => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            chatTheme: 'midnight',
            setChatTheme: (theme) => set({ chatTheme: theme }),
        }),
        {
            name: 'vortex-theme-storage',
        }
    )
);

import { create } from 'zustand';

interface InstantViewState {
  url: string | null;
  isOpen: boolean;
  open: (url: string) => void;
  close: () => void;
}

export const useInstantViewStore = create<InstantViewState>((set) => ({
  url: null,
  isOpen: false,
  open: (url: string) => set({ url, isOpen: true }),
  close: () => set({ url: null, isOpen: false }),
}));
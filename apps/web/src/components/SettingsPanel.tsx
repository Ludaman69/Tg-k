import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ChevronLeft,
  Palette,
  Sparkles,
  Eye,
  Info,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import { useThemeStore, ChatTheme } from '../stores/themeStore';

type SettingsView = 'settings' | 'themes' | 'about';

interface SettingsPanelProps {
  onBack: () => void;
}

const themeCards: { id: ChatTheme; color: string; accent: string; name: string; nameEn: string; desc: string; descEn: string; animated?: boolean; gradient?: string }[] = [
  { id: 'midnight', color: '#0f0f13', accent: '#6366f1', name: 'Полночь', nameEn: 'Midnight', desc: 'Тёмная тема с мягкими акцентами', descEn: 'Dark theme with soft accents' },
  { id: 'ocean', color: '#0b172a', accent: '#3b82f6', name: 'Океан', nameEn: 'Ocean', desc: 'Глубокий синий с прохладными тонами', descEn: 'Deep blue with cool tones' },
  { id: 'forest', color: '#0f1c15', accent: '#10b981', name: 'Лес', nameEn: 'Forest', desc: 'Природный зелёный и спокойствие', descEn: 'Natural green and serenity' },
  { id: 'sunset', color: '#1f111a', accent: '#ec4899', gradient: 'linear-gradient(135deg, #1f111a, #150a0f)', name: 'Закат', nameEn: 'Sunset', desc: 'Тёплый розовый градиент заката', descEn: 'Warm pink sunset gradient' },
  { id: 'classic', color: '#121215', accent: '#a1a1aa', name: 'Классика', nameEn: 'Classic', desc: 'Минималистичная монохромная тема', descEn: 'Minimalist monochrome theme' },
  { id: 'neon', color: '#0b0f19', accent: '#8b5cf6', name: 'Неон', nameEn: 'Neon', desc: 'Фиолетовое свечение за курсором', descEn: 'Purple glow follows your cursor', animated: true },
  { id: 'aurora', color: '#022c22', accent: '#10b981', gradient: 'linear-gradient(135deg, #022c22, #064e3b)', name: 'Аврора', nameEn: 'Aurora', desc: 'Северное сияние реагирует на мышь', descEn: 'Northern lights react to mouse', animated: true },
  { id: 'cyber', color: '#000000', accent: '#f59e0b', name: 'Кибер', nameEn: 'Cyber', desc: 'Сетка и янтарное свечение мыши', descEn: 'Grid pattern with amber glow', animated: true },
  { id: 'glass', color: '#0d1117', accent: '#3b82f6', name: 'Стекло', nameEn: 'Glass', desc: 'Плавное свечение следует за мышью', descEn: 'Smooth glow follows the cursor', animated: true },
  { id: 'void', color: '#000000', accent: '#ffffff', name: 'Бездна', nameEn: 'Void', desc: 'Абсолютный мрак с точечным светом', descEn: 'Absolute darkness with spot light', animated: true },
];

export default function SettingsPanel({ onBack }: SettingsPanelProps) {
  const { user } = useAuthStore();
  const { chatTheme, setChatTheme } = useThemeStore();
  const { t, lang, setLang } = useLang();
  const [view, setView] = useState<SettingsView>('settings');
  const [themeIndex, setThemeIndex] = useState(() => {
    const idx = themeCards.findIndex(tc => tc.id === chatTheme);
    return idx >= 0 ? idx : 0;
  });

  const goThemes = () => {
    const idx = themeCards.findIndex(tc => tc.id === chatTheme);
    if (idx >= 0) setThemeIndex(idx);
    setView('themes');
  };

  if (view === 'themes') return renderThemes();
  if (view === 'about') return renderAbout();
  return renderSettings();

  // ======= SETTINGS =======
  function renderSettings() {
    return (
      <div className="flex flex-col h-full w-full bg-surface-secondary overflow-hidden safe-top">
        <motion.div key="settings" className="flex flex-col h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <div className="h-14 flex items-center gap-3 px-4 border-b border-border flex-shrink-0">
            <button onClick={onBack} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"><ArrowLeft size={20} /></button>
            <h3 className="text-sm font-semibold text-white flex-1">{t('settings')}</h3>
          </div>
          <div className="flex-1 overflow-y-auto pb-20">
            <div className="px-5 py-4">
              <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3">{t('theme')}</h4>
              <button onClick={goThemes} className="w-full group flex items-center gap-4 px-3 py-3 rounded-xl bg-surface-tertiary/50 hover:bg-surface-hover transition-colors">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: themeCards.find(tc => tc.id === chatTheme)?.accent || '#6366f1' }}>
                  <Palette size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm text-zinc-200">{t('theme')}</p>
                  <p className="text-xs text-zinc-500">{lang === 'ru' ? themeCards.find(tc => tc.id === chatTheme)?.name : themeCards.find(tc => tc.id === chatTheme)?.nameEn}</p>
                </div>
                <ChevronRight size={18} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
              </button>
            </div>
            <div className="px-5 py-3">
              <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3">{t('language')}</h4>
              <div className="space-y-1">
                <button onClick={() => setLang('ru')} className={`w-full flex items-center gap-4 px-3 py-3 rounded-xl transition-colors ${lang === 'ru' ? 'bg-vortex-500/15 ring-1 ring-vortex-500/30' : 'bg-surface-tertiary/50 hover:bg-surface-hover'}`}>
                  <span className="text-lg">🇷🇺</span>
                  <div className="flex-1 min-w-0 text-left"><p className="text-sm text-zinc-200">Русский</p></div>
                  {lang === 'ru' && <Check size={16} className="text-vortex-400" />}
                </button>
                <button onClick={() => setLang('en')} className={`w-full flex items-center gap-4 px-3 py-3 rounded-xl transition-colors ${lang === 'en' ? 'bg-vortex-500/15 ring-1 ring-vortex-500/30' : 'bg-surface-tertiary/50 hover:bg-surface-hover'}`}>
                  <span className="text-lg">🇬🇧</span>
                  <div className="flex-1 min-w-0 text-left"><p className="text-sm text-zinc-200">English</p></div>
                  {lang === 'en' && <Check size={16} className="text-vortex-400" />}
                </button>
              </div>
            </div>
            {/* Privacy */}
            <div className="px-5 py-3">
              <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3">{t('privacy')}</h4>
              <div className="space-y-1">
                <button
                  onClick={async () => {
                    const newVal = !user?.hideStoryViews;
                    try { await api.updateSettings({ hideStoryViews: newVal }); useAuthStore.getState().updateUser({ hideStoryViews: newVal }); } catch {}
                  }}
                  className="w-full flex items-center gap-4 px-3 py-3 rounded-xl bg-surface-tertiary/50 hover:bg-surface-hover transition-colors"
                >
                  <Eye size={18} className="text-zinc-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm text-zinc-200">{t('hideStoryViews')}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{t('hideStoryViewsDesc')}</p>
                  </div>
                  <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${user?.hideStoryViews ? 'bg-vortex-500' : 'bg-zinc-600'}`}>
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${user?.hideStoryViews ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            </div>
            <div className="px-5 py-3">
              <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-3">{t('about')}</h4>
              <div className="flex items-center gap-4 px-3 py-3 rounded-xl bg-surface-tertiary/50">
                <Info size={18} className="text-zinc-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200">Bkonekte</p>
                  <p className="text-xs text-zinc-500">{t('version')} {__APP_VERSION__}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ======= THEMES =======
  function renderThemes() {
    const currentCard = themeCards[themeIndex];
    const isActive = chatTheme === currentCard.id;
    return (
      <div className="flex flex-col h-full w-full bg-surface-secondary overflow-hidden safe-top">
        <motion.div key="themes" className="flex flex-col h-full" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="h-14 flex items-center gap-3 px-4 border-b border-border flex-shrink-0">
            <button onClick={() => setView('settings')} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"><ArrowLeft size={20} /></button>
            <h3 className="text-sm font-semibold text-white flex-1">{t('theme')}</h3>
            <span className="text-xs text-zinc-500 tabular-nums">{themeIndex + 1} / {themeCards.length}</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center px-5 py-4 gap-4 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div key={currentCard.id} initial={{ opacity: 0, scale: 0.92, x: 40 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.92, x: -40 }} transition={{ duration: 0.25, ease: 'easeOut' }}
                className="w-full rounded-2xl overflow-hidden border border-border/40 shadow-xl flex flex-col" style={{ minHeight: 200 }}>
                <div className={`relative w-full h-32 chat-theme-${currentCard.id}`} style={currentCard.gradient ? { background: currentCard.gradient } : { backgroundColor: currentCard.color }}>
                  <div className="absolute inset-0 p-4 flex flex-col justify-end gap-2">
                    <div className="self-start max-w-[65%] px-3 py-2 rounded-2xl rounded-bl-md bg-white/10 backdrop-blur-sm"><p className="text-[11px] text-white/70">Hey! How's it going? 👋</p></div>
                    <div className="self-end max-w-[65%] px-3 py-2 rounded-2xl rounded-br-md" style={{ backgroundColor: currentCard.accent + '40' }}><p className="text-[11px] text-white/80">Pretty great, thanks! ✨</p></div>
                  </div>
                  {currentCard.animated && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-sm">
                      <Sparkles size={10} className="text-yellow-400" />
                      <span className="text-[9px] text-white/60 font-medium">{lang === 'ru' ? 'Интерактив' : 'Interactive'}</span>
                    </div>
                  )}
                </div>
                <div className="p-4 bg-surface-secondary">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentCard.accent }} />
                    <h3 className="text-base font-bold text-white">{lang === 'ru' ? currentCard.name : currentCard.nameEn}</h3>
                  </div>
                  <p className="text-xs text-zinc-400 ml-6">{lang === 'ru' ? currentCard.desc : currentCard.descEn}</p>
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="flex items-center gap-3 w-full">
              <button onClick={() => setThemeIndex(i => (i - 1 + themeCards.length) % themeCards.length)} className="p-2.5 rounded-xl bg-surface-tertiary/60 text-zinc-400 hover:text-white hover:bg-surface-hover transition-colors"><ChevronLeft size={20} /></button>
              <button onClick={() => { setChatTheme(currentCard.id); }} className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${isActive ? 'bg-surface-tertiary text-zinc-400' : 'bg-accent text-white shadow-lg shadow-accent/25 hover:shadow-accent/40 active:scale-[0.98]'}`}>
                {isActive ? (lang === 'ru' ? '✓ Активна' : '✓ Active') : (lang === 'ru' ? 'Применить' : 'Apply')}
              </button>
              <button onClick={() => setThemeIndex(i => (i + 1) % themeCards.length)} className="p-2.5 rounded-xl bg-surface-tertiary/60 text-zinc-400 hover:text-white hover:bg-surface-hover transition-colors"><ChevronRight size={20} /></button>
            </div>
            <div className="flex items-center gap-1.5">
              {themeCards.map((tc, i) => (
                <button key={tc.id} onClick={() => setThemeIndex(i)}
                  className={`rounded-full transition-all duration-200 ${i === themeIndex ? 'w-6 h-2 bg-accent' : chatTheme === tc.id ? 'w-2 h-2 bg-accent/50' : 'w-2 h-2 bg-zinc-600 hover:bg-zinc-500'}`} />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ======= ABOUT =======
  function renderAbout() {
    return (
      <div className="flex flex-col h-full w-full bg-surface-secondary overflow-hidden safe-top">
        <motion.div key="about" className="flex flex-col h-full" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="h-14 flex items-center gap-3 px-4 border-b border-border flex-shrink-0">
            <button onClick={() => setView('settings')} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"><ArrowLeft size={20} /></button>
            <h3 className="text-sm font-semibold text-white flex-1">{t('aboutApp')}</h3>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <img src="/logo.png" alt="Vortex" className="w-20 h-20 rounded-2xl object-cover mb-4 ring-white/10" />
            <h2 className="text-xl font-bold gradient-text mb-1">Bkonekte</h2>
            <p className="text-sm text-zinc-400 mb-6">{t('version')} {__APP_VERSION__}</p>
            <div className="text-xs text-zinc-500 space-y-1">
              <p>{t('modernMessenger')}</p>
              <p>{t('onPrivacy')}</p>
              <p className="mt-4 text-zinc-600">© 2026 Bkonekte Team</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }
}


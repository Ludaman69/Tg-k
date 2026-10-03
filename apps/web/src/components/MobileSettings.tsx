import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  MoreVertical,
  Pencil,
  User,
  MessageSquare,
  Shield,
  Bell,
  Database,
  Folder,
  Monitor,
  Battery,
  Globe,
  Star,
  Sparkles,
  Coins,
  Wallet,
  Briefcase,
  Gift,
  HelpCircle,
  MessageCircleQuestion,
  Lightbulb,
  FileText,
  Info,
  ChevronRight,
  Lock,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLang } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import ChatSettings from './ChatSettings';
import AccountPage from './AccountPage';
import { getCacheInfo, clearAllCache, formatCacheSize, type CacheInfo } from '../lib/cacheManager';

interface MobileSettingsProps {
  onBack: () => void;
  onEditProfile?: () => void;
  initialView?: SettingsView;
}

export type SettingsView = 'main' | 'account' | 'chats' | 'privacy' | 'notifications' | 'data' | 'folders' | 'devices' | 'energy' | 'language' | 'premium' | 'stars' | 'gram' | 'wallet' | 'business' | 'gift' | 'ask' | 'faq' | 'features' | 'policy' | 'terms' | 'about';

interface SettingItem {
  id: SettingsView;
  label: string;
  labelEn: string;
  subtitle: string;
  subtitleEn: string;
  icon: typeof User;
  iconBg: string;
  iconColor: string;
  showChevron?: boolean;
}

interface ServiceItem {
  id: string;
  label: string;
  labelEn: string;
  subtitle: string;
  subtitleEn: string;
  icon: typeof Star;
  iconBg: string;
  iconColor: string;
  showChevron?: boolean;
}

interface HelpItem {
  id: string;
  label: string;
  labelEn: string;
  subtitle: string;
  subtitleEn: string;
  icon: typeof HelpCircle;
  iconBg: string;
  iconColor: string;
  showChevron?: boolean;
}

const mainSettings: SettingItem[] = [
  {
    id: 'account',
    label: 'Аккаунт',
    labelEn: 'Account',
    subtitle: 'Номер, имя пользователя, информация о себе',
    subtitleEn: 'Phone number, username, bio',
    icon: User,
    iconBg: '#3b82f61a',
    iconColor: '#3b82f6',
    showChevron: true,
  },
  {
    id: 'chats',
    label: 'Настройки чатов',
    labelEn: 'Chat Settings',
    subtitle: 'Оформление, темы, анимации',
    subtitleEn: 'Appearance, themes, animations',
    icon: MessageSquare,
    iconBg: '#8b5cf61a',
    iconColor: '#8b5cf6',
    showChevron: true,
  },
  {
    id: 'privacy',
    label: 'Конфиденциальность',
    labelEn: 'Privacy',
    subtitle: 'Время захода, устройства, безопасность',
    subtitleEn: 'Last seen, devices, security',
    icon: Shield,
    iconBg: '#10b9811a',
    iconColor: '#10b981',
    showChevron: false,
  },
  {
    id: 'notifications',
    label: 'Уведомления',
    labelEn: 'Notifications',
    subtitle: 'Звуки, звонки, счётчик сообщений',
    subtitleEn: 'Sounds, calls, badge counter',
    icon: Bell,
    iconBg: '#f59e0b1a',
    iconColor: '#f59e0b',
    showChevron: false,
  },
  {
    id: 'data',
    label: 'Данные и память',
    labelEn: 'Data & Storage',
    subtitle: 'Загрузка и хранение медиафайлов',
    subtitleEn: 'Media download and storage',
    icon: Database,
    iconBg: '#06b6d41a',
    iconColor: '#06b6d4',
    showChevron: true,
  },
  {
    id: 'folders',
    label: 'Папки с чатами',
    labelEn: 'Chat Folders',
    subtitle: 'Сортировка чатов по папкам',
    subtitleEn: 'Sort chats into folders',
    icon: Folder,
    iconBg: '#6366f11a',
    iconColor: '#6366f1',
    showChevron: false,
  },
  {
    id: 'devices',
    label: 'Устройства',
    labelEn: 'Devices',
    subtitle: 'Управление активными сеансами',
    subtitleEn: 'Manage active sessions',
    icon: Monitor,
    iconBg: '#ec48991a',
    iconColor: '#ec4899',
    showChevron: false,
  },
  {
    id: 'energy',
    label: 'Энергосбережение',
    labelEn: 'Power Saving',
    subtitle: 'Экономия энергии при низком заряде',
    subtitleEn: 'Save energy on low battery',
    icon: Battery,
    iconBg: '#22c55e1a',
    iconColor: '#22c55e',
    showChevron: false,
  },
  {
    id: 'language',
    label: 'Язык',
    labelEn: 'Language',
    subtitle: 'Русский',
    subtitleEn: 'English',
    icon: Globe,
    iconBg: '#a855f71a',
    iconColor: '#a855f7',
    showChevron: true,
  },
];

const additionalServices: ServiceItem[] = [
  { id: 'premium', label: 'Premium', labelEn: 'Premium', subtitle: 'Эксклюзивные функции и возможности', subtitleEn: 'Exclusive features and perks', icon: Star, iconBg: '#fbbf241a', iconColor: '#fbbf24', showChevron: false },
  //{ id: 'stars', label: 'Звёзды', labelEn: 'Stars', subtitle: '', subtitleEn: '', icon: Sparkles, iconBg: '#c084fc1a', iconColor: '#c084fc', showChevron: true },
  //{ id: 'gram', label: 'Мои GRAM', labelEn: 'My GRAM', subtitle: '', subtitleEn: '', icon: Coins, iconBg: '#2dd4bf1a', iconColor: '#2dd4bf', showChevron: true },
  //{ id: 'wallet', label: 'Кошелёк', labelEn: 'Wallet', subtitle: '', subtitleEn: '', icon: Wallet, iconBg: '#34d3991a', iconColor: '#34d399', showChevron: true },
  //{ id: 'business', label: 'Для бизнеса', labelEn: 'For Business', subtitle: 'Инструменты для вашего бизнеса', subtitleEn: 'Tools for your business', icon: Briefcase, iconBg: '#818cf81a', iconColor: '#818cf8', showChevron: false },
  { id: 'gift', label: 'Отправить подарок', labelEn: 'Send a Gift', subtitle: 'Порадуйте близких подарком', subtitleEn: 'Delight your loved ones with a gift', icon: Gift, iconBg: '#f472b61a', iconColor: '#f472b6', showChevron: false },
];

const helpItems: HelpItem[] = [
  //{ id: 'ask', label: 'Задать вопрос', labelEn: 'Ask a Question', subtitle: '', subtitleEn: '', icon: HelpCircle, iconBg: '#3b82f61a', iconColor: '#3b82f6', showChevron: true },
  //{ id: 'faq', label: 'Вопросы о приложении', labelEn: 'App FAQ', subtitle: '', subtitleEn: '', icon: MessageCircleQuestion, iconBg: '#8b5cf61a', iconColor: '#8b5cf6', showChevron: true },
  //{ id: 'features', label: 'Возможности приложения', labelEn: 'App Features', subtitle: '', subtitleEn: '', icon: Lightbulb, iconBg: '#f59e0b1a', iconColor: '#f59e0b', showChevron: true },
  { id: 'policy', label: 'Политика конфиденциальности', labelEn: 'Privacy Policy', subtitle: 'Как мы обрабатываем ваши данные', subtitleEn: 'How we handle your data', icon: Shield, iconBg: '#10b9811a', iconColor: '#10b981', showChevron: false },
  { id: 'terms', label: 'Условия использования', labelEn: 'Terms of Use', subtitle: 'Правила пользования сервисом', subtitleEn: 'Rules for using the service', icon: FileText, iconBg: '#6366f11a', iconColor: '#6366f1', showChevron: false },
  { id: 'about', label: 'О приложении', labelEn: 'About', subtitle: 'Версия и информация о приложении', subtitleEn: 'Version and app information', icon: Info, iconBg: '#ec48991a', iconColor: '#ec4899', showChevron: false },
];

const availableLanguages = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
];

export default function MobileSettings({ onBack, onEditProfile, initialView = 'main' }: MobileSettingsProps) {
  const { user } = useAuthStore();
  const { t, lang, setLang } = useLang();
  const [view, setView] = useState<SettingsView>(initialView);

  const handleSettingPress = (id: SettingsView) => {
    const item = mainSettings.find(s => s.id === id);
    if (item && item.showChevron === false) return;
    setView(id);
  };

  const goBack = () => {
    if (view === 'main') {
      onBack();
    } else {
      setView('main');
    }
  };

  // Render sub-screens
  if (view !== 'main') {
    // Chat Settings has its own full screen
    if (view === 'chats') {
      return <ChatSettings onBack={() => setView('main')} />;
    }

    if (view === 'account') {
      return <AccountPage onBack={() => setView('main')} />;
    }

    const item = mainSettings.find(s => s.id === view);
    return (
      <div
        className="flex flex-col h-full w-full overflow-hidden safe-top"
        style={{ backgroundColor: '#18181f' }}
      >
        <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0 border-white/[0.06]">
          <button
            onClick={goBack}
            className="p-1.5 -ml-1 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <ArrowLeft size={22} />
          </button>
          <h2 className="text-lg font-semibold text-white flex-1">
            {lang === 'ru' ? item?.label : item?.labelEn}
          </h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          {item && (
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: item.iconBg }}
            >
              <item.icon size={28} style={{ color: item.iconColor }} />
            </div>
          )}
          <h3 className="text-xl font-bold text-white mb-2">
            {lang === 'ru' ? item?.label : item?.labelEn}
          </h3>
          <p className="text-sm text-white/40 max-w-[260px]">
            {lang === 'ru' ? item?.subtitle : item?.subtitleEn}
          </p>
          {view === 'language' && (
            <div className="mt-6 w-full max-w-[280px] space-y-2">
              {availableLanguages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code as 'ru' | 'en')}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] transition-colors border border-white/[0.06]"
                >
                  <span className="text-white text-sm font-medium">{l.label}</span>
                  {lang === l.code && (
                    <Check size={18} className="text-violet-400" />
                  )}
                </button>
              ))}
            </div>
          )}
          {view === 'data' && <CacheInfoView />}
        </div>
      </div>
    );
  }

  // ======= MAIN SETTINGS VIEW =======
  const displayName = user?.displayName || user?.username || 'Пользователь';
  const username = user?.username || 'username';

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden safe-top"
      style={{ backgroundColor: '#18181f' }}
    >
      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between px-5 h-14 flex-shrink-0">
        <h1 className="text-[22px] font-bold text-white tracking-tight">
          {t('settings')}
        </h1>
        <div className="flex items-center gap-1">
          <button className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors">
            <Search size={20} strokeWidth={1.8} />
          </button>
          <button className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors">
            <MoreVertical size={20} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* ===== SCROLLABLE CONTENT ===== */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-4">
        {/* ===== PROFILE CARD ===== */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="px-4 mb-3"
        >
          <div
            className="flex items-center gap-4 p-4 rounded-[24px]"
            style={{ backgroundColor: '#1e1e2a' }}
          >
            {user?.avatar ? (
              <img
                src={mediaUrl(user.avatar)}
                alt={displayName}
                className="w-[72px] h-[72px] rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-violet-500/60 to-indigo-600/60 flex items-center justify-center text-white text-2xl font-semibold shrink-0">
                {displayName
                  .split(' ')
                  .map((w: string) => w[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-[19px] font-semibold text-white leading-tight truncate">
                {displayName}
              </h2>
              <p className="text-[14px] text-white/40 mt-0.5">
                @{username}
              </p>
            </div>
            <button
              onClick={onEditProfile}
              className="shrink-0 w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center transition-colors"
            >
              <Pencil size={16} className="text-white/60" />
            </button>
          </div>
        </motion.div>

        {/* ===== SECTION: ОСНОВНЫЕ НАСТРОЙКИ ===== */}
        <SectionHeader title={lang === 'ru' ? 'ОСНОВНЫЕ НАСТРОЙКИ' : 'MAIN SETTINGS'} delay={0.15} />
        <SettingsGroup delay={0.18}>
          {mainSettings.map((item) => (
            <SettingsRow
              key={item.id}
              icon={item.icon}
              iconBg={item.iconBg}
              iconColor={item.iconColor}
              label={lang === 'ru' ? item.label : item.labelEn}
              subtitle={
                item.id === 'language'
                  ? (lang === 'ru' ? 'Русский' : 'English')
                  : (lang === 'ru' ? item.subtitle : item.subtitleEn)
              }
              showChevron={item.showChevron !== false}
              onClick={() => handleSettingPress(item.id)}
              isLast={item.id === 'language'}
            />
          ))}
        </SettingsGroup>

        {/* ===== SECTION: ДОПОЛНИТЕЛЬНЫЕ СЕРВИСЫ ===== */}
        <SectionHeader title={lang === 'ru' ? 'ДОПОЛНИТЕЛЬНЫЕ СЕРВИСЫ' : 'ADDITIONAL SERVICES'} delay={0.21} />
        <SettingsGroup delay={0.24}>
          {additionalServices.map((item, idx) => (
            <SettingsRow
              key={item.id}
              icon={item.icon}
              iconBg={item.iconBg}
              iconColor={item.iconColor}
              label={lang === 'ru' ? item.label : item.labelEn}
              subtitle={lang === 'ru' ? item.subtitle : item.subtitleEn}
              showChevron={item.showChevron !== false}
              onClick={item.showChevron === false ? (() => {}) : () => setView(item.id as SettingsView)}
              isLast={idx === additionalServices.length - 1}
            />
          ))}
        </SettingsGroup>

        {/* ===== SECTION: ПОМОЩЬ ===== */}
        <SectionHeader title={lang === 'ru' ? 'ПОМОЩЬ' : 'HELP'} delay={0.27} />
        <SettingsGroup delay={0.30}>
          {helpItems.map((item, idx) => (
            <SettingsRow
              key={item.id}
              icon={item.icon}
              iconBg={item.iconBg}
              iconColor={item.iconColor}
              label={lang === 'ru' ? item.label : item.labelEn}
              subtitle={lang === 'ru' ? item.subtitle : item.subtitleEn}
              showChevron={item.showChevron !== false}
              onClick={item.showChevron === false ? (() => {}) : () => setView(item.id as SettingsView)}
              isLast={idx === helpItems.length - 1}
            />
          ))}
        </SettingsGroup>

        {/* Bottom spacer for navigation */}
        <div className="h-24" />
      </div>
    </div>
  );
}
/* ── Reusable sub-components ── */

function SectionHeader({ title, delay }: { title: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className="px-5 mb-2 mt-1"
    >
      <span className="text-[12px] font-semibold tracking-wider text-white/25 uppercase">
        {title}
      </span>
    </motion.div>
  );
}

function SettingsGroup({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className="mx-4 mb-5 rounded-[20px] overflow-hidden"
      style={{ backgroundColor: '#1e1e2a' }}
    >
      {children}
    </motion.div>
  );
}

function SettingsRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  subtitle,
  showChevron,
  onClick,
  isLast,
}: {
  icon: typeof User;
  iconBg: string;
  iconColor: string;
  label: string;
  subtitle: string;
  showChevron: boolean;
  onClick: () => void;
  isLast: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3.5 px-3 py-2 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
    >
      <div
        className="w-[42px] h-[42px] rounded-[14px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        <Icon size={20} strokeWidth={1.6} style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-medium text-white leading-tight">{label}</p>
        <p className="text-[13px] text-white/30 mt-0.5 leading-tight truncate">{subtitle}</p>
      </div>
      {showChevron ? (
        <ChevronRight size={18} className="text-white/20 shrink-0" strokeWidth={1.8} />
      ) : (
        <Lock size={18} className="text-white/20 shrink-0" strokeWidth={1.8} />
      )}
    </button>
  );
}

function SimpleRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  showChevron = true,
  onClick,
  isLast,
}: {
  icon: typeof Star;
  iconBg: string;
  iconColor: string;
  label: string;
  showChevron?: boolean;
  onClick?: () => void;
  isLast: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left"
    >
      <div
        className="w-[42px] h-[42px] rounded-[14px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        <Icon size={20} strokeWidth={1.6} style={{ color: iconColor }} />
      </div>
      <span className="text-[16px] font-medium text-white flex-1">{label}</span>
      {showChevron ? (
        <ChevronRight size={18} className="text-white/20 shrink-0" strokeWidth={1.8} />
      ) : (
        <Lock size={18} className="text-white/20 shrink-0" strokeWidth={1.8} />
      )}
    </button>
  );
}

/** Компонент информации и управления кешем */
function CacheInfoView() {
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    getCacheInfo().then(setCacheInfo).catch(() => {});
  }, []);

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearAllCache();
      const info = await getCacheInfo();
      setCacheInfo(info);
    } catch { /* игнорируем */ }
    setClearing(false);
  };

  return (
    <div className="mt-6 w-full max-w-[300px] space-y-4">
      {/* Информация о кеше */}
      {cacheInfo && (
        <div className="space-y-2 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-white/60">Медиа-кеш:</span>
            <span className="text-white font-medium">{formatCacheSize(cacheInfo.mediaSizeMB)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/60">API-кеш:</span>
            <span className="text-white font-medium">{cacheInfo.apiCacheCount} записей</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/60">Офлайн-очередь:</span>
            <span className="text-white font-medium">{cacheInfo.offlineQueueCount} сообщ.</span>
          </div>
        </div>
      )}

      {/* Кнопка очистки */}
      <button
        onClick={handleClear}
        disabled={clearing}
        className="w-full px-4 py-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 transition-colors border border-red-500/30 text-red-400 text-sm font-medium"
      >
        {clearing ? 'Очистка...' : 'Очистить кеш'}
      </button>

      <p className="text-xs text-white/30 text-center">
        При очистке кеша все загруженные фото, видео и данные чатов будут удалены. Сами сообщения не затрагиваются.
      </p>
    </div>
  );
}
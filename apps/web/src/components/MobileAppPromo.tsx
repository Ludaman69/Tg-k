import { useState, useEffect } from 'react';
import { usePWAInstall } from '../lib/usePWAInstall';
import { Smartphone, Monitor, Download, ArrowRight, Globe, Apple } from 'lucide-react';
import { api } from '../lib/api';
import { API_ORIGIN } from '../lib/env';
import StrokeText from './StrokeText';
import GradientWaves from './GradientWaves';

interface MobileAppPromoProps {
  onContinueInWeb: () => void;
}

/** Определяет, открыт ли сайт на iPhone/iPad */
function isIOSDevice(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ маскируется под macOS
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function MobileAppPromo({ onContinueInWeb }: MobileAppPromoProps) {
  const { canInstall, install } = usePWAInstall();
  const [installing, setInstalling] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  const [apkVersion, setApkVersion] = useState<string | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const isIOS = isIOSDevice();

  // Подтягиваем ссылку на актуальный APK (раздаётся напрямую с сервера)
  useEffect(() => {
    let cancelled = false;

    api
      .getAppVersion()
      .then((data) => {
        if (cancelled || !data.android) return;
        const url = data.android.url.startsWith('http')
          ? data.android.url
          : `${API_ORIGIN}${data.android.url.startsWith('/') ? '' : '/'}${data.android.url}`;
        setApkUrl(url);
        setApkVersion(data.android.versionName);
      })
      .catch(() => {
        // Endpoint ещё не задеплоен — кнопка Android останется неактивной
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleInstallPWA = async () => {
    if (canInstall) {
      setInstalling(true);
      try {
        await install();
      } catch {
        // user cancelled installation dialog
      }
      setInstalling(false);
    } else {
      // В iOS Safari и других браузерах без beforeinstallprompt
      // показываем инструкцию «Поделиться → На экран Домой»
      setShowIOSHint(true);
    }
  };

  const handleAndroid = () => {
    if (!apkUrl) return;
    // Прямое скачивание APK с сервера
    window.location.href = apkUrl;
  };

  const handleiOS = () => {
    // Нативного приложения для iOS нет — предлагаем установить PWA
    setShowIOSHint(true);
  };

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      {/* Background waves layer */}
      <div className="absolute inset-0 z-0">
        <GradientWaves
          horizonColor="#2d1b69"
          waveColor="#7c3aed"
          crestColor="#a78bfa"
          speed={0.9}
          amplitude={2.5}
          waveScale={0.5}
          waveRatio={0.7}
          swell={25}
          turbulence={15}
          tilt={1.0}
          zoom={1.0}
          height={4.0}
          fogDepth={12}
          detail="low"
          brightness={1.0}
          opacity={1.0}
          grain={false}
          mouseInteraction={false}
        />
      </div>

      {/* Top content: logo + text, centered */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center">
          <img
            src="/logo.png"
            alt="BKONEKTE"
            className="w-24 h-24 rounded-2xl shadow-lg shadow-vortex-500/30 object-cover"
          />
          <StrokeText
            text="Bkonekte"
            strokeColor="#ffffff"
            fillColor="#ffffff"
            strokeWidth={1.4}
            drawDuration={3}
            fillDelay={0}
            stagger={0.05}
            ease="sine.inOut"
            trigger="mount"
            fillMode="fade"
            fontSize={58}
            fontWeight={900}
            letterSpacing={0}
            reverse={false}
          />
        </div>

        <h2 className="text-lg font-semibold text-white mt-8 mb-2">Установите приложение</h2>
        <p className="text-zinc-400 text-sm text-center">
          Выберите удобный способ для лучшего опыта
        </p>
      </div>

      {/* Bottom container: only buttons, rounded top corners */}
      <div className="relative z-10 bg-[#131313] rounded-t-3xl border-t border-border/50 safe-bottom overflow-y-auto backdrop-blur-sm">
        <div className="px-6 pt-6 pb-8 space-y-4">
          {/* Android — прямое скачивание APK с сервера */}
          {!isIOS && (
            <button
              onClick={handleAndroid}
              disabled={!apkUrl}
              className="w-full py-5 px-4 rounded-xl bg-white/10 text-white font-medium flex items-center gap-3 transition-all hover:bg-white/15 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
            >
              <Smartphone size={22} className="text-green-500 shrink-0" />
              <span className="flex-1 text-left">
                Скачать для Android
                {apkVersion && <span className="text-zinc-500 text-sm ml-1.5">{apkVersion}</span>}
              </span>
              <Download size={18} className="text-zinc-500 shrink-0" />
            </button>
          )}

          {/* iOS — нативного приложения нет, ведём на установку PWA */}
          {isIOS && (
            <button
              onClick={handleiOS}
              className="w-full py-5 px-4 rounded-xl bg-white/10 text-white font-medium flex items-center gap-3 transition-all hover:bg-white/15 active:scale-[0.98]"
            >
              <Apple size={22} className="text-zinc-300 shrink-0" />
              <span className="flex-1 text-left">Установить на iPhone</span>
              <ArrowRight size={18} className="text-zinc-500 shrink-0" />
            </button>
          )}

          {/* PWA */}
          <button
            onClick={handleInstallPWA}
            disabled={installing}
            className="w-full py-5 px-4 rounded-xl bg-vortex-500/20 border border-vortex-500/30 text-white font-medium flex items-center gap-3 transition-all hover:bg-vortex-500/30 active:scale-[0.98] disabled:opacity-50"
          >
            <Monitor size={22} className="text-vortex-400 shrink-0" />
            <span className="flex-1 text-left">
              {installing ? 'Установка...' : 'Установить PWA'}
            </span>
            <Globe size={18} className="text-vortex-400 shrink-0" />
          </button>

          {/* Подсказка про установку APK из неизвестных источников */}
          {!isIOS && apkUrl && (
            <p className="text-zinc-500 text-xs leading-relaxed px-1">
              При установке APK Android попросит разрешить установку из этого
              источника — это нормально для приложений вне Google Play.
            </p>
          )}

          {/* Инструкция для iOS: добавление на экран «Домой» */}
          {showIOSHint && (
            <div className="rounded-xl bg-white/[0.06] border border-white/10 p-4 space-y-2">
              <p className="text-white text-sm font-medium">Установка на главный экран</p>
              <ol className="text-zinc-400 text-xs space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>Откройте меню «Поделиться» в браузере</li>
                <li>Выберите «На экран “Домой”»</li>
                <li>Нажмите «Добавить»</li>
              </ol>
              <button
                onClick={() => setShowIOSHint(false)}
                className="text-vortex-400 text-xs font-medium pt-1"
              >
                Понятно
              </button>
            </div>
          )}

          {/* Separator */}
          <div className="flex items-center gap-3 py-2 w-full">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-zinc-500 text-sm">или</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Continue in Web */}
          <button
            onClick={onContinueInWeb}
            className="w-full py-5 px-4 rounded-xl bg-vortex-500 text-white font-medium shadow-lg shadow-vortex-500/25 hover:shadow-vortex-500/40 transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            Продолжить в Web
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
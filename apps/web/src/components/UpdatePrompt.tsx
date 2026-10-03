import { motion, AnimatePresence } from 'framer-motion';
import { Download, Loader2 } from 'lucide-react';
import { useAppUpdate } from '../lib/useAppUpdate';
import { useLang } from '../lib/i18n';
import { IS_NATIVE } from '../lib/env';

const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

export default function UpdatePrompt() {
  const {
    updateAvailable,
    dismissed,
    applyUpdate,
    dismissUpdate,
    nativeUpdate,
    downloading,
    downloadProgress,
    error,
  } = useAppUpdate();
  const { t } = useLang();

  if (!updateAvailable) return null;

  // В native показываем версию из данных сервера, в web — версию бандла
  const shownVersion = IS_NATIVE && nativeUpdate ? nativeUpdate.versionName : appVersion;
  const isMandatory = IS_NATIVE && nativeUpdate?.mandatory === true;

  return (
    <>
      {/* ─── Bottom Sheet (полноразмерный prompt) ─── */}
      <AnimatePresence>
        {!dismissed && (
          <>
            {/* Overlay */}
            <motion.div
              key="update-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-[9990]"
              onClick={isMandatory || downloading ? undefined : dismissUpdate}
            />

            {/* Sheet */}
            <motion.div
              key="update-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[9991] bg-surface-secondary rounded-t-3xl border-t border-border/50 shadow-[0_-10px_60px_rgba(0,0,0,0.5)] safe-bottom"
            >
              {/* Drag indicator */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-zinc-600" />
              </div>

              <div className="flex flex-col items-center px-6 pt-4 pb-8">
                {/* Logo */}
                <div className="w-20 h-20 rounded-2xl overflow-hidden mb-5 ring-1 ring-white/10 shadow-xl">
                  <img src="/logo.png" alt="Bkonekte" className="w-full h-full object-cover" />
                </div>

                {/* Title */}
                <h2 className="text-xl font-bold text-white mb-1">
                  {t('updateAvailable')}
                </h2>

                {/* Version */}
                <p className="text-sm text-zinc-400 mb-4">
                  {t('version')} {shownVersion}
                </p>

                {/* Description / changelog */}
                {nativeUpdate?.changelog?.length ? (
                  <ul className="text-sm text-zinc-400 mb-8 max-w-[300px] space-y-1.5 self-start px-2">
                    {nativeUpdate.changelog.map((line, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-accent shrink-0">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-zinc-400 text-center mb-8 max-w-[300px] leading-relaxed">
                    {t('updateDescription')}
                  </p>
                )}

                {/* Error */}
                {error && (
                  <p className="text-sm text-red-400 text-center mb-4 max-w-[300px]">{error}</p>
                )}

                {/* Primary button */}
                <button
                  onClick={applyUpdate}
                  disabled={downloading}
                  className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 active:scale-[0.98]"
                >
                  {downloading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {downloadProgress > 0 ? `${downloadProgress}%` : '...'}
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      {t('updateNow')}
                    </>
                  )}
                </button>

                {/* Download progress bar */}
                {downloading && (
                  <div className="w-full h-1 mt-3 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-accent transition-[width] duration-200"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                )}

                {/* Secondary button */}
                {!isMandatory && !downloading && (
                  <button
                    onClick={dismissUpdate}
                    className="mt-3 py-2.5 text-accent hover:text-accent-hover text-sm font-medium transition-colors"
                  >
                    {t('remindLater')}
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      </>
  );
}
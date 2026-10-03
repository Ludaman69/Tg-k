/**
 * OfflineBanner — плашка «Нет соединения», показываемая при отсутствии сети.
 *
 * Отслеживает:
 *   - navigator.onLine (браузерное API)
 *   - Состояние сокета (disconnect / reconnect)
 *   - Количество сообщений в офлайн-очереди
 *
 * Используется в ChatPage.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Loader2 } from 'lucide-react';
import { getSocket } from '../lib/socket';
import { getOfflineQueueCount } from '../lib/offlineQueue';

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const updateQueueCount = useCallback(async () => {
    try {
      const count = await getOfflineQueueCount();
      setQueueCount(count);
    } catch { /* игнорируем */ }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setIsSyncing(true);
      // Даём время на синхронизацию
      setTimeout(() => setIsSyncing(false), 3000);
      updateQueueCount();
    };
    const handleOffline = () => {
      setIsOffline(true);
      setIsSyncing(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Отслеживаем состояние сокета
    const socket = getSocket();
    if (socket) {
      socket.on('connect', () => {
        setIsOffline(false);
        setIsSyncing(true);
        setTimeout(() => setIsSyncing(false), 3000);
        updateQueueCount();
      });
      socket.on('disconnect', () => {
        setIsOffline(true);
        setIsSyncing(false);
      });

      // Если сокет уже отключен при монтировании
      if (!socket.connected) {
        setIsOffline(true);
      }
    }

    // Периодически обновляем счётчик очереди
    updateQueueCount();
    const interval = setInterval(updateQueueCount, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [updateQueueCount]);

  return (
    <AnimatePresence>
      {(isOffline || isSyncing || queueCount > 0) && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          className="fixed left-0 right-0 z-[9998] flex justify-center pointer-events-none"
          style={{ top: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
        >
          <div
            className={`pointer-events-auto px-4 py-2 rounded-2xl shadow-lg backdrop-blur-xl border text-sm font-medium flex items-center gap-2 ${
              isSyncing
                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                : isOffline
                  ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                  : 'bg-violet-500/20 border-violet-500/30 text-violet-300'
            }`}
          >
            {isSyncing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Синхронизация...</span>
              </>
            ) : isOffline ? (
              <>
                <WifiOff size={14} />
                <span>
                  Нет соединения
                  {queueCount > 0 && ` · ${queueCount} в очереди`}
                </span>
              </>
            ) : queueCount > 0 ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Отправка сообщений ({queueCount})...</span>
              </>
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, AlertTriangle, Globe } from 'lucide-react';
import { useInstantViewStore } from '../stores/instantViewStore';
import { api } from '../lib/api';
import { openUrl } from '../lib/native';
import type { InstantViewData } from '../lib/types';

export default function InstantView() {
  const { url, isOpen, close } = useInstantViewStore();
  const [data, setData] = useState<InstantViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url || !isOpen) { setData(null); setError(false); return; }
    let cancelled = false;
    async function load() {
      setLoading(true); setError(false);
      try {
        const result = await api.getInstantView(url!);
        if (!cancelled) {
          if (result.content) setData(result); else setError(true);
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [url, isOpen]);

  const handleOpenInBrowser = useCallback(() => {
    if (url) { close(); void openUrl(url); }
  }, [url, close]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) close();
  }, [close]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }
  }, [isOpen]);

  let domain = '';
  try { if (url) domain = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col bg-surface overflow-hidden"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface/95 backdrop-blur-sm flex-shrink-0">
            <button onClick={close} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-tertiary transition-colors flex-shrink-0" aria-label="Закрыть">
              <X size={20} className="text-zinc-400" />
            </button>
            <div className="flex-1 min-w-0">
              {loading ? (
                <div className="h-4 bg-surface-tertiary rounded w-40 animate-pulse" />
              ) : (
                <p className="text-sm text-zinc-400 truncate">{data?.siteName || domain || 'Instant View'}</p>
              )}
            </div>
            <button onClick={handleOpenInBrowser} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-vortex-400 hover:bg-vortex-500/10 transition-colors flex-shrink-0">
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Открыть в браузере</span>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overscroll-contain" onClick={handleBackdropClick}>
            {loading ? (
              <Skeleton />
            ) : error ? (
              <ErrorState onOpenInBrowser={handleOpenInBrowser} />
            ) : data?.content ? (
              <ArticleContent data={data} domain={domain} />
            ) : (
              <EmptyState onOpenInBrowser={handleOpenInBrowser} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
function Skeleton() {
  return (
    <div className="max-w-2xl mx-auto px-5 py-8 animate-pulse">
      <div className="h-8 bg-surface-tertiary rounded w-3/4 mb-4" />
      <div className="h-4 bg-surface-tertiary rounded w-full mb-2" />
      <div className="h-4 bg-surface-tertiary rounded w-5/6 mb-2" />
      <div className="h-4 bg-surface-tertiary rounded w-4/6 mb-6" />
      <div className="h-48 bg-surface-tertiary rounded-xl mb-6" />
      <div className="h-4 bg-surface-tertiary rounded w-full mb-2" />
      <div className="h-4 bg-surface-tertiary rounded w-full mb-2" />
      <div className="h-4 bg-surface-tertiary rounded w-3/4 mb-2" />
    </div>
  );
}

function ErrorState({ onOpenInBrowser }: { onOpenInBrowser: () => void }) {
  return (
    <div className="max-w-md mx-auto px-5 py-20 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center">
        <AlertTriangle size={28} className="text-amber-400" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-200 mb-2">Не удалось загрузить статью</h2>
      <p className="text-sm text-zinc-400 mb-6">Сервер не смог извлечь содержимое этой страницы.</p>
      <button onClick={onOpenInBrowser} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-vortex-500 hover:bg-vortex-600 text-white font-medium transition-colors">
        <ExternalLink size={16} /> Открыть в браузере
      </button>
    </div>
  );
}

function ArticleContent({ data, domain }: { data: InstantViewData; domain: string }) {
  return (
    <div className="max-w-2xl mx-auto px-5 py-6">
      {data.image && (
        <div className="mb-6 -mx-5">
          <img src={data.image} alt="" className="w-full max-h-64 object-cover" referrerPolicy="no-referrer"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
      {data.title && (
        <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 leading-tight mb-4">{data.title}</h1>
      )}
      <div className="flex items-center gap-2 mb-6">
        <Globe size={14} className="text-zinc-500 flex-shrink-0" />
        <span className="text-sm text-zinc-500 truncate">{domain}</span>
      </div>
      <div
        className="instant-view-content text-[15px] leading-relaxed text-zinc-300"
        dangerouslySetInnerHTML={{ __html: data.content! }}
      />
    </div>
  );
}

function EmptyState({ onOpenInBrowser }: { onOpenInBrowser: () => void }) {
  return (
    <div className="max-w-md mx-auto px-5 py-20 text-center">
      <button onClick={onOpenInBrowser} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-vortex-500 hover:bg-vortex-600 text-white font-medium transition-colors">
        <ExternalLink size={16} /> Открыть в браузере
      </button>
    </div>
  );
}
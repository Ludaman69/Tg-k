import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useLang } from '../lib/i18n';
import Avatar from './Avatar';

interface ForwardModalProps {
    onClose: () => void;
    onForward: (chatId: string) => void;
}

export default function ForwardModal({ onClose, onForward }: ForwardModalProps) {
    const chats = useChatStore(s => s.chats);
    const user = useAuthStore(s => s.user);
    const t = useLang(s => s.t);
    const [search, setSearch] = useState('');

    const filteredChats = chats.filter((chat) => {
        const otherMember = chat.members.find((m) => m.userId !== user?.id);
        const chatName = chat.type === 'personal'
            ? otherMember?.user.displayName || otherMember?.user.username || t('chat')
            : chat.name || t('group');
        return chatName.toLowerCase().includes(search.toLowerCase());
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/70"
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                role="dialog"
                aria-modal="true"
                aria-label={t('forward')}
                className="relative w-full max-w-md bg-surface-secondary/90 glass-strong rounded-3xl overflow-hidden shadow-2xl border border-border"
            >
                <div className="p-4 flex items-center justify-between border-b border-white/5">
                    <h2 className="text-lg font-semibold text-white">{t('forwardMessage')}</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                    >
                        <X size={20} className="text-zinc-400" />
                    </button>
                </div>

                <div className="p-4">
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                        <input
                            type="text"
                            placeholder={t('searchChats') || 'Поиск чатов'}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-vortex-500 transition-colors"
                        />
                    </div>

                    <div className="max-h-80 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                        {filteredChats.map((chat) => {
                            const otherMember = chat.members.find((m) => m.userId !== user?.id);
                            const chatName = chat.type === 'personal'
                                ? otherMember?.user.displayName || otherMember?.user.username || t('chat')
                                : chat.name || t('group');
                            const chatAvatar = chat.type === 'personal'
                                ? otherMember?.user.avatar
                                : chat.avatar;

                            return (
                                <button
                                    key={chat.id}
                                    onClick={() => onForward(chat.id)}
                                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left"
                                >
                                    <Avatar src={chatAvatar} name={chatName} size="md" />
                                    <span className="text-white font-medium flex-1 truncate">{chatName}</span>
                                </button>
                            );
                        })}
                        {filteredChats.length === 0 && (
                            <p className="text-center text-zinc-500 py-4 text-sm">{t('nothingFound')}</p>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

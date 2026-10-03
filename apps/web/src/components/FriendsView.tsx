import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Loader2,
  UserPlus,
  UserMinus,
  UserCheck,
  Search,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useLang } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import type { UserPresence, FriendRequest, FriendWithId } from '../lib/types';
import ConfirmModal from './ConfirmModal';

interface FriendsViewProps {
  onBack: () => void;
  /** Called when the number of incoming friend requests changes (accept/decline/load) */
  onFriendRequestsChange?: (count: number) => void;
}

export default function FriendsView({ onBack, onFriendRequestsChange }: FriendsViewProps) {
  const { user } = useAuthStore();
  const addChat = useChatStore(s => s.addChat);
  const setActiveChat = useChatStore(s => s.setActiveChat);
  const loadMessages = useChatStore(s => s.loadMessages);
  const { t } = useLang();

  const [friends, setFriends] = useState<FriendWithId[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState<UserPresence[]>([]);
  const [friendSearchLoading, setFriendSearchLoading] = useState(false);
  const [confirmRemoveFriendshipId, setConfirmRemoveFriendshipId] = useState<string | null>(null);

  const loadFriends = async () => {
    setFriendsLoading(true);
    try {
      const [friendsList, requests] = await Promise.all([
        api.getFriends(),
        api.getFriendRequests(),
      ]);
      setFriends(friendsList);
      setFriendRequests(requests);
      onFriendRequestsChange?.(requests.length);
    } catch (e) {
      console.error('Load friends error:', e);
    } finally {
      setFriendsLoading(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await api.acceptFriendRequest(requestId);
      const req = friendRequests.find(r => r.id === requestId);
      if (req) {
        const socket = getSocket();
        if (socket) socket.emit('friend_accepted', { friendId: req.user.id });
      }
      loadFriends();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      await api.declineFriendRequest(requestId);
      setFriendRequests(prev => {
        const updated = prev.filter(r => r.id !== requestId);
        onFriendRequestsChange?.(updated.length);
        return updated;
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveFriend = (friendshipId: string) => {
    setConfirmRemoveFriendshipId(friendshipId);
  };

  const handleConfirmRemoveFriend = async () => {
    const friendshipId = confirmRemoveFriendshipId;
    if (!friendshipId) return;
    setConfirmRemoveFriendshipId(null);
    try {
      const friend = friends.find(f => f.friendshipId === friendshipId);
      await api.removeFriend(friendshipId);
      if (friend) {
        const socket = getSocket();
        if (socket) socket.emit('friend_removed', { friendId: friend.id });
      }
      setFriends(prev => prev.filter(f => f.friendshipId !== friendshipId));
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenChat = async (friendId: string) => {
    try {
      const chat = await api.createPersonalChat(friendId);
      addChat(chat);
      setActiveChat(chat.id);
      loadMessages(chat.id);
    } catch (e) {
      console.error('Open chat error:', e);
    }
  };

  const handleSendFriendRequest = async (friendId: string) => {
    try {
      const result = await api.sendFriendRequest(friendId);
      const socket = getSocket();
      if (socket) socket.emit('friend_request', { friendId });
      if (result.status === 'accepted') {
        loadFriends();
      }
      setFriendSearchResults(prev => prev.filter(u => u.id !== friendId));
    } catch (e) {
      console.error(e);
    }
  };

  // Friend search effect
  useEffect(() => {
    const raw = friendSearch.trim();
    const q = raw.startsWith('@') ? raw.slice(1) : raw;
    if (q.length < 3) {
      setFriendSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setFriendSearchLoading(true);
        const results = await api.searchUsers(q);
        const friendIds = new Set(friends.map(f => f.id));
        const filtered = results.filter(u => u.id !== user?.id && !friendIds.has(u.id));
        setFriendSearchResults(filtered);
      } catch (e) {
        console.error(e);
      } finally {
        setFriendSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [friendSearch, friends, user?.id]);

  // Load friends on mount
  useEffect(() => {
    loadFriends();
  }, []);

  // Real-time friend updates via socket
  const loadFriendsRef = useRef(loadFriends);
  loadFriendsRef.current = loadFriends;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onFriendRequestReceived = () => {
      api.getFriendRequests().then(requests => {
        setFriendRequests(requests);
        onFriendRequestsChange?.(requests.length);
      }).catch(() => {});
    };
    const onFriendRequestAccepted = () => {
      loadFriendsRef.current();
    };
    const onFriendRemoved = (data: { userId: string }) => {
      setFriends(prev => prev.filter(f => f.id !== data.userId));
    };

    socket.on('friend_request_received', onFriendRequestReceived);
    socket.on('friend_request_accepted', onFriendRequestAccepted);
    socket.on('friend_removed', onFriendRemoved);

    return () => {
      socket.off('friend_request_received', onFriendRequestReceived);
      socket.off('friend_request_accepted', onFriendRequestAccepted);
      socket.off('friend_removed', onFriendRemoved);
    };
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-surface-secondary overflow-hidden safe-top">
      <motion.div key="friends" className="flex flex-col h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        <div className="h-14 flex items-center gap-3 px-4 border-border flex-shrink-0">
          <button onClick={onBack} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h3 className="text-sm font-semibold text-white flex-1">{t('friends')}</h3>
        </div>
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input type="text" placeholder={t('searchFriends')} value={friendSearch} onChange={(e) => setFriendSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-tertiary text-sm text-white placeholder-zinc-500 border border-border focus:border-accent transition-colors" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {friendsLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-zinc-400" /></div>
          ) : (
            <>
              {friendSearch.trim().length > 0 && renderSearchResults()}
              {friendRequests.length > 0 && renderRequests()}
              {renderFriendsList()}
            </>
          )}
        </div>
      </motion.div>

      <ConfirmModal
        open={!!confirmRemoveFriendshipId}
        title={t('removeFriend')}
        message={(() => {
          const f = friends.find(fr => fr.friendshipId === confirmRemoveFriendshipId);
          return `${t('removeFriend')} ${f?.displayName || f?.username || ''}?`;
        })()}
        confirmText={t('removeFriend')}
        cancelText={t('cancel')}
        danger
        onConfirm={handleConfirmRemoveFriend}
        onCancel={() => setConfirmRemoveFriendshipId(null)}
      />
    </div>
  );

  function renderSearchResults() {
    const raw = friendSearch.trim();
    const q = raw.startsWith('@') ? raw.slice(1) : raw;
    if (q.length < 3) return <div className="px-4 pt-2 pb-2"><p className="text-xs text-zinc-500 text-center py-3">{t('minCharsHint')}</p></div>;
    if (friendSearchLoading) return <div className="flex items-center justify-center py-4"><Loader2 size={18} className="animate-spin text-zinc-400" /></div>;
    if (friendSearchResults.length === 0) return <div className="px-4 pt-2 pb-2"><p className="text-xs text-zinc-500 text-center py-3">{t('noSearchResults')}</p></div>;
    return (
      <div className="px-4 pt-2 pb-2">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3"><Search size={12} className="inline mr-1" />{t('searchFriends').split('(')[0].trim()}</h4>
        <div className="space-y-1">
          {friendSearchResults.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-border/50">
              {u.avatar ? <img src={mediaUrl(u.avatar)} alt="" className="w-10 h-10 rounded-full object-cover" /> : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">{(u.displayName || u.username || '?')[0].toUpperCase()}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{u.displayName || u.username}</p>
                <p className="text-xs text-zinc-500">@{u.username}</p>
              </div>
              <button onClick={() => handleSendFriendRequest(u.id)} className="p-2 rounded-lg bg-vortex-500/20 text-vortex-400 hover:bg-vortex-500/30 transition-colors" title={t('addFriend')}><UserPlus size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    );
  }


  function renderRequests() {
    return (
      <div className="px-4 pt-4 pb-2">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">{t('friendRequests')} ({friendRequests.length})</h4>
        <div className="space-y-2">
          {friendRequests.map((req) => (
            <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-border/50">
              {req.user.avatar ? <img src={mediaUrl(req.user.avatar)} alt="" className="w-10 h-10 rounded-full object-cover" /> : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">{(req.user.displayName || req.user.username || '?')[0].toUpperCase()}</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{req.user.displayName || req.user.username}</p>
                <p className="text-xs text-zinc-500">@{req.user.username}</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => handleAcceptRequest(req.id)} className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors" title={t('accept')}><UserCheck size={16} /></button>
                <button onClick={() => handleDeclineRequest(req.id)} className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors" title={t('decline')}><UserMinus size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderFriendsList() {
    return (
      <div className="px-4 pt-4 pb-20">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">{t('friends')} ({friends.length})</h4>
        {friends.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-8">{t('noFriends')}</p>
        ) : (
          <div className="space-y-1">
            {friends.map((friend) => (
              <div key={friend.id} onClick={() => handleOpenChat(friend.id)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group/friend cursor-pointer">
                <div className="relative">
                  {friend.avatar ? <img src={mediaUrl(friend.avatar)} alt="" className="w-10 h-10 rounded-full object-cover" /> : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-vortex-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">{(friend.displayName || friend.username || '?')[0].toUpperCase()}</div>
                  )}
                  {friend.isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-surface-secondary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{friend.displayName || friend.username}</p>
                  <p className="text-xs text-zinc-500">{friend.isOnline ? t('online') : `@${friend.username}`}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleRemoveFriend(friend.friendshipId); }} className="p-2 rounded-lg text-zinc-500 opacity-40 group-hover/friend:opacity-100 hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 transition-all" title={t('removeFriend')}><UserMinus size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}


import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  Edit3,
  Check,
  Loader2,
  Trash2,
  Calendar,
  AtSign,
  MessageSquare,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import { mediaUrl } from '../lib/media';
import DatePicker from './DatePicker';

interface ProfileEditProps {
  onBack: () => void;
}

export default function ProfileEdit({ onBack }: ProfileEditProps) {
  const { user, updateUser, logout } = useAuthStore();
  const clearStore = useChatStore(s => s.clearStore);
  const { t, lang } = useLang();

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [birthday, setBirthday] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setBirthday(user.birthday || '');
    }
  }, [user]);

  const handleLogout = () => {
    clearStore();
    logout();
    onBack();
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const updated = await api.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        birthday: birthday || undefined,
      });
      updateUser(updated);
      setIsEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatarUploading(true);
      const updated = await api.uploadAvatar(file);
      updateUser(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      setAvatarUploading(true);
      await api.removeAvatar();
      updateUser({ avatar: null });
    } catch (err) {
      console.error(err);
    } finally {
      setAvatarUploading(false);
    }
  };

  const initials = (user?.displayName || user?.username || '??')
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col h-full w-full bg-surface-secondary overflow-hidden safe-top">
      <motion.div key="profile" className="flex flex-col h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/5 relative overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-vortex-500/20 to-purple-500/10 pointer-events-none" />
          <div className="flex items-center gap-3 relative z-10">
            <button onClick={() => { onBack(); setIsEditing(false); }} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"><ArrowLeft size={20} /></button>
            <h3 className="text-lg font-bold tracking-tight text-white drop-shadow-sm">{t('myProfile')}</h3>
          </div>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="relative z-10 p-2 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all border border-white/5"><Edit3 size={16} /></button>
          ) : (
            <button onClick={handleSave} disabled={isSaving} className="relative z-10 p-2 rounded-full text-vortex-400 hover:text-vortex-300 hover:bg-vortex-500/10 transition-all border border-vortex-500/20">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pb-20">
          {/* Avatar section */}
          <div className="flex flex-col items-center pt-8 pb-4 px-6 relative overflow-visible">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] bg-vortex-500/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-accent via-purple-500 to-accent rounded-full opacity-50 blur group-hover:opacity-75 transition duration-500 animate-[spin_4s_linear_infinite]" />
              <div className="relative">
                {user?.avatar ? (
                  <img src={mediaUrl(user.avatar)} alt="" className="w-28 h-28 rounded-full object-cover ring-4 ring-surface bg-surface" />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-gradient-to-br from-surface to-surface-secondary flex items-center justify-center text-white font-bold text-3xl ring-4 ring-surface relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-purple-500/20" />
                    <span className="relative z-10 text-transparent bg-clip-text bg-gradient-to-br from-white to-zinc-400 drop-shadow-md">{initials}</span>
                  </div>
                )}
              </div>
              <button onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}
                className="absolute inset-x-1 bottom-1 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 text-xs font-medium text-white transition-all transform translate-y-2 group-hover:translate-y-0">
                {avatarUploading ? <Loader2 size={14} className="text-vortex-400 animate-spin" /> : <Camera size={14} className="text-vortex-400" />}
              </button>
              {user?.avatar && (
                <button onClick={handleRemoveAvatar} disabled={avatarUploading}
                  className="absolute h-7 px-2.5 -top-1 left-1/2 -translate-x-1/2 bg-red-500/80 backdrop-blur-md hover:bg-red-500 rounded-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-400/30 transform -translate-y-2 group-hover:translate-y-0">
                  <Trash2 size={10} className="text-white" /><span className="text-[10px] font-semibold text-white">{t('removePhoto')}</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            {renderNameBio()}
          </div>
          {renderInfoCards()}
          {renderLogout()}
        </div>
      </motion.div>
    </div>
  );

  function renderNameBio() {
    if (isEditing) {
      return (
        <>
          <div className="mt-5 w-full max-w-[260px] relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-vortex-500 to-purple-500 rounded-2xl opacity-50 blur-sm pointer-events-none" />
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('enterName')}
              className="relative text-lg font-bold text-center text-white bg-black/40 border border-white/20 outline-none px-4 py-2.5 w-full rounded-2xl transition-all focus:border-vortex-500/50 focus:shadow-[0_0_20px_rgba(168,85,247,0.15)]" />
          </div>
          <div className="mt-3 w-full max-w-[280px] relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500/30 to-vortex-500/30 rounded-2xl opacity-40 blur-sm pointer-events-none" />
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t('tellAboutYourself') as string} rows={3}
              className="relative text-sm text-center text-zinc-300 bg-black/30 border border-white/10 outline-none px-4 py-2.5 w-full rounded-2xl resize-none transition-all focus:border-vortex-500/30 focus:shadow-[0_0_15px_rgba(168,85,247,0.1)]" />
          </div>
          <div className="mt-3 w-full max-w-[260px]">
            <DatePicker value={birthday} onChange={setBirthday} />
          </div>
        </>
      );
    }
    return (
      <>
        <h2 className="mt-4 text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-300">{user?.displayName || user?.username}</h2>
        <p className="text-sm text-vortex-400/80 font-medium mt-0.5">@{user?.username}</p>
        {user?.bio && <p className="text-sm text-zinc-400 text-center mt-2 max-w-[250px] leading-relaxed">{user.bio}</p>}
      </>
    );
  }

  function renderInfoCards() {
    const formatDate = (dateStr: string) => {
      try {
        return new Date(dateStr).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      } catch { return dateStr; }
    };
    return (
      <div className="px-5 space-y-2 mt-2">
        <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.05] transition-colors">
          <div className="w-9 h-9 rounded-xl bg-vortex-500/10 flex items-center justify-center"><AtSign size={16} className="text-vortex-400" /></div>
          <div className="flex-1 min-w-0"><p className="text-[11px] text-zinc-500 mb-0.5">{t('username')}</p><p className="text-sm text-white font-medium">@{user?.username}</p></div>
        </div>
        {user?.bio && (
          <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.05] transition-colors">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center mt-0.5"><MessageSquare size={16} className="text-blue-400" /></div>
            <div className="flex-1 min-w-0"><p className="text-[11px] text-zinc-500 mb-0.5">{t('aboutMe')}</p><p className="text-sm text-zinc-300 leading-relaxed">{user.bio}</p></div>
          </div>
        )}
        {user?.birthday && (
          <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:bg-white/[0.05] transition-colors">
            <div className="w-9 h-9 rounded-xl bg-pink-500/10 flex items-center justify-center"><Calendar size={16} className="text-pink-400" /></div>
            <div className="flex-1 min-w-0"><p className="text-[11px] text-zinc-500 mb-0.5">{t('birthday')}</p><p className="text-sm text-zinc-300">{formatDate(user.birthday)}</p></div>
          </div>
        )}
      </div>
    );
  }

  function renderLogout() {
    return (
      <div className="px-3 pb-4 pt-6">
        <div className="h-px bg-gradient-to-r from-transparent via-white/8 to-transparent mb-3" />
        <button onClick={handleLogout} className="group w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-200 hover:bg-red-500/[0.08] active:scale-[0.98]">
          <div className="w-9 h-9 rounded-xl bg-red-500/[0.08] group-hover:bg-red-500/15 flex items-center justify-center transition-all duration-200 border border-red-500/[0.06] group-hover:border-red-500/20">
            <LogOut size={17} className="text-red-400/70 group-hover:text-red-400 transition-colors duration-200" />
          </div>
          <span className="text-[13.5px] font-medium text-red-400/70 group-hover:text-red-400 transition-colors">{t('logout')}</span>
        </button>
      </div>
    );
  }
}


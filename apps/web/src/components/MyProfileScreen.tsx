import { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Camera, Pencil, Settings, Plus,
  Phone, Cake, AtSign, MessageSquareText, ChevronRight,
  Bell, Lock, Globe, Palette, FolderOpen, Image,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { mediaUrl } from '../lib/media';

interface Props { onEditProfile: () => void; onOpenSettings: () => void; }

export default function MyProfileScreen({ onEditProfile, onOpenSettings }: Props) {
  const { user, updateUser } = useAuthStore();
  const ref = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const openPicker = useCallback(() => ref.current?.click(), []);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { setUploading(true); updateUser(await api.uploadAvatar(f)); }
    catch (err) { console.error(err); } finally { setUploading(false); }
  };

  const name = user?.displayName || 'Стас';
  const av = mediaUrl(user?.avatar);
  const uname = user?.username || null;
  const bio = user?.bio || null;
  const bday = user?.birthday ? fmt(user.birthday) : '23 июн. 2004 (22 года)';

  const Row = ({ icon: I, label, sub, right, onClick }: any) => (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left">
      <I size={18} strokeWidth={1.6} className="text-zinc-400 shrink-0" />
      <span className="flex-1 text-[16px] text-white font-medium">{label}</span>
      {sub && <span className="text-[16px] text-zinc-400 mr-1">{sub}</span>}
      {right && <span className="text-[14px] text-zinc-500 mr-1">{right}</span>}
      <ChevronRight size={16} strokeWidth={1.6} className="text-zinc-500 shrink-0" />
    </button>
  );

  return (
    <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}
      className="relative flex flex-col h-full w-full overflow-hidden" style={{ backgroundColor: '#191923' }}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth" style={{ paddingBottom: 120 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5" aria-label="QR">
            <div className="grid grid-cols-2 gap-[2px]">
              <div className="w-[5px] h-[5px] rounded-[1px] bg-white/70" />
              <div className="w-[5px] h-[5px] rounded-[1px] bg-white/70" />
              <div className="w-[5px] h-[5px] rounded-[1px] bg-white/70" />
              <div className="w-[5px] h-[5px] rounded-[1px] bg-white/70" />
            </div>
          </button>
          <span className="text-[17px] font-semibold text-white tracking-tight">Профиль</span>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5" aria-label="Меню">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="3.5" r="1.3" fill="white" opacity="0.85" />
              <circle cx="9" cy="9" r="1.3" fill="white" opacity="0.85" />
              <circle cx="9" cy="14.5" r="1.3" fill="white" opacity="0.85" />
            </svg>
          </button>
        </div>

        {/* Avatar + Name */}
        <div className="flex flex-col items-center pt-5 pb-3">
          <div className="relative rounded-full overflow-hidden shrink-0" style={{ width: 100, height: 100 }}>
            {av ? <img src={av} alt={name} className="w-full h-full object-cover" /> : (
              <div className="w-full h-full flex items-center justify-center text-white font-bold"
                style={{ fontSize: 38, background: 'linear-gradient(135deg, #3B3F5C, #252738)' }}>
                {name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <h1 className="font-bold text-white mt-2.5 tracking-tight" style={{ fontSize: 20 }}>{name}</h1>
          <p className="mt-0.5 font-medium" style={{ fontSize: 13, color: '#8E8E93' }}>в сети</p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 px-4">
          <button onClick={openPicker} disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-[#2C2D3C] hover:brightness-110 active:scale-[0.98] transition-all">
            <Camera size={16} strokeWidth={1.6} className="text-white" />
            <span className="text-white font-medium" style={{ fontSize: 13 }}>Фото</span>
          </button>
          <button onClick={onEditProfile}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-[#2C2D3C] hover:brightness-110 active:scale-[0.98] transition-all">
            <Pencil size={16} strokeWidth={1.6} className="text-white" />
            <span className="text-white font-medium" style={{ fontSize: 13 }}>Изменить</span>
          </button>
          <button onClick={onOpenSettings}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-[#2C2D3C] hover:brightness-110 active:scale-[0.98] transition-all">
            <Settings size={16} strokeWidth={1.6} className="text-white" />
            <span className="text-white font-medium" style={{ fontSize: 13 }}>Настройки</span>
          </button>
          <input ref={ref} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>

        {/* Info rows */}
        <div className="mt-3">
          {uname && (
            <div className="flex items-center gap-3 px-4 py-2.5">
              <AtSign size={18} strokeWidth={1.6} className="text-zinc-400 shrink-0" />
              <span className="text-[16px] text-white font-medium">@{uname}</span>
            </div>
          )}
          {bio && (
            <div className="flex items-start gap-3 px-4 py-2.5">
              <MessageSquareText size={18} strokeWidth={1.6} className="text-zinc-400 shrink-0 mt-0.5" />
              <span className="text-[15px] text-zinc-300 leading-relaxed">{bio}</span>
            </div>
          )}
        </div>

        {/* Media header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <span className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: '#8E8E93' }}>Медиа</span>
        </div>

        {/* Empty media */}
        <div className="flex flex-col items-center justify-center py-12 px-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
            <Image size={28} strokeWidth={1.4} className="text-zinc-500" />
          </div>
          <p className="text-[16px] font-semibold text-white text-center">Нет медиафайлов</p>
          <p className="text-[13px] text-center mt-1 leading-relaxed" style={{ color: '#8E8E93' }}>
            Фотографии и видео, которыми вы<br/>поделитесь, появятся здесь
          </p>
        </div>
        <div className="h-6" />
      </div>
    </motion.div>
  );
}

function fmt(d: string): string {
  try {
    const dt = new Date(d);
    const m = ['янв.','фев.','мар.','апр.','мая','июн.','июл.','авг.','сен.','окт.','ноя.','дек.'];
    const age = new Date().getFullYear() - dt.getFullYear();
    const last = age % 10; const last2 = age % 100;
    let s = 'лет'; if (last2 < 11 || last2 > 14) { if (last === 1) s = 'год'; else if (last >= 2 && last <= 4) s = 'года'; }
    return `${dt.getDate()} ${m[dt.getMonth()]} ${dt.getFullYear()} (${age} ${s})`;
  } catch { return d; }
}

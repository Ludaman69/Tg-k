import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Phone, AtSign, Cake, Megaphone, Sparkles, UserPlus, LogOut, X, Check } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';

interface AccountPageProps { onBack: () => void; }
type ModalType = 'bio' | 'phone' | 'username' | 'birthday' | 'privacy' | 'logout' | 'channel' | 'addAccount' | null;

/** Преобразует ISO-дату (YYYY-MM-DD) в читаемый формат "23 июн. 2004" */
function formatBirthday(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const months = ['янв.', 'фев.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'ноя.', 'дек.'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch { return iso; }
}

/** Пытается распарсить читаемую дату обратно в YYYY-MM-DD */
function parseBirthdayInput(input: string): string | null {
  if (!input.trim()) return null;
  // Пробуем ISO формат
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    const d = new Date(input.trim());
    return isNaN(d.getTime()) ? null : input.trim();
  }
  // Пробуем русский формат "23 июн. 2004" или "23 июн 2004" или "23.06.2004"
  const ruMatch = input.match(/^(\d{1,2})\s*(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)[а-я.]*\s*(\d{4})$/i);
  if (ruMatch) {
    const ruMonths: Record<string, number> = {
      'янв': 0, 'фев': 1, 'мар': 2, 'апр': 3, 'май': 4, 'мая': 4,
      'июн': 5, 'июл': 6, 'авг': 7, 'сен': 8, 'окт': 9, 'ноя': 10, 'дек': 11,
    };
    const day = parseInt(ruMatch[1], 10);
    const monthKey = ruMatch[2].toLowerCase().slice(0, 3);
    const year = parseInt(ruMatch[3], 10);
    const month = ruMonths[monthKey];
    if (month !== undefined && day > 0 && day <= 31 && year > 1900 && year < 2100) {
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  // Пробуем "23.06.2004"
  const dotMatch = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10);
    const year = parseInt(dotMatch[3], 10);
    if (day > 0 && day <= 31 && month > 0 && month <= 12 && year > 1900 && year < 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

export default function AccountPage({ onBack }: AccountPageProps) {
  const { user, logout, updateUser } = useAuthStore();
  const clearStore = useChatStore(s => s.clearStore);

  // Извлекаем имя/фамилию из displayName (первое слово — имя, остальное — фамилия)
  const nameParts = useMemo(() => {
    const displayName = user?.displayName || '';
    const parts = displayName.trim().split(/\s+/);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
    };
  }, [user?.displayName]);

  // Синхронизируем локальное состояние с user из authStore
  const [firstName, setFirstName] = useState(nameParts.firstName);
  const [lastName, setLastName] = useState(nameParts.lastName);
  const [bio, setBio] = useState(user?.bio || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [username, setUsername] = useState(user?.username || '');
  const [birthday, setBirthday] = useState(formatBirthday(user?.birthday));

  useEffect(() => {
    if (user) {
      const parts = (user.displayName || '').trim().split(/\s+/);
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
      setBio(user.bio || '');
      setUsername(user.username || '');
      setPhone(user.phone || '');
      setBirthday(formatBirthday(user.birthday));
    }
  }, [user]);

  const [modal, setModal] = useState<ModalType>(null);
  const [tmpBio, setTmpBio] = useState('');
  const [tmpPhone, setTmpPhone] = useState('');
  const [tmpUsername, setTmpUsername] = useState('');
  const [tmpBirthday, setTmpBirthday] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const openModal = (type: ModalType) => {
    if (type === 'bio') setTmpBio(bio);
    if (type === 'phone') setTmpPhone(phone);
    if (type === 'username') setTmpUsername(username);
    if (type === 'birthday') setTmpBirthday(birthday);
    setModalError('');
    setModal(type);
  };
  const closeModal = () => setModal(null);

  const handleSaveBio = async () => {
    setIsSaving(true);
    setModalError('');
    try {
      const u = await api.updateProfile({ bio: tmpBio.trim() });
      updateUser(u);
      setBio(tmpBio);
      closeModal();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally { setIsSaving(false); }
  };

  const handleSavePhone = async () => {
    setIsSaving(true);
    setModalError('');
    try {
      const u = await api.updateProfile({ phone: tmpPhone.trim() || undefined });
      updateUser(u);
      setPhone(u.phone || '');
      closeModal();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally { setIsSaving(false); }
  };

  const handleSaveUsername = async () => {
    const trimmed = tmpUsername.trim();
    if (!trimmed || trimmed === username) { closeModal(); return; }
    setIsSaving(true);
    setModalError('');
    try {
      const u = await api.updateProfile({ username: trimmed });
      updateUser(u);
      setUsername(trimmed);
      closeModal();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally { setIsSaving(false); }
  };

  const handleSaveBirthday = async () => {
    const iso = parseBirthdayInput(tmpBirthday);
    if (!iso && tmpBirthday.trim()) {
      setModalError('Некорректный формат даты (например: 23 июн. 2004 или 23.06.2004)');
      return;
    }
    setIsSaving(true);
    setModalError('');
    try {
      const u = await api.updateProfile({ birthday: iso || undefined });
      updateUser(u);
      setBirthday(formatBirthday(u.birthday));
      closeModal();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally { setIsSaving(false); }
  };

  const handleSaveName = async () => {
    const displayName = [firstName, lastName].filter(Boolean).join(' ');
    if (!displayName.trim()) return;
    setIsSaving(true);
    try {
      const u = await api.updateProfile({ displayName });
      updateUser(u);
    } catch (err: unknown) {
      console.error('Ошибка сохранения имени:', err instanceof Error ? err.message : String(err));
    } finally { setIsSaving(false); }
  };

  const confirmLogout = () => { clearStore(); logout(); onBack(); };
const MAX_BIO = 70;
const S = { card: { backgroundColor: '#222332' } as React.CSSProperties, muted: { color: '#555568' } as React.CSSProperties, accent: { color: '#7B8CFF' } as React.CSSProperties };
  const icoBg = (c: string): React.CSSProperties => ({ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: c });
return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ backgroundColor: '#191923' }}>
      <motion.div key="account" className="flex flex-col h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        <div className="flex items-center gap-3 px-5 h-14 flex-shrink-0">
          <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors"><ArrowLeft size={22} strokeWidth={2} /></button>
          <h1 className="text-[20px] font-semibold text-white tracking-tight">Аккаунт</h1>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
          <div className="px-4 mb-4"><div className="rounded-[25px] px-5 py-[18px]" style={S.card}>
            <p className="text-[13px] font-medium mb-1.5 tracking-wide" style={S.accent}>Ваше имя</p>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} onBlur={handleSaveName} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveName(); } }}
              className="w-full bg-transparent text-[17px] text-white font-medium placeholder:text-[#555568] outline-none border-none p-0" placeholder="Имя" />
            <div className="my-[14px] h-px w-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} onBlur={handleSaveName} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSaveName(); } }}
              className="w-full bg-transparent text-[17px] placeholder:text-[#555568] outline-none border-none p-0" placeholder="Фамилия" style={{ color: lastName ? '#fff' : '#555568' }} />
          </div></div>
<div className="px-4 mb-2"><div onClick={() => openModal('bio')}
              className="rounded-[14px] px-5 py-[17px] flex items-center justify-between cursor-pointer" style={S.card}>
              <div className="flex-1 min-w-0 pr-2">
                <span className="text-[17px]" style={{ color: bio ? '#fff' : '#555568' }}>
                  {bio || 'О себе'}
                </span>
                {bio && <span className="text-[13px] block mt-0.5 truncate" style={S.muted}>{bio}</span>}
              </div>
              <span className="text-[13px] shrink-0" style={S.muted}>{bio.length}/70</span></div></div>
          <div className="px-5 mb-5"><p className="text-[14px]" style={S.muted}>Напишите немного о себе.</p></div>
<div className="px-4 mb-1"><div className="rounded-[14px] px-5 py-[16px]" style={S.card}>
            <p className="text-[13px] font-medium mb-[18px] tracking-wide" style={S.accent}>Информация о Вас</p>
            <div onClick={() => openModal('phone')} className="flex items-center gap-3.5 py-[11px] cursor-pointer">
              <div style={icoBg('#7B8CFF')}><Phone size={14} className="text-white" /></div>
              <div className="flex-1 min-w-0"><p className="text-[17px] text-white leading-tight">{phone}</p>
                <p className="text-[13px] leading-tight mt-0.5" style={S.muted}>Нажмите, чтобы изменить номер телефона</p></div></div>
            <div onClick={() => openModal('username')} className="flex items-center gap-3.5 py-[11px] cursor-pointer">
              <div style={icoBg('#7B8CFF')}><AtSign size={14} className="text-white" /></div>
              <div className="flex-1 min-w-0"><p className="text-[17px] leading-tight" style={{ color: username ? '#fff' : '#555568' }}>{username || 'Добавить имя пользователя'}</p></div></div>
            <div onClick={() => openModal('birthday')} className="flex items-center gap-3.5 py-[11px] cursor-pointer">
              <div style={icoBg('#7B8CFF')}><Cake size={14} className="text-white" /></div>
              <div className="flex-1 min-w-0"><p className="text-[17px] text-white leading-tight">{birthday}</p>
                <p className="text-[13px] leading-tight mt-0.5" style={S.muted}>День рождения</p></div></div>
          </div></div>
          <div className="px-5 mb-1"><p className="text-[14px]" style={S.muted}>Ваш день рождения могут видеть только контакты.</p></div>
<div className="px-4 mb-2"><div className="rounded-[14px] px-0 py-[4px]" style={S.card}>
            <div className="flex items-center gap-3.5 px-5 py-[13px]">
              <div style={icoBg('#F59E0B')}><Megaphone size={14} className="text-white" /></div>
              <span className="text-[17px] text-white flex-1">Личный канал</span>
              <button onClick={() => openModal('channel')} className="text-[15px] font-medium shrink-0" style={S.accent}>Добавить</button></div>
          </div></div>
          <div className="px-5 mb-6"><p className="text-[14px] leading-snug" style={S.muted}>Подключите бота, который будет отвечать на сообщения от Вашего имени.</p></div>
          <div className="px-4 mb-4"><div className="rounded-[14px] px-0 py-[4px]" style={S.card}>
            <div onClick={() => openModal('addAccount')} className="flex items-center gap-3.5 px-5 py-[15px] cursor-pointer">
              <div style={icoBg('#7B8CFF')}><UserPlus size={14} className="text-white" /></div>
              <span className="text-[17px] text-white flex-1">Добавить аккаунт</span></div>
            <div className="h-px mx-5" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
            <button onClick={() => setModal('logout')} className="flex items-center gap-3.5 px-5 py-[15px] w-full cursor-pointer">
              <div style={icoBg('rgba(239,68,68,0.15)')}><LogOut size={14} className="text-red-400" /></div>
              <span className="text-[17px] text-red-400 flex-1 text-left">Выход</span></button>
          </div></div>
          <div className="h-8" />
        </div>
      </motion.div>
          <div className="px-5 mb-5"><button onClick={() => openModal('privacy')} className="text-[14px] font-medium" style={S.accent}>Изменить ›</button></div>
{/* ===== MODALS ===== */}
      <AnimatePresence>
        {modal && (
          <motion.div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
            <motion.div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6"
              style={{ backgroundColor: '#222332' }}
              initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-[18px] font-semibold text-white">
                  {modal === 'bio' && 'О себе'}
                  {modal === 'phone' && 'Номер телефона'}
                  {modal === 'username' && 'Имя пользователя'}
                  {modal === 'birthday' && 'День рождения'}
                  {modal === 'privacy' && 'Видимость дня рождения'}
                  {modal === 'channel' && 'Личный канал'}
                  {modal === 'addAccount' && 'Добавить аккаунт'}
                  {modal === 'logout' && 'Выход'}
                </h3>
                <button onClick={closeModal} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"><X size={20} /></button>
              </div>
{modal === 'bio' && (
                <div>
                  <textarea value={tmpBio} onChange={e => setTmpBio(e.target.value.slice(0, MAX_BIO))}
                    className="w-full bg-white/[0.06] text-white text-[15px] rounded-xl p-4 outline-none border border-white/[0.08] focus:border-[#7B8CFF]/30 resize-none"
                    rows={4} placeholder="Расскажите о себе..." />
                  <p className="text-right text-[13px] mt-1" style={S.muted}>{tmpBio.length}/{MAX_BIO}</p>
                  {modalError && <p className="text-[13px] text-red-400 mb-2 mt-1">{modalError}</p>}
                  <button onClick={handleSaveBio} disabled={isSaving}
                    className="w-full mt-3 py-3 rounded-xl text-white font-medium text-[15px] transition-colors disabled:opacity-50"
                    style={{ backgroundColor: '#7B8CFF' }}>{isSaving ? 'Сохранение...' : 'Сохранить'}</button>
                </div>
              )}
              {modal === 'phone' && (
                <div>
                  <input type="tel" value={tmpPhone} onChange={e => setTmpPhone(e.target.value)}
                    className="w-full bg-white/[0.06] text-white text-[17px] rounded-xl p-4 outline-none border border-white/[0.08] focus:border-[#7B8CFF]/30" />
                  {modalError && <p className="text-[13px] text-red-400 mb-2 mt-1">{modalError}</p>}
                  <button onClick={handleSavePhone} disabled={isSaving}
                    className="w-full mt-3 py-3 rounded-xl text-white font-medium text-[15px] disabled:opacity-50" style={{ backgroundColor: '#7B8CFF' }}>
                    {isSaving ? 'Сохранение...' : 'Сохранить'}</button>
                </div>
              )}
              {modal === 'username' && (
                <div>
                  <div className="flex items-center bg-white/[0.06] rounded-xl border border-white/[0.08] focus-within:border-[#7B8CFF]/30 px-4">
                    <span className="text-white/40 text-[17px] mr-1">@</span>
                    <input type="text" value={tmpUsername} onChange={e => setTmpUsername(e.target.value)}
                      className="flex-1 bg-transparent text-white text-[17px] py-4 outline-none" placeholder="username" />
                  </div>
                  {modalError && <p className="text-[13px] text-red-400 mb-2 mt-1">{modalError}</p>}
                  <button onClick={handleSaveUsername} disabled={isSaving}
                    className="w-full mt-3 py-3 rounded-xl text-white font-medium text-[15px] disabled:opacity-50" style={{ backgroundColor: '#7B8CFF' }}>
                    {isSaving ? 'Сохранение...' : 'Сохранить'}</button>
                </div>
              )}
              {modal === 'birthday' && (
                <div>
                  <input type="text" value={tmpBirthday} onChange={e => setTmpBirthday(e.target.value)}
                    className="w-full bg-white/[0.06] text-white text-[17px] rounded-xl p-4 outline-none border border-white/[0.08] focus:border-[#7B8CFF]/30" placeholder="ДД мес. ГГГГ" />
                  {modalError && <p className="text-[13px] text-red-400 mb-2 mt-1">{modalError}</p>}
                  <button onClick={handleSaveBirthday} disabled={isSaving}
                    className="w-full mt-3 py-3 rounded-xl text-white font-medium text-[15px] disabled:opacity-50" style={{ backgroundColor: '#7B8CFF' }}>
                    {isSaving ? 'Сохранение...' : 'Сохранить'}</button>
                </div>
              )}
              {modal === 'privacy' && (
                <div>
                  <p className="text-[14px] mb-4" style={S.muted}>Выберите, кто может видеть ваш день рождения:</p>
                  {['Контакты', 'Никто'].map(opt => (
                    <button key={opt} onClick={closeModal}
                      className="w-full text-left px-4 py-3 rounded-xl text-white text-[15px] mb-2 bg-white/[0.04] hover:bg-white/[0.08] transition-colors">
                      {opt}{opt === 'Контакты' && <Check size={14} className="inline ml-2" style={S.accent} />}</button>
                  ))}
                </div>
              )}
              {(modal === 'channel' || modal === 'addAccount') && (
                <div>
                  <p className="text-[14px] mb-4" style={S.muted}>
                    {modal === 'channel' ? 'Создать личный канал для публикаций?' : 'Добавить ещё один аккаунт в приложение?'}
                  </p>
                  <div className="flex gap-3">
                    <button onClick={closeModal} className="flex-1 py-3 rounded-xl text-white text-[15px] bg-white/[0.06] hover:bg-white/[0.1] transition-colors">Отмена</button>
                    <button onClick={closeModal} className="flex-1 py-3 rounded-xl text-white font-medium text-[15px]" style={{ backgroundColor: '#7B8CFF' }}>
                      {modal === 'channel' ? 'Создать' : 'Добавить'}</button>
                  </div>
                </div>
              )}
              {modal === 'logout' && (
                <div>
                  <p className="text-[14px] mb-4" style={S.muted}>Вы уверены, что хотите выйти из аккаунта?</p>
                  <div className="flex gap-3">
                    <button onClick={closeModal} className="flex-1 py-3 rounded-xl text-white text-[15px] bg-white/[0.06] hover:bg-white/[0.1] transition-colors">Отмена</button>
                    <button onClick={confirmLogout} className="flex-1 py-3 rounded-xl text-white font-medium text-[15px]" style={{ backgroundColor: '#EF4444' }}>Выйти</button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

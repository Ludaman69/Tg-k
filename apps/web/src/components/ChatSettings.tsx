import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MoreVertical, ChevronRight, Check, Lock, Sun, Moon, Image, Palette, Smartphone, Globe, Zap, MousePointer2, Mic, Send, Ruler, RefreshCw, Eye, EyeOff, Sticker, Smile, Play, Pause, Phone } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLang } from '../lib/i18n';
import { useChatSettingsStore, COLOR_THEMES, APP_ICONS } from '../stores/chatSettingsStore';
import type { AppIcon, SwipeAction, DistanceUnit } from '../stores/chatSettingsStore';

interface ChatSettingsProps { onBack: () => void; }
type SubView = 'main' | 'wallpaper' | 'usernameColor' | 'themeSettings' | 'animations' | 'stickers';

export default function ChatSettings({ onBack }: ChatSettingsProps) {
  const { user } = useAuthStore(); const { lang } = useLang();
  const [view, setView] = useState<SubView>('main');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const store = useChatSettingsStore();
  const ct = COLOR_THEMES.find(t => t.id === store.colorThemeId) || COLOR_THEMES[0];
  const goBack = () => { if (view === 'main') onBack(); else setView('main'); };
  const T = (ru: string, en: string) => lang === 'ru' ? ru : en;

  if (view === 'wallpaper') return <WallpaperPicker onBack={() => setView('main')} />;
  if (view === 'usernameColor') return <UsernameColorPicker onBack={() => setView('main')} />;
  if (view === 'themeSettings') return <ThemeSettingsView onBack={() => setView('main')} />;
  if (view === 'animations') return <AnimationsSettings onBack={() => setView('main')} />;
  if (view === 'stickers') return <StickersSettings onBack={() => setView('main')} />;

  const isDay = store.isDayTheme;
  const bg = isDay ? '#f5f5f5' : ct.bg; const sBg = isDay ? '#ffffff' : ct.surface;
  const tc = isDay ? '#1a1a1a' : ct.text; const ts = isDay ? '#6b7280' : ct.textSecondary;
  const ac = ct.accent; const hdr = isDay ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.25)';
  const div = isDay ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden safe-top" style={{backgroundColor:bg}}>
      <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0" style={{borderBottom:`1px solid ${div}`}}>
        <button onClick={goBack} className="p-1.5 -ml-1 rounded-xl hover:bg-white/[0.08] transition-colors" style={{color:ts}}><ArrowLeft size={22}/></button>
        <h2 className="text-lg font-semibold flex-1" style={{color:tc}}>{T('Настройки чатов','Chat Settings')}</h2>
        <div className="relative">
          <button onClick={()=>setMenuOpen(!menuOpen)} className="p-2 rounded-xl hover:bg-white/[0.08] transition-colors" style={{color:ts}}><MoreVertical size={20} strokeWidth={1.8}/></button>
          <AnimatePresence>{menuOpen && <motion.div initial={{opacity:0,scale:0.92,y:-4}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.92,y:-4}} transition={{duration:0.15}}
            className="absolute right-0 top-full mt-1 w-56 rounded-xl overflow-hidden z-50 shadow-2xl" style={{backgroundColor:sBg,border:`1px solid ${div}`}}>
            <button onClick={()=>{setMenuOpen(false);setShowResetConfirm(true)}} className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/[0.05] transition-colors" style={{color:'#ef4444'}}><RefreshCw size={16}/> {T('Сбросить настройки','Reset Settings')}</button>
          </motion.div>}</AnimatePresence>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
<Hdr title={T('РАЗМЕР ТЕКСТА СООБЩЕНИЙ','MESSAGE TEXT SIZE')} color={hdr}/>
        <Card bg={sBg} border={div}>
          <Sld label={T('Размер текста сообщений','Message text size')} val={store.messageTextSize} min={10} max={28} step={1} onChange={store.setMessageTextSize} color={ac} tc={tc} ts={ts}/>
        </Card>
        <Hdr title={T('ОФОРМЛЕНИЕ','APPEARANCE')} color={hdr}/>
        <Card bg={sBg} border={div}>
          <Row icon={Image} ibg={ac+'1a'} ic={ac} label={T('Изменить обои','Change Wallpaper')}
            right={store.wallpaper?<div className="w-8 h-8 rounded-lg bg-cover bg-center" style={{backgroundImage:`url(${store.wallpaper})`}}/>:<ChevronRight size={18} style={{color:ts}}/>}
            onClick={()=>setView('wallpaper')} border={div} tc={tc} ts={ts}/>
          <Row icon={Palette} ibg={ac+'1a'} ic={ac} label={T('Изменить цвет имени','Change Name Color')}
            subtitle={user?.displayName||user?.username||'User'} subClr={store.usernameColor}
            onClick={()=>setView('usernameColor')} border={div} tc={tc} ts={ts} isLast/>
        </Card>
        <Hdr title={T('ЦВЕТОВАЯ ТЕМА','COLOR THEME')} color={hdr}/>
        <div className="px-4 mb-5"><div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          {COLOR_THEMES.map(theme=><button key={theme.id} onClick={()=>store.setColorThemeId(theme.id)} className="flex flex-col items-center gap-1.5 flex-shrink-0 group">
            <div className="w-[60px] h-[60px] rounded-2xl transition-all duration-200 flex items-center justify-center"
              style={{background:`linear-gradient(135deg,${theme.bubbleMy},${theme.bubbleMyTo})`,border:store.colorThemeId===theme.id?`3px solid ${ac}`:'3px solid transparent',transform:store.colorThemeId===theme.id?'scale(1.05)':'scale(1)'}}>
              {store.colorThemeId===theme.id&&<Check size={20} style={{color:'#fff'}} strokeWidth={2.5}/>}
            </div><span className="text-[11px] font-medium text-center" style={{color:store.colorThemeId===theme.id?ac:ts}}>{T(theme.name,theme.nameEn)}</span>
          </button>)}
        </div></div>
        <Card bg={sBg} border={div}>
          <Row icon={store.isDayTheme?Moon:Sun} ibg={ac+'1a'} ic={ac}
            label={store.isDayTheme?T('Переключить на ночную тему','Switch to Night Theme'):T('Переключить на дневную тему','Switch to Day Theme')}
            onClick={()=>store.setIsDayTheme(!store.isDayTheme)} border={div} tc={tc} ts={ts}/>
          <Row icon={Palette} ibg={ac+'1a'} ic={ac} label={T('Настройки темы','Theme Settings')}
            subtitle={T('Цвета интерфейса, сообщений, фона','Interface colors, messages, background')}
            onClick={()=>setView('themeSettings')} border={div} tc={tc} ts={ts} isLast/>
        </Card>
        <Hdr title={T('УГЛЫ БЛОКОВ С СООБЩЕНИЯМИ','MESSAGE CORNER RADIUS')} color={hdr}/>
        <Card bg={sBg} border={div}>
          <Sld label={T('Углы блоков с сообщениями','Message corner radius')} val={store.messageCornerRadius} min={0} max={30} step={1} onChange={store.setMessageCornerRadius} color={ac} tc={tc} ts={ts}/>
        </Card>
        <Hdr title={T('СПИСОК ЧАТОВ','CHAT LIST')} color={hdr}/>
        <Card bg={sBg} border={div}>
          <Radio label={T('Двухстрочный','Two-line')} sel={store.chatListStyle==='two-line'} onClick={()=>store.setChatListStyle('two-line')} ac={ac} tc={tc} border={div}/>
          <Radio label={T('Трехстрочный','Three-line')} sel={store.chatListStyle==='three-line'} onClick={()=>store.setChatListStyle('three-line')} ac={ac} tc={tc} border={div} isLast/>
        </Card>
<Hdr title={T('СМАХИВАНИЕ ВЛЕВО В СПИСКЕ ЧАТОВ','SWIPE LEFT IN CHAT LIST')} color={hdr}/>
        <Card bg={sBg} border={div}>
          {(['read','archive','mute'] as SwipeAction[]).map((a,i,arr)=>
            <Radio key={a} label={a==='read'?T('Прочитать','Read'):a==='archive'?T('Архивировать','Archive'):T('Выкл. звук','Mute')}
              sel={store.swipeAction===a} onClick={()=>store.setSwipeAction(a)} ac={ac} tc={tc} border={div} isLast={i===arr.length-1}/>)}
        </Card>
        <Hdr title={T('ОБЩИЕ','GENERAL')} color={hdr}/>
        <Card bg={sBg} border={div}>
          <Tgl icon={Moon} ibg="#6366f11a" ic="#6366f1" label={T('Смена темы ночью','Night theme switch')}
            sub={store.nightThemeEnabled?T('Включена','Enabled'):T('Выключена','Disabled')}
            chk={store.nightThemeEnabled} onChange={store.setNightThemeEnabled} tc={tc} ts={ts} border={div}/>
          <Tgl icon={Globe} ibg="#06b6d41a" ic="#06b6d4" label={T('Встроенный браузер','In-app browser')}
            sub={T('Открывать ссылки в приложении','Open links in app')}
            chk={store.inAppBrowser} onChange={store.setInAppBrowser} tc={tc} ts={ts} border={div}/>
          <Row icon={Zap} ibg="#f59e0b1a" ic="#f59e0b" label={T('Анимации','Animations')}
            subtitle={T('Настройки для экономии заряда','Power saving settings')}
            onClick={()=>setView('animations')} border={div} tc={tc} ts={ts} isLast/>
        </Card>
        <Hdr title={T('СТИКЕРЫ И ЭМОДЗИ','STICKERS & EMOJI')} color={hdr}/>
        <Card bg={sBg} border={div}>
          <Row icon={Sticker} ibg="#ec48991a" ic="#ec4899" label={T('Стикеры и эмодзи','Stickers & Emoji')}
            subtitle={T('Настройки стикеров, эмодзи и реакций','Stickers, emoji & reactions settings')}
            onClick={()=>setView('stickers')} border={div} tc={tc} ts={ts} isLast/>
        </Card>
        <Hdr title={T('МЕДИАФАЙЛЫ И ЗВУК','MEDIA & SOUND')} color={hdr}/>
        <Card bg={sBg} border={div}>
          <Tgl icon={MousePointer2} ibg="#22c55e1a" ic="#22c55e" label={T('Листать медиафайлы по нажатию','Swipe media by tap')}
            sub={T('Листать нажатием у края экрана в режиме просмотра','Tap edge to swipe in media viewer')}
            chk={store.mediaSettings.swipeMedia} onChange={v=>store.setMediaSettings({swipeMedia:v})} tc={tc} ts={ts} border={div}/>
          <Tgl icon={Phone} ibg="#3b82f61a" ic="#3b82f6" label={T('Поднести и слушать','Raise to listen')}
            sub={T('Переключаться на верхний динамик','Switch to earpiece')}
            chk={store.mediaSettings.raiseToListen} onChange={v=>store.setMediaSettings({raiseToListen:v})} tc={tc} ts={ts} border={div}/>
          <Tgl icon={Mic} ibg="#ef44441a" ic="#ef4444" label={T('Поднести и говорить','Raise to speak')}
            sub={T('Записывать голосовое при поднесении к уху','Record voice when raising phone')}
            chk={store.mediaSettings.raiseToSpeak} onChange={v=>store.setMediaSettings({raiseToSpeak:v})} tc={tc} ts={ts} border={div}/>
          <Tgl icon={Pause} ibg="#f59e0b1a" ic="#f59e0b" label={T('Пауза музыки при записи','Pause music on record')}
            sub={T('Ставить музыку на паузу при записи','Pause music when recording')}
            chk={store.mediaSettings.pauseMusicOnRecord} onChange={v=>store.setMediaSettings({pauseMusicOnRecord:v})} tc={tc} ts={ts} border={div}/>
          <Tgl icon={Play} ibg="#a855f71a" ic="#a855f7" label={T('Пауза музыки при запуске медиа','Pause music on media play')}
            sub={T('Останавливать музыку при запуске видео/аудио','Stop music when playing video/audio')}
            chk={store.mediaSettings.pauseMusicOnMedia} onChange={v=>store.setMediaSettings({pauseMusicOnMedia:v})} tc={tc} ts={ts} border={div}/>
<Row icon={Mic} ibg="#8b5cf61a" ic="#8b5cf6" label={T('Микрофон','Microphone')}
            subtitle={store.mediaSettings.microphone==='builtin'?T('Встроенный','Built-in'):store.mediaSettings.microphone}
            onClick={()=>{const c=window.prompt(T('Выберите микрофон: 1.Встроенный 2.Внешний 3.Bluetooth','Select: 1.Built-in 2.External 3.Bluetooth'),'1');if(c){const i=parseInt(c)-1;const k=['builtin','external','bluetooth'];if(i>=0&&i<k.length)store.setMediaSettings({microphone:k[i]})}}}
            border={div} tc={tc} ts={ts} isLast/>
        </Card>
        <Hdr title={T('ПРОЧИЕ НАСТРОЙКИ','OTHER SETTINGS')} color={hdr}/>
        <Card bg={sBg} border={div}>
          <Tgl icon={Send} ibg="#6366f11a" ic="#6366f1" label={T('Direct Share','Direct Share')}
            sub={T('Показывать недавние чаты в меню','Show recent chats in share menu')}
            chk={store.directShare} onChange={store.setDirectShare} tc={tc} ts={ts} border={div}/>
          <Tgl icon={store.showAdultContent?Eye:EyeOff} ibg="#ef44441a" ic="#ef4444"
            label={T('Показывать материалы 18+','Show adult content')}
            sub={T('Не скрывать медиа 18+',"Don't hide adult-only media")}
            chk={store.showAdultContent} onChange={v=>{if(v){const cf=window.confirm(T('Вам есть 18 лет?','Are you 18+'));if(cf)store.setShowAdultContent(v)}else store.setShowAdultContent(v)}} tc={tc} ts={ts} border={div}/>
          <Tgl icon={Send} ibg="#22c55e1a" ic="#22c55e" label={T('Отправка по Enter','Send by Enter')}
            sub={store.sendByEnter?T('Enter отправляет сообщение','Enter sends message'):T('Enter переносит строку','Enter adds new line')}
            chk={store.sendByEnter} onChange={store.setSendByEnter} tc={tc} ts={ts} border={div}/>
          <Row icon={Ruler} ibg="#f59e0b1a" ic="#f59e0b" label={T('Мера расстояния','Distance unit')}
            subtitle={store.distanceUnit==='auto'?T('Автоматически','Auto'):store.distanceUnit==='metric'?T('Метрическая','Metric'):T('Имперская','Imperial')}
            onClick={()=>{const u:DistanceUnit[]=['auto','metric','imperial'];store.setDistanceUnit(u[(u.indexOf(store.distanceUnit)+1)%u.length])}}
            border={div} tc={tc} ts={ts} isLast/>
        </Card>
        <div className="h-24"/>
      </div>
<AnimatePresence>
        {showResetConfirm && <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={()=>setShowResetConfirm(false)}>
          <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}}
            className="mx-4 w-full max-w-[320px] rounded-2xl p-6 shadow-2xl" style={{backgroundColor:sBg}} onClick={e=>e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2" style={{color:tc}}>{T('Сбросить настройки?','Reset settings?')}</h3>
            <p className="text-sm mb-6" style={{color:ts}}>{T('Сбросить все настройки чатов?','Reset all chat settings?')}</p>
            <div className="flex gap-3">
              <button onClick={()=>setShowResetConfirm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors" style={{color:tc,backgroundColor:div}}>{T('Отмена','Cancel')}</button>
              <button onClick={()=>{store.resetSettings();setShowResetConfirm(false)}} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white transition-colors" style={{backgroundColor:'#ef4444'}}>{T('Сбросить','Reset')}</button>
            </div>
          </motion.div>
        </motion.div>}
      </AnimatePresence>
    </div>);
}
/* ── Reusable helpers ── */
function Hdr({title,color}:{title:string;color:string}){return <div className="px-5 mb-2 mt-1"><span className="text-[12px] font-semibold tracking-wider uppercase" style={{color}}>{title}</span></div>}
function Card({children,bg,border}:{children:React.ReactNode;bg:string;border:string}){return <div className="mx-4 mb-5 rounded-[20px] overflow-hidden" style={{backgroundColor:bg,border:`1px solid ${border}`}}>{children}</div>}

function Sld({label,val,min,max,step,onChange,color,tc,ts}:{label:string;val:number;min:number;max:number;step:number;onChange:(v:number)=>void;color:string;tc:string;ts:string}){
  const [lv,setLv]=useState(val);useEffect(()=>{setLv(val)},[val]);
  return <div className="px-4 py-3.5">
    <div className="flex items-center justify-between mb-2"><span className="text-[15px] font-medium" style={{color:tc}}>{label}</span><span className="text-[15px] font-semibold min-w-[28px] text-right" style={{color}}>{lv}</span></div>
    <input type="range" min={min} max={max} step={step} value={lv} onChange={e=>{const v=Number(e.target.value);setLv(v);onChange(v)}}
      className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{background:`linear-gradient(to right,${color} ${((lv-min)/(max-min))*100}%,rgba(255,255,255,0.1) ${((lv-min)/(max-min))*100}%)`,accentColor:color}}/>
  </div>
}

function Row({icon:Icon,ibg,ic,label,subtitle,subClr,right,onClick,border,tc,ts,isLast}:{icon:typeof Image;ibg:string;ic:string;label:string;subtitle?:string;subClr?:string;right?:React.ReactNode;onClick:()=>void;border:string;tc:string;ts:string;isLast?:boolean}){
  return <button onClick={onClick} className="w-full flex items-center gap-3.5 px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left" style={{borderBottom:isLast?'none':`1px solid ${border}`}}>
    <div className="w-[40px] h-[40px] rounded-[13px] flex items-center justify-center shrink-0" style={{backgroundColor:ibg}}><Icon size={19} strokeWidth={1.6} style={{color:ic}}/></div>
    <div className="flex-1 min-w-0"><p className="text-[15px] font-medium leading-tight" style={{color:tc}}>{label}</p>
    {subtitle&&<p className="text-[13px] mt-0.5 leading-tight truncate" style={{color:subClr||ts}}>{subtitle}</p>}</div>
    {right||<ChevronRight size={18} style={{color:ts,opacity:0.5}}/>}</button>
}

function Tgl({icon:Icon,ibg,ic,label,sub,chk,onChange,tc,ts,border,isLast}:{icon:typeof Moon;ibg:string;ic:string;label:string;sub:string;chk:boolean;onChange:(v:boolean)=>void;tc:string;ts:string;border:string;isLast?:boolean}){
  return <div className="flex items-center gap-3.5 px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer" style={{borderBottom:isLast?'none':`1px solid ${border}`}} onClick={()=>onChange(!chk)}>
    <div className="w-[40px] h-[40px] rounded-[13px] flex items-center justify-center shrink-0" style={{backgroundColor:ibg}}><Icon size={19} strokeWidth={1.6} style={{color:ic}}/></div>
    <div className="flex-1 min-w-0"><p className="text-[15px] font-medium leading-tight" style={{color:tc}}>{label}</p><p className="text-[13px] mt-0.5 leading-tight truncate" style={{color:ts}}>{sub}</p></div>
    <div className={"w-[50px] h-[30px] rounded-full relative transition-colors duration-200 shrink-0 "+(!chk?"bg-white/15":"")} style={{backgroundColor:chk?'#6366f1':undefined}}>
      <div className="absolute top-[3px] w-[24px] h-[24px] rounded-full bg-white shadow-md transition-all duration-200" style={{left:chk?'23px':'3px'}}/></div></div>
}

function Radio({label,sel,onClick,ac,tc,border,isLast}:{label:string;sel:boolean;onClick:()=>void;ac:string;tc:string;border:string;isLast?:boolean}){
  return <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left" style={{borderBottom:isLast?'none':`1px solid ${border}`}}>
    <span className="text-[15px] font-medium" style={{color:tc}}>{label}</span>
    <div className="w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-colors shrink-0" style={{borderColor:sel?ac:'rgba(255,255,255,0.15)',backgroundColor:sel?ac:'transparent'}}>
      {sel&&<Check size={14} strokeWidth={3} style={{color:'#fff'}}/>}</div></button>
}
/* ── WallpaperPicker ── */
function WallpaperPicker({onBack}:{onBack:()=>void}){
  const store=useChatSettingsStore();const{lang}=useLang();const fileRef=useRef<HTMLInputElement>(null);
  const T=(ru:string,en:string)=>lang==='ru'?ru:en;
  const presets=[{id:'none',color:'#18181f',l:T('Без обоев','No wallpaper')},{id:'pattern',color:'/pattern.svg',l:T('Pattern','Pattern')},{id:'state',color:'/state.png',l:T('State','State')},{id:'g1',color:'linear-gradient(135deg,#1a1a2e,#16213e)',l:T('Ночь','Night')},{id:'g2',color:'linear-gradient(135deg,#0f2027,#203a43,#2c5364)',l:T('Океан','Ocean')},{id:'g3',color:'linear-gradient(135deg,#1e130c,#9a8478)',l:T('Тепло','Warm')},{id:'g4',color:'linear-gradient(135deg,#0f0c29,#302b63,#24243e)',l:T('Сумерки','Twilight')},{id:'g5',color:'linear-gradient(135deg,#1a1a2e,#4a1942)',l:T('Закат','Sunset')}];
  return <div className="flex flex-col h-full w-full overflow-hidden safe-top" style={{backgroundColor:'#18181f'}}>
    <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0 border-b border-white/[0.06]">
      <button onClick={onBack} className="p-1.5 -ml-1 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08]"><ArrowLeft size={22}/></button>
      <h2 className="text-lg font-semibold text-white flex-1">{T('Обои','Wallpaper')}</h2></div>
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-3 gap-3 mb-5">
        {presets.map(p=><button key={p.id} onClick={()=>{if(p.id==='none'){store.setWallpaper(null);onBack();return}store.setWallpaper(p.color);onBack()}} className="aspect-[9/16] rounded-xl overflow-hidden relative group transition-transform active:scale-95" style={p.color.startsWith('/')?{backgroundImage:`url(${p.color})`,backgroundSize:'cover',backgroundPosition:'center'}:{background:p.color}}>
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30"><span className="text-white text-xs font-medium text-center px-1">{p.l}</span></div>
          {store.wallpaper===p.color&&<div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center"><Check size={14} className="text-white"/></div>}
        </button>)}</div>
      <button onClick={()=>fileRef.current?.click()} className="w-full py-3 rounded-xl text-sm font-medium text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors flex items-center justify-center gap-2"><Image size={18}/> {T('Выбрать из галереи','Choose from gallery')}</button>
      <input ref={fileRef} type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{store.setWallpaper(r.result as string);onBack()};r.readAsDataURL(f)}} className="hidden"/>
    </div></div>
}
/* ── UsernameColorPicker ── */
function UsernameColorPicker({onBack}:{onBack:()=>void}){
  const{user}=useAuthStore();const store=useChatSettingsStore();const{lang}=useLang();
  const T=(ru:string,en:string)=>lang==='ru'?ru:en;const dn=user?.displayName||user?.username||'User';
  const colors=['#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e','#10b981','#14b8a6','#06b6d4','#0ea5e9','#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e','#64748b','#ffffff','#6b7280'];
  return <div className="flex flex-col h-full w-full overflow-hidden safe-top" style={{backgroundColor:'#18181f'}}>
    <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0 border-b border-white/[0.06]">
      <button onClick={onBack} className="p-1.5 -ml-1 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08]"><ArrowLeft size={22}/></button>
      <h2 className="text-lg font-semibold text-white flex-1">{T('Цвет имени','Name Color')}</h2>
      <button onClick={onBack} className="px-4 py-1.5 rounded-lg text-sm font-medium text-white bg-violet-500 hover:bg-violet-600">{T('Готово','Done')}</button></div>
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center"><p className="text-sm text-white/40 mb-2">{T('Предпросмотр','Preview')}</p>
      <p className="text-2xl font-bold" style={{color:store.usernameColor}}>{dn}</p></div>
      <div className="flex flex-wrap justify-center gap-3 max-w-[300px]">
        {colors.map(c=><button key={c} onClick={()=>store.setUsernameColor(c)} className="w-[42px] h-[42px] rounded-full transition-transform active:scale-90 relative"
          style={{backgroundColor:c,transform:store.usernameColor===c?'scale(1.15)':'scale(1)',border:store.usernameColor===c?'3px solid #fff':'3px solid transparent',boxShadow:store.usernameColor===c?`0 0 12px ${c}80`:'none'}}>
          {store.usernameColor===c&&<Check size={18} className="text-white absolute inset-0 m-auto" strokeWidth={3}/>}</button>)}</div>
    </div></div>
}
/* ── ThemeSettingsView ── */
function ThemeSettingsView({onBack}:{onBack:()=>void}){
  const store=useChatSettingsStore();const{lang}=useLang();const T=(ru:string,en:string)=>lang==='ru'?ru:en;const cs=store.themeCustomSettings;
  const fields:{key:keyof typeof cs;l:string;le:string}[]=[{key:'customBg',l:'Фон',le:'Background'},{key:'customSurface',l:'Поверхность',le:'Surface'},{key:'customAccent',l:'Акцент',le:'Accent'},{key:'customBubbleMy',l:'Мои сообщения',le:'My messages'},{key:'customBubbleOther',l:'Чужие сообщения',le:'Others messages'},{key:'customText',l:'Текст',le:'Text'},{key:'customTextSecondary',l:'Втор. текст',le:'Secondary text'}];
  return <div className="flex flex-col h-full w-full overflow-hidden safe-top" style={{backgroundColor:'#18181f'}}>
    <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0 border-b border-white/[0.06]">
      <button onClick={onBack} className="p-1.5 -ml-1 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08]"><ArrowLeft size={22}/></button>
      <h2 className="text-lg font-semibold text-white flex-1">{T('Настройки темы','Theme Settings')}</h2></div>
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div className="rounded-2xl p-4 space-y-3" style={{backgroundColor:cs.customBg}}>
        <div className="rounded-xl p-3" style={{backgroundColor:cs.customSurface}}><p className="text-sm font-medium" style={{color:cs.customText}}>{T('Предпросмотр','Preview')}</p><p className="text-xs mt-1" style={{color:cs.customTextSecondary}}>{T('Так будет выглядеть интерфейс','This is how UI will look')}</p></div>
        <div className="flex gap-2"><div className="flex-1 rounded-xl p-3" style={{background:`linear-gradient(135deg,${cs.customBubbleMy},${cs.customBubbleMyTo})`}}><p className="text-xs" style={{color:cs.customText}}>{T('Моё сообщение','My message')}</p></div>
        <div className="flex-1 rounded-xl p-3" style={{background:`linear-gradient(135deg,${cs.customBubbleOther},${cs.customBubbleOtherTo})`}}><p className="text-xs" style={{color:cs.customTextSecondary}}>{T('Чужое сообщение','Others message')}</p></div></div>
        <div className="h-2 rounded-full" style={{backgroundColor:cs.customAccent}}/></div>
      {fields.map(f=><div key={f.key} className="flex items-center justify-between"><span className="text-sm text-white">{T(f.l,f.le)}</span>
        <div className="flex items-center gap-2"><input type="color" value={cs[f.key] as string} onChange={e=>store.setThemeCustomSettings({[f.key]:e.target.value})} className="w-8 h-8 rounded-lg border-0 cursor-pointer"/>
        <span className="text-xs text-white/40 w-[60px] text-right font-mono">{cs[f.key]}</span></div></div>)}
      <div><div className="flex items-center justify-between mb-1"><span className="text-sm text-white">{T('Прозрачность','Transparency')}</span><span className="text-xs text-white/60">{cs.transparency}%</span></div>
        <input type="range" min={30} max={100} step={5} value={cs.transparency} onChange={e=>store.setThemeCustomSettings({transparency:Number(e.target.value)})}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{background:`linear-gradient(to right,#6366f1 ${(cs.transparency-30)/70*100}%,rgba(255,255,255,0.1) ${(cs.transparency-30)/70*100}%)`,accentColor:'#6366f1'}}/></div>
      <button onClick={onBack} className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-colors" style={{backgroundColor:'#6366f1'}}>{T('Сохранить','Save')}</button>
    </div></div>
}
/* ── AnimationsSettings ── */
function AnimationsSettings({onBack}:{onBack:()=>void}){
  const store=useChatSettingsStore();const{lang}=useLang();const T=(ru:string,en:string)=>lang==='ru'?ru:en;
  const anims:{id:typeof store.animationMode;l:string;le:string;d:string;de:string}[]=[{id:'all',l:'Все анимации',le:'All animations',d:'Полная анимация интерфейса',de:'Full interface animation'},{id:'reduced',l:'Уменьшенные анимации',le:'Reduced animations',d:'Экономия заряда батареи',de:'Battery saving'},{id:'off',l:'Отключить анимации',le:'Disable animations',d:'Максимальная экономия',de:'Maximum savings'}];
  return <div className="flex flex-col h-full w-full overflow-hidden safe-top" style={{backgroundColor:'#18181f'}}>
    <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0 border-b border-white/[0.06]">
      <button onClick={onBack} className="p-1.5 -ml-1 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08]"><ArrowLeft size={22}/></button>
      <h2 className="text-lg font-semibold text-white flex-1">{T('Анимации','Animations')}</h2></div>
    <div className="flex-1 p-4 space-y-3">
      {anims.map(a=><button key={a.id} onClick={()=>store.setAnimationMode(a.id)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all text-left active:scale-[0.98]"
        style={{backgroundColor:store.animationMode===a.id?'#6366f120':'#1e1e2a',border:store.animationMode===a.id?'1px solid #6366f140':'1px solid transparent'}}>
        <div className="w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center shrink-0"
          style={{borderColor:store.animationMode===a.id?'#6366f1':'rgba(255,255,255,0.15)',backgroundColor:store.animationMode===a.id?'#6366f1':'transparent'}}>
          {store.animationMode===a.id&&<Check size={14} strokeWidth={3} className="text-white"/>}</div>
        <div><p className="text-sm font-medium text-white">{T(a.l,a.le)}</p><p className="text-xs text-white/30">{T(a.d,a.de)}</p></div></button>)}
    </div></div>
}

/* ── StickersSettings ── */
function StickersSettings({onBack}:{onBack:()=>void}){
  const store=useChatSettingsStore();const{lang}=useLang();const T=(ru:string,en:string)=>lang==='ru'?ru:en;const s=store.stickerSettings;
  const items:{key:keyof typeof s;icon:typeof Sticker;ibg:string;ic:string;l:string;le:string;d:string;de:string}[]=[{key:'autoDownload',icon:Sticker,ibg:'#ec48991a',ic:'#ec4899',l:'Автозагрузка стикеров',le:'Auto-download stickers',d:'Загружать стикеры автоматически',de:'Download stickers automatically'},{key:'showEmoji',icon:Smile,ibg:'#f59e0b1a',ic:'#f59e0b',l:'Отображение эмодзи',le:'Show emoji',d:'Показывать эмодзи в сообщениях',de:'Show emoji in messages'},{key:'enableReactions',icon:Smile,ibg:'#22c55e1a',ic:'#22c55e',l:'Реакции',le:'Reactions',d:'Отправлять и показывать реакции',de:'Send and show reactions'},{key:'animateEmoji',icon:Zap,ibg:'#06b6d41a',ic:'#06b6d4',l:'Анимация эмодзи',le:'Emoji animation',d:'Анимировать эмодзи в чате',de:'Animate emoji in chat'},{key:'animateStickers',icon:Sticker,ibg:'#a855f71a',ic:'#a855f7',l:'Анимация стикеров',le:'Sticker animation',d:'Проигрывать анимированные стикеры',de:'Play animated stickers'}];
  return <div className="flex flex-col h-full w-full overflow-hidden safe-top" style={{backgroundColor:'#18181f'}}>
    <div className="flex items-center gap-3 px-4 h-14 flex-shrink-0 border-b border-white/[0.06]">
      <button onClick={onBack} className="p-1.5 -ml-1 rounded-xl text-white/70 hover:text-white hover:bg-white/[0.08]"><ArrowLeft size={22}/></button>
      <h2 className="text-lg font-semibold text-white flex-1">{T('Стикеры и эмодзи','Stickers & Emoji')}</h2></div>
    <div className="flex-1 overflow-y-auto">
      <div className="mx-4 mt-4 mb-5 rounded-[20px] overflow-hidden" style={{backgroundColor:'#1e1e2a'}}>
        {items.map((item,idx)=><div key={item.key} className="flex items-center gap-3.5 px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
          style={{borderBottom:idx===items.length-1?'none':'1px solid rgba(255,255,255,0.06)'}} onClick={()=>store.setStickerSettings({[item.key]:!s[item.key]})}>
          <div className="w-[40px] h-[40px] rounded-[13px] flex items-center justify-center shrink-0" style={{backgroundColor:item.ibg}}><item.icon size={19} strokeWidth={1.6} style={{color:item.ic}}/></div>
          <div className="flex-1 min-w-0"><p className="text-[15px] font-medium text-white leading-tight">{T(item.l,item.le)}</p><p className="text-[13px] text-white/30 mt-0.5 leading-tight">{T(item.d,item.de)}</p></div>
          <div className={"w-[50px] h-[30px] rounded-full relative transition-colors duration-200 shrink-0 "+(!s[item.key]?"bg-white/15":"")} style={{backgroundColor:s[item.key]?'#6366f1':undefined}}>
            <div className="absolute top-[3px] w-[24px] h-[24px] rounded-full bg-white shadow-md transition-all duration-200" style={{left:s[item.key]?'23px':'3px'}}/></div></div>)}
      </div></div></div>
}

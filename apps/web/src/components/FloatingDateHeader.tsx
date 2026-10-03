import { memo } from 'react';

interface FloatingDateHeaderProps {
  /** Подпись даты текущей видимой группы сообщений. */
  label: string | null;
  /** Показывать ли заголовок (виден только во время/сразу после скролла). */
  visible: boolean;
  /**
   * Отступ сверху: под шапкой чата и, если есть, под плашкой закреплённого
   * сообщения. Передаётся готовым CSS-значением из ChatView.
   */
  top: string;
}

/**
 * «Плавающая» дата поверх списка сообщений (как в Telegram).
 *
 * Почему отдельным оверлеем, а не `position: sticky` на разделителе:
 * ряды виртуального списка абсолютно позиционированы (`transform`), поэтому
 * каждый ряд становится containing block для своего sticky-потомка — бейдж
 * прилипал бы к верху, но оставался запертым внутри собственного ряда.
 * Оверлей живёт ВНЕ виртуального контента, поэтому свободно висит над списком.
 *
 * Компонент — «глупый»: он не подписан на store и не знает про виртуализатор,
 * получает только готовую подпись. Это важно, чтобы частые обновления при
 * скролле не задевали список сообщений.
 */
const FloatingDateHeader = memo(function FloatingDateHeader({
  label,
  visible,
  top,
}: FloatingDateHeaderProps) {
  if (!label) return null;

  return (
    <div
      className="absolute left-0 right-0 z-[16] flex justify-center pointer-events-none"
      style={{ top }}
      aria-hidden={!visible}
    >
      <span
        // Те же классы, что у обычного разделителя даты, — вид не меняется.
        className={`px-3 py-1 rounded-full text-[13px] font-medium text-zinc-300 bg-[#0000008a] transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {label}
      </span>
    </div>
  );
});

export default FloatingDateHeader;

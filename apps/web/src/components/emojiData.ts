// Emoji data abstraction over @emoji-mart/data
import data from '@emoji-mart/data';

export interface EmojiData {
  id: string;
  name: string;
  native: string;
  unified: string;
  keywords: string[];
  skins: { unified: string; native: string }[];
  version: number;
}

export interface CategoryData {
  id: string;
  emojis: EmojiData[];
}

// Build a flat map of all emojis from the data
const raw = data as {
  categories: { id: string; emojis: string[] }[];
  emojis: Record<string, any>;
  aliases: Record<string, string>;
};

// Resolve alias → canonical id
function resolveId(id: string): string {
  let current = id;
  while (raw.aliases[current]) {
    current = raw.aliases[current];
  }
  return current;
}

const emojiMap = new Map<string, EmojiData>();

function buildEmojiData(id: string): EmojiData {
  const resolved = resolveId(id);
  const cached = emojiMap.get(resolved);
  if (cached) return cached;

  const src = raw.emojis[resolved];
  if (!src) {
    // Fallback: return minimal data
    const fallback: EmojiData = { id: resolved, name: resolved, native: '�', unified: '', keywords: [], skins: [], version: 1 };
    emojiMap.set(resolved, fallback);
    return fallback;
  }

  const primarySkin = src.skins?.[0];
  const entry: EmojiData = {
    id: resolved,
    name: src.name || resolved,
    native: primarySkin?.native || '�',
    unified: primarySkin?.unified || '',
    keywords: src.keywords || [],
    skins: (src.skins || []).map((s: any) => ({ unified: s.unified, native: s.native })),
    version: src.version || 1,
  };
  emojiMap.set(resolved, entry);
  return entry;
}

export function getEmojiById(id: string): EmojiData | undefined {
  const resolved = resolveId(id);
  return buildEmojiData(resolved);
}

export function getCategories(): CategoryData[] {
  return raw.categories.map((cat) => {
    const seen = new Set<string>();
    const emojis: EmojiData[] = [];
    for (const eid of cat.emojis) {
      const emoji = buildEmojiData(eid);
      if (!seen.has(emoji.id)) {
        seen.add(emoji.id);
        emojis.push(emoji);
      }
    }
    return { id: cat.id, emojis };
  });
}

export function searchEmojis(query: string, limit = 60): EmojiData[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: EmojiData[] = [];
  const seen = new Set<string>();

  for (const cat of raw.categories) {
    for (const eid of cat.emojis) {
      if (results.length >= limit) break;
      const emoji = buildEmojiData(eid);
      if (seen.has(emoji.id)) continue;

      const nameMatch = emoji.name.toLowerCase().includes(q);
      const kwMatch = emoji.keywords.some((k) => k.toLowerCase().includes(q));
      if (nameMatch || kwMatch) {
        seen.add(emoji.id);
        results.push(emoji);
      }
    }
    if (results.length >= limit) break;
  }

  return results;
}

// Pre-build the map on import
raw.categories.forEach((cat) => cat.emojis.forEach((eid) => buildEmojiData(eid)));

/**
 * Метаданные категорий в стиле Telegram: контурная иконка в строке категорий
 * и ключ локализации для заголовка секции в сетке.
 */
export const CATEGORY_META: Record<string, { icon: CategoryIconName; labelKey: CategoryLabelKey }> = {
  people: { icon: 'smile', labelKey: 'emojiSmileys' },
  nature: { icon: 'cat', labelKey: 'emojiNature' },
  foods: { icon: 'apple', labelKey: 'emojiFood' },
  activity: { icon: 'activity', labelKey: 'emojiActivity' },
  places: { icon: 'car', labelKey: 'emojiPlaces' },
  objects: { icon: 'bulb', labelKey: 'emojiObjects' },
  symbols: { icon: 'hash', labelKey: 'emojiSymbols' },
  flags: { icon: 'flag', labelKey: 'emojiFlags' },
};

export type CategoryIconName =
  | 'recent'
  | 'smile'
  | 'cat'
  | 'apple'
  | 'activity'
  | 'car'
  | 'bulb'
  | 'hash'
  | 'flag';

export type CategoryLabelKey =
  | 'emojiRecent'
  | 'emojiSmileys'
  | 'emojiNature'
  | 'emojiFood'
  | 'emojiActivity'
  | 'emojiPlaces'
  | 'emojiObjects'
  | 'emojiSymbols'
  | 'emojiFlags';

/** Идентификатор секции «Недавние» — не приходит из emoji-mart, добавляется нами */
export const RECENT_CATEGORY_ID = 'recent';

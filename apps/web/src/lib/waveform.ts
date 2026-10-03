/**
 * Waveform голосовых сообщений.
 *
 * Основной путь (production): пики считаются ОДИН раз у отправителя из уже
 * работающего `AnalyserNode` во время записи и уезжают на сервер вместе с media
 * (`MediaItem.waveform`). Получателю остаётся отрисовать 28 маленьких чисел —
 * никакого `fetch` + `decodeAudioData` в пути рендера списка сообщений.
 *
 * Fallback (`extractWaveform`) нужен только для старых сообщений, записанных до
 * появления серверного waveform. Он намеренно сделан максимально «дешёвым»:
 *   - один общий кеш результата (LRU) — повторный decode одного URL невозможен;
 *   - дедупликация одновременных запросов через кеш Promise;
 *   - глобальный лимит параллелизма (1 decode за раз) — 4 голосовых рядом
 *     больше не поднимают 4 AudioContext и не качают 4 файла одновременно;
 *   - AudioContext закрывается, AudioBuffer не удерживается в памяти.
 */

/** Стандартное число столбиков waveform в интерфейсе. */
export const WAVEFORM_BARS = 28;

/** Ограничение размера кеша — храним только маленькие number[], не AudioBuffer. */
const MAX_CACHE_ENTRIES = 120;

/** Сколько decode-операций разрешено одновременно. */
const MAX_CONCURRENT_DECODES = 1;

/**
 * LRU-кеш готовых waveform.
 * Map сохраняет порядок вставки, поэтому «самый старый» ключ — первый.
 */
const waveformCache = new Map<string, number[]>();

/** Кеш незавершённых вычислений: два пузыря не запустят два одинаковых decode. */
const inFlight = new Map<string, Promise<number[]>>();

let activeDecodes = 0;
const decodeQueue: Array<() => void> = [];

function cacheGet(url: string): number[] | undefined {
  const cached = waveformCache.get(url);
  if (!cached) return undefined;
  // Обновляем «свежесть» ключа для LRU-вытеснения.
  waveformCache.delete(url);
  waveformCache.set(url, cached);
  return cached;
}

function cacheSet(url: string, bars: number[]): void {
  waveformCache.set(url, bars);
  while (waveformCache.size > MAX_CACHE_ENTRIES) {
    const oldest = waveformCache.keys().next();
    if (oldest.done) break;
    waveformCache.delete(oldest.value);
  }
}

/** Ждёт своей очереди на decode, чтобы не держать несколько AudioContext сразу. */
function acquireDecodeSlot(): Promise<void> {
  if (activeDecodes < MAX_CONCURRENT_DECODES) {
    activeDecodes++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    decodeQueue.push(() => {
      activeDecodes++;
      resolve();
    });
  });
}

function releaseDecodeSlot(): void {
  activeDecodes = Math.max(0, activeDecodes - 1);
  const next = decodeQueue.shift();
  if (next) next();
}

/** Ровный «серый» waveform — показываем, пока нет данных или при ошибке. */
export function flatWaveform(bars: number = WAVEFORM_BARS): number[] {
  return Array<number>(bars).fill(0.5);
}

/**
 * Приводит произвольный набор амплитуд к `bars` значениям в диапазоне [0, 1].
 *
 * Используется и при записи (ресемпл кадров AnalyserNode), и при fallback-декоде.
 */
export function normalizeWaveform(peaks: number[], bars: number = WAVEFORM_BARS): number[] {
  if (peaks.length === 0) return flatWaveform(bars);

  const buckets: number[] = [];
  const perBucket = peaks.length / bars;

  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * perBucket);
    const end = Math.min(peaks.length, Math.max(start + 1, Math.floor((i + 1) * perBucket)));
    let peak = 0;
    for (let j = start; j < end; j++) {
      const value = Math.abs(peaks[j]);
      if (value > peak) peak = value;
    }
    buckets.push(peak);
  }

  let max = 0;
  for (const value of buckets) {
    if (value > max) max = value;
  }
  if (max <= 0) return flatWaveform(bars);

  return buckets.map((value) => Math.min(1, value / max));
}

/**
 * Возвращает waveform из кеша, если он уже посчитан.
 * Позволяет отрисовать волну синхронно, без промиса и лишнего ререндера.
 */
export function getCachedWaveform(url: string): number[] | undefined {
  return cacheGet(url);
}

async function decodeWaveform(url: string, bars: number): Promise<number[]> {
  await acquireDecodeSlot();

  let audioCtx: AudioContext | undefined;
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return flatWaveform(bars);

    audioCtx = new AudioCtor();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBar = Math.max(1, Math.floor(channelData.length / bars));
    const peaks: number[] = [];

    for (let i = 0; i < bars; i++) {
      let peak = 0;
      const start = i * samplesPerBar;
      // Сэмплируем подмножество: полный проход по сотням тысяч отсчётов не нужен.
      const step = Math.max(1, Math.floor(samplesPerBar / 200));
      for (let j = 0; j < samplesPerBar; j += step) {
        const abs = Math.abs(channelData[start + j] || 0);
        if (abs > peak) peak = abs;
      }
      peaks.push(peak);
    }

    // AudioBuffer больше не нужен — закрываем контекст сразу, чтобы
    // декодированные сэмплы могли быть собраны GC.
    await audioCtx.close();
    audioCtx = undefined;

    const normalized = normalizeWaveform(peaks, bars);
    cacheSet(url, normalized);
    return normalized;
  } catch {
    if (audioCtx) audioCtx.close().catch(() => {});
    return flatWaveform(bars);
  } finally {
    releaseDecodeSlot();
  }
}

/**
 * Fallback: извлекает waveform из самого аудиофайла.
 *
 * Вызывать только если у media нет готового `waveform` с сервера.
 */
export function extractWaveform(url: string, bars: number = WAVEFORM_BARS): Promise<number[]> {
  const cached = cacheGet(url);
  if (cached) return Promise.resolve(cached);

  const pending = inFlight.get(url);
  if (pending) return pending;

  const promise = decodeWaveform(url, bars).finally(() => {
    inFlight.delete(url);
  });
  inFlight.set(url, promise);
  return promise;
}

/**
 * Достаёт waveform из media-элемента голосового сообщения.
 * Возвращает null, если сервер его не прислал (старые сообщения).
 */
export function waveformFromMedia(waveform: number[] | null | undefined): number[] | null {
  if (!waveform || waveform.length === 0) return null;
  return waveform;
}

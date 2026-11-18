export interface OhlcBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Sanitizes raw Binance kline arrays into strictly ascending, deduplicated OHLC bars (time in seconds).
 */
export function sanitizeKlinesToOhlc(klines: any[][]): OhlcBar[] {
  if (!Array.isArray(klines) || klines.length === 0) return [];
  const byTime = new Map<number, OhlcBar>();
  for (const k of klines) {
    if (!Array.isArray(k)) continue;
    const t = Math.floor(Number(k[0]) / 1000);
    const o = parseFloat(k[1]);
    const h = parseFloat(k[2]);
    const l = parseFloat(k[3]);
    const c = parseFloat(k[4]);
    if (
      Number.isFinite(t) &&
      t > 0 &&
      Number.isFinite(o) &&
      Number.isFinite(h) &&
      Number.isFinite(l) &&
      Number.isFinite(c)
    ) {
      byTime.set(t, { time: t, open: o, high: h, low: l, close: c });
    }
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

/**
 * Computes safe incremental `series.update()` bars for Lightweight Charts so `update()` is
 * NEVER called with a timestamp older than the series' current last bar time
 * (which causes "Cannot update oldest data").
 */
export function getSafeIncrementalBars(
  uniqueSorted: OhlcBar[],
  currentLastTime: number | null
): { barsToUpdate: OhlcBar[]; needsFullReset: boolean; nextLastTime: number | null } {
  if (!Array.isArray(uniqueSorted) || uniqueSorted.length === 0) {
    return { barsToUpdate: [], needsFullReset: false, nextLastTime: currentLastTime };
  }

  const latestBar = uniqueSorted[uniqueSorted.length - 1];
  if (currentLastTime === null || !Number.isFinite(currentLastTime)) {
    return { barsToUpdate: [], needsFullReset: true, nextLastTime: latestBar.time };
  }

  // Filter strictly to bars with time >= currentLastTime
  const forwardBars = uniqueSorted.filter(b => b.time >= currentLastTime);
  if (forwardBars.length === 0) {
    // Upstream fallback returned stale bars older than current series head; skip without crashing
    return { barsToUpdate: [], needsFullReset: false, nextLastTime: currentLastTime };
  }

  // If multiple new candles appeared (e.g., after background sleep), reset cleanly with full dataset
  if (forwardBars.length > 3) {
    return { barsToUpdate: [], needsFullReset: true, nextLastTime: latestBar.time };
  }

  // Only pass bars in strictly non-decreasing time order >= currentLastTime
  const barsToUpdate: OhlcBar[] = [];
  let cursorTime = currentLastTime;
  for (const bar of forwardBars) {
    if (bar.time >= cursorTime) {
      barsToUpdate.push(bar);
      cursorTime = bar.time;
    }
  }

  return {
    barsToUpdate,
    needsFullReset: false,
    nextLastTime: cursorTime
  };
}

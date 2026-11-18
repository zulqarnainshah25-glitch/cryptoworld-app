export interface OhlcvBackendCandle {
  timestamp: number;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Converts raw Binance kline arrays into the exact OHLCV object format
 * expected by the V7 Momentum + Market Structure backend.
 * Guarantees numeric `timestamp, open, high, low, close, volume` fields
 * and slices the latest `limit` (default 100) valid candles.
 */
export function formatCandlesForV7Backend(
  rawCandles: any[][],
  limit = 100
): OhlcvBackendCandle[] {
  if (!Array.isArray(rawCandles) || rawCandles.length === 0) return [];

  const valid: OhlcvBackendCandle[] = [];
  for (const k of rawCandles) {
    if (!Array.isArray(k) || k.length < 6) continue;
    const timestamp = Number(k[0]);
    const open = Number(k[1]);
    const high = Number(k[2]);
    const low = Number(k[3]);
    const close = Number(k[4]);
    const volume = Number(k[5]);

    if (
      Number.isFinite(timestamp) &&
      timestamp > 0 &&
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close) &&
      Number.isFinite(volume)
    ) {
      valid.push({
        timestamp,
        time: timestamp,
        open,
        high,
        low,
        close,
        volume
      });
    }
  }

  return valid.slice(-Math.max(1, limit));
}

/**
 * Sanitizes and deduplicates warning strings returned by the V7 backend.
 */
export function normalizeWarningsList(rawWarnings: unknown): string[] {
  if (!rawWarnings) return [];
  const items = Array.isArray(rawWarnings)
    ? rawWarnings
    : typeof rawWarnings === 'string'
      ? [rawWarnings]
      : [];

  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const item of items) {
    if (typeof item !== 'string' && typeof item !== 'number') continue;
    const text = String(item).replace(/[<>]/g, '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    cleaned.push(text);
  }

  return cleaned;
}

/**
 * Detects whether a backend warning indicates a Market Structure direction override.
 */
export function isStructureOverrideWarning(warning: string): boolean {
  if (typeof warning !== 'string') return false;
  const upper = warning.toUpperCase();
  return upper.includes('[STRUCTURE OVERRIDE]') || upper.includes('STRUCTURE OVERRIDE');
}

export interface ParsedV7Signal {
  ok: boolean;
  errorMessage?: string;
  direction: 'LONG' | 'SHORT' | 'NO_TRADE';
  badgeLabel: 'BUY' | 'SELL' | 'NO_TRADE';
  isActionable: boolean;
  warnings: string[];
  hasStructureOverride: boolean;
}

/**
 * Parses a V7 Momentum + Market Structure backend response cleanly:
 * - No WAIT_* states (only LONG, SHORT, or NO_TRADE)
 * - Surfaces backend `error: true` failures clearly
 * - Preserves & flags `[STRUCTURE OVERRIDE]` warnings
 */
export function parseV7SignalResponse(res: any): ParsedV7Signal {
  if (!res || typeof res !== 'object' || res.error) {
    return {
      ok: false,
      errorMessage:
        (res && typeof res.message === 'string' && res.message.trim()) ||
        'AI API se signal generate nahi ho saka. Dobara koshish karein.',
      direction: 'NO_TRADE',
      badgeLabel: 'NO_TRADE',
      isActionable: false,
      warnings: [],
      hasStructureOverride: false
    };
  }

  const rawDir = String(res.direction || 'NO_TRADE').toUpperCase().trim();
  const direction: 'LONG' | 'SHORT' | 'NO_TRADE' =
    rawDir === 'LONG' || rawDir === 'BUY' || rawDir === 'BULLISH'
      ? 'LONG'
      : rawDir === 'SHORT' || rawDir === 'SELL' || rawDir === 'BEARISH'
        ? 'SHORT'
        : 'NO_TRADE';

  const isActionable = direction === 'LONG' || direction === 'SHORT';
  const badgeLabel = direction === 'LONG' ? 'BUY' : direction === 'SHORT' ? 'SELL' : 'NO_TRADE';
  const warnings = normalizeWarningsList(res.warnings);
  const hasStructureOverride = warnings.some(isStructureOverrideWarning);

  return {
    ok: true,
    direction,
    badgeLabel,
    isActionable,
    warnings,
    hasStructureOverride
  };
}

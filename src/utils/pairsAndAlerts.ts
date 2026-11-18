export interface CryptoCoin {
  symbol: string;
  name: string;
  classTag: string;
  isMain8: boolean;
  basePrice: number;
  isNewLaunch?: boolean;
  onboardDate?: number;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW';
  createdPrice: number;
  createdAt: number;
  triggered: boolean;
  triggeredAt?: number;
  triggeredPrice?: number;
  note?: string;
}

export type AlertConditionMode = 'AUTO' | 'ABOVE' | 'BELOW';

export const BASE_SUPPORTED_COINS: CryptoCoin[] = [
  // Original 8 Benchmark Pairs
  { symbol: 'BTCUSDT', name: 'Bitcoin', classTag: 'btc', isMain8: true, basePrice: 84500 },
  { symbol: 'ETHUSDT', name: 'Ethereum', classTag: 'eth', isMain8: true, basePrice: 2420 },
  { symbol: 'SOLUSDT', name: 'Solana', classTag: 'sol', isMain8: true, basePrice: 105.5 },
  { symbol: 'BNBUSDT', name: 'Binance Coin', classTag: 'bnb', isMain8: true, basePrice: 725 },
  { symbol: 'XRPUSDT', name: 'Ripple', classTag: 'xrp', isMain8: true, basePrice: 1.85 },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', classTag: 'doge', isMain8: true, basePrice: 0.082 },
  { symbol: 'LINKUSDT', name: 'Chainlink', classTag: 'link', isMain8: true, basePrice: 12.4 },
  { symbol: 'ADAUSDT', name: 'Cardano', classTag: 'ada', isMain8: true, basePrice: 0.52 },
  // Original 7 Trending Altcoins
  { symbol: 'SUIUSDT', name: 'Sui Network', classTag: 'sui', isMain8: false, basePrice: 1.02 },
  { symbol: 'PEPEUSDT', name: 'Pepe', classTag: 'pepe', isMain8: false, basePrice: 0.0000045 },
  { symbol: 'SHIBUSDT', name: 'Shiba Inu', classTag: 'shib', isMain8: false, basePrice: 0.000012 },
  { symbol: 'NEARUSDT', name: 'NEAR Protocol', classTag: 'near', isMain8: false, basePrice: 3.1 },
  { symbol: 'AVAXUSDT', name: 'Avalanche', classTag: 'avax', isMain8: false, basePrice: 19.8 },
  { symbol: 'DOTUSDT', name: 'Polkadot', classTag: 'dot', isMain8: false, basePrice: 4.8 },
  { symbol: 'LTCUSDT', name: 'Litecoin', classTag: 'ltc', isMain8: false, basePrice: 88.5 },
  // +20 Newly Added High-Volume Pairs
  { symbol: 'ARBUSDT', name: 'Arbitrum', classTag: 'arb', isMain8: false, basePrice: 0.48 },
  { symbol: 'OPUSDT', name: 'Optimism', classTag: 'op', isMain8: false, basePrice: 1.15 },
  { symbol: 'APTUSDT', name: 'Aptos', classTag: 'apt', isMain8: false, basePrice: 6.4 },
  { symbol: 'INJUSDT', name: 'Injective', classTag: 'inj', isMain8: false, basePrice: 14.2 },
  { symbol: 'TIAUSDT', name: 'Celestia', classTag: 'tia', isMain8: false, basePrice: 3.85 },
  { symbol: 'SEIUSDT', name: 'Sei Network', classTag: 'sei', isMain8: false, basePrice: 0.28 },
  { symbol: 'WIFUSDT', name: 'dogwifhat', classTag: 'wif', isMain8: false, basePrice: 0.72 },
  { symbol: 'BONKUSDT', name: 'Bonk', classTag: 'bonk', isMain8: false, basePrice: 0.000018 },
  { symbol: 'FLOKIUSDT', name: 'Floki', classTag: 'floki', isMain8: false, basePrice: 0.000095 },
  { symbol: 'FETUSDT', name: 'Artificial Superintelligence', classTag: 'fet', isMain8: false, basePrice: 0.88 },
  { symbol: 'RENDERUSDT', name: 'Render', classTag: 'render', isMain8: false, basePrice: 4.6 },
  { symbol: 'RUNEUSDT', name: 'THORChain', classTag: 'rune', isMain8: false, basePrice: 2.35 },
  { symbol: 'AAVEUSDT', name: 'Aave', classTag: 'aave', isMain8: false, basePrice: 215.0 },
  { symbol: 'UNIUSDT', name: 'Uniswap', classTag: 'uni', isMain8: false, basePrice: 7.9 },
  { symbol: 'ATOMUSDT', name: 'Cosmos', classTag: 'atom', isMain8: false, basePrice: 4.95 },
  { symbol: 'FILUSDT', name: 'Filecoin', classTag: 'fil', isMain8: false, basePrice: 3.4 },
  { symbol: 'TRXUSDT', name: 'TRON', classTag: 'trx', isMain8: false, basePrice: 0.24 },
  { symbol: 'TONUSDT', name: 'Toncoin', classTag: 'ton', isMain8: false, basePrice: 3.65 },
  { symbol: 'ORDIUSDT', name: 'Ordinals', classTag: 'ordi', isMain8: false, basePrice: 12.8 },
  { symbol: 'JUPUSDT', name: 'Jupiter', classTag: 'jup', isMain8: false, basePrice: 0.65 }
];

const VALID_USDT_PAIR_RE = /^[A-Z0-9]{2,15}USDT$/;
const EXCLUDED_PAIRS = new Set([
  'USDCUSDT',
  'FDUSDUSDT',
  'TUSDUSDT',
  'USDPUSDT',
  'BUSDUSDT',
  'BTCDOMUSDT',
  'BTCUPUSDT',
  'BTCDOWNUSDT',
  'ETHUPUSDT',
  'ETHDOWNUSDT',
  'BNBUPUSDT',
  'BNBDOWNUSDT',
  'ADAUPUSDT',
  'ADADOWNUSDT',
  'LINKUPUSDT',
  'LINKDOWNUSDT',
  'XRPUPUSDT',
  'XRPDOWNUSDT',
  'DOTUPUSDT',
  'DOTDOWNUSDT',
  'SOLUPUSDT',
  'SOLDOWNUSDT',
  'UNIUPUSDT',
  'UNIDOWNUSDT'
]);

export function sanitizeSymbol(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
}

export function isValidUsdtTradingPair(rawSymbol: string): boolean {
  const sym = sanitizeSymbol(rawSymbol);
  if (!VALID_USDT_PAIR_RE.test(sym)) return false;
  if (EXCLUDED_PAIRS.has(sym)) return false;
  return true;
}

export function createPriceAlert(input: {
  symbol: string;
  targetPrice: number;
  currentPrice?: number;
  conditionMode?: AlertConditionMode;
  note?: string;
  now?: number;
}): { ok: true; alert: PriceAlert } | { ok: false; error: string } {
  const symbol = sanitizeSymbol(input.symbol);
  if (!symbol || !/^[A-Z0-9]{2,20}$/.test(symbol)) {
    return { ok: false, error: 'Valid crypto pair select karein.' };
  }

  const targetPrice = Number(input.targetPrice);
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    return { ok: false, error: 'Target price 0 se zyada honi chahiye.' };
  }

  const currentPrice = Number(input.currentPrice) || 0;
  const mode = input.conditionMode || 'AUTO';
  const condition: 'ABOVE' | 'BELOW' =
    mode === 'ABOVE' || mode === 'BELOW'
      ? mode
      : (currentPrice > 0 && targetPrice < currentPrice ? 'BELOW' : 'ABOVE');

  const cleanNote = typeof input.note === 'string'
    ? input.note.trim().replace(/[<>]/g, '').slice(0, 80)
    : '';

  const timestamp = input.now ?? Date.now();
  const alert: PriceAlert = {
    id: `ALT-${timestamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    symbol,
    targetPrice,
    condition,
    createdPrice: currentPrice > 0 ? currentPrice : targetPrice,
    createdAt: timestamp,
    triggered: false,
    ...(cleanNote ? { note: cleanNote } : {})
  };

  return { ok: true, alert };
}

export function evaluatePriceAlerts(
  alerts: PriceAlert[],
  priceMap: Record<string, number>,
  now = Date.now()
): { updatedAlerts: PriceAlert[]; newlyTriggered: PriceAlert[] } {
  if (!Array.isArray(alerts) || alerts.length === 0 || !priceMap) {
    return { updatedAlerts: Array.isArray(alerts) ? alerts : [], newlyTriggered: [] };
  }

  const newlyTriggered: PriceAlert[] = [];
  const updatedAlerts = alerts.map(alert => {
    if (!alert || alert.triggered) return alert;
    const livePrice = Number(priceMap[alert.symbol]);
    if (!Number.isFinite(livePrice) || livePrice <= 0) return alert;

    const hit =
      alert.condition === 'ABOVE'
        ? livePrice >= alert.targetPrice
        : livePrice <= alert.targetPrice;

    if (!hit) return alert;

    const triggeredAlert: PriceAlert = {
      ...alert,
      triggered: true,
      triggeredAt: now,
      triggeredPrice: livePrice
    };
    newlyTriggered.push(triggeredAlert);
    return triggeredAlert;
  });

  return { updatedAlerts, newlyTriggered };
}

export function discoverNewLaunchedPairs(
  existingCoins: CryptoCoin[],
  exchangeSymbols: any[],
  priceMap: Record<string, number> = {},
  options?: { now?: number; recentWindowDays?: number; maxAutoPairs?: number }
): { mergedCoins: CryptoCoin[]; newlyAddedCoins: CryptoCoin[] } {
  const now = options?.now ?? Date.now();
  const recentWindowMs = (options?.recentWindowDays ?? 90) * 24 * 60 * 60 * 1000;
  const maxAutoPairs = options?.maxAutoPairs ?? 50;

  const existingMap = new Map<string, CryptoCoin>();
  for (const c of existingCoins) {
    const sym = sanitizeSymbol(c.symbol);
    if (sym) existingMap.set(sym, { ...c, symbol: sym });
  }

  const baseSet = new Set(BASE_SUPPORTED_COINS.map(c => c.symbol));
  const candidates: CryptoCoin[] = [];

  if (Array.isArray(exchangeSymbols)) {
    for (const item of exchangeSymbols) {
      if (!item || typeof item !== 'object') continue;
      const rawSym = String(item.symbol || '');
      if (rawSym.includes('_')) continue; // Exclude quarterly/delivery contracts like BTCUSDT_250627
      const sym = sanitizeSymbol(rawSym);
      if (!isValidUsdtTradingPair(sym)) continue;
      if (item.status && String(item.status).toUpperCase() !== 'TRADING') continue;
      if (item.quoteAsset && String(item.quoteAsset).toUpperCase() !== 'USDT') continue;
      if (item.contractType && String(item.contractType).toUpperCase() !== 'PERPETUAL') continue;

      if (existingMap.has(sym) || baseSet.has(sym)) continue;

      const onboardDate = Number(item.onboardDate) || 0;
      const isRecentlyLaunched = onboardDate > 0 && now - onboardDate <= recentWindowMs;
      const hasLivePrice = Number(priceMap[sym]) > 0;

      // Accept pairs with recent onboardDate OR active trading pairs if onboardDate is omitted by Spot endpoint
      if (isRecentlyLaunched || (onboardDate === 0 && hasLivePrice)) {
        const baseName = String(item.baseAsset || sym.replace(/USDT$/, '')).toUpperCase();
        candidates.push({
          symbol: sym,
          name: `${baseName} (New)`,
          classTag: baseName.toLowerCase().slice(0, 6),
          isMain8: false,
          basePrice: Number(priceMap[sym]) || 1,
          isNewLaunch: true,
          onboardDate: onboardDate || now
        });
      }
    }
  }

  // Sort newest onboardDate first, dedupe and cap
  const uniqueNewMap = new Map<string, CryptoCoin>();
  candidates
    .sort((a, b) => (b.onboardDate || 0) - (a.onboardDate || 0))
    .forEach(c => {
      if (!uniqueNewMap.has(c.symbol)) {
        uniqueNewMap.set(c.symbol, c);
      }
    });

  const existingAutoCount = Array.from(existingMap.values()).filter(c => !baseSet.has(c.symbol)).length;
  const availableSlots = Math.max(0, maxAutoPairs - existingAutoCount);
  const newlyAddedCoins = Array.from(uniqueNewMap.values()).slice(0, availableSlots);

  const mergedCoins = [...existingCoins, ...newlyAddedCoins];
  return { mergedCoins, newlyAddedCoins };
}

export function playPriceAlertTone(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export function sendPriceAlertNotification(title: string, body: string): boolean {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/icon-192.png'
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

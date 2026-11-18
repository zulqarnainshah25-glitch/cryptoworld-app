import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Zap,
  TrendingUp,
  BarChart2,
  User,
  Star,
  Menu,
  X,
  Copy,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Radio,
  Info,
  Send,
  MessageCircle,
  Database,
  Cpu,
  ShieldAlert,
  Film,
  Play,
  Volume2,
  VolumeX,
  Gift,
  ExternalLink,
  Lock,
  Unlock,
  Sparkles,
  Download,
  Users,
  Ticket,
  Sliders,
  LogOut,
  Search,
  Trash2,
  Bell,
  BellRing,
  Plus
} from 'lucide-react';
import { AdMob } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { createChart, CandlestickSeries, ColorType } from 'lightweight-charts';
import {
  BASE_SUPPORTED_COINS,
  CryptoCoin,
  PriceAlert,
  AlertConditionMode,
  createPriceAlert,
  evaluatePriceAlerts,
  discoverNewLaunchedPairs,
  playPriceAlertTone,
  sendPriceAlertNotification,
  isValidUsdtTradingPair
} from './utils/pairsAndAlerts';
import { sanitizeKlinesToOhlc, getSafeIncrementalBars } from './utils/chartHelpers';

// -------------------------------------------------------------
// CONFIGURATION & CONSTANTS
// -------------------------------------------------------------
const CURRENT_APP_VERSION = '1.2.4';

const compareVersions = (v1: string, v2: string): number => {
  const p1 = (v1 || '').replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
  const p2 = (v2 || '').replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
};

export const ADMOB_CONFIG = {
  appId: 'ca-app-pub-8825065858193656~2430855580',
  rewardedAdUnitId: 'ca-app-pub-8825065858193656~2572882851',
  interstitialAdUnitId: 'ca-app-pub-8825065858193656~2381311165',
  appOpenAdUnitId: 'ca-app-pub-8825065858193656/2956162280'
};

const LEGACY_RETIRED_ADMOB_IDS = new Set([
  'ca-app-pub-8825065858193656~5170875046',
  'ca-app-pub-8825065858193656/9953437597',
  'ca-app-pub-8825065858193656~9953437597',
  'ca-app-pub-8825065858193656/2956162280',
  'ca-app-pub-8825065858193656~2956162280'
]);

export const sanitizeAdMobId = (rawId: any, fallbackId: string): string => {
  if (typeof rawId !== 'string') return fallbackId;
  const cleaned = rawId.trim().replace(/[<>"'`;\\]/g, '');
  if (!cleaned || LEGACY_RETIRED_ADMOB_IDS.has(cleaned)) return fallbackId;
  if (!/^ca-app-pub-\d{16}[~/]\d+$/.test(cleaned)) return fallbackId;
  return cleaned;
};

/**
 * Converts any stored AdMob Ad Unit ID (whether using '~' or '/') into the strict
 * 'ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY' slash format required by Google Mobile Ads Android SDK.
 */
export const toNativeAdUnitId = (rawId: any, fallbackId: string): string => {
  const valid = sanitizeAdMobId(rawId, fallbackId);
  return valid.replace('~', '/');
};

// Obfuscated internal vault resolver (never exposed in UI or plain-text source)
const _ENC_VAULT_BYTES = [
  107, 61, 5, 60, 14, 31, 14, 17, 21, 23, 41, 61, 11, 21, 9, 98, 48, 104,
  24, 48, 98, 48, 22, 49, 111, 44, 63, 63, 24, 51, 40, 111, 34, 60, 28, 57,
  35, 28, 106, 25, 40, 8, 49, 19
];
export const resolveVaultRef = (): string => {
  const envVal = (import.meta as any)?.env?.VITE_GOOGLE_SHEET_ID;
  if (envVal && typeof envVal === 'string' && envVal.trim().length > 10) {
    return envVal.trim();
  }
  return _ENC_VAULT_BYTES.map(b => String.fromCharCode(b ^ 0x5a)).join('');
};

const BACKEND_CONFIG = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbzxKNv2JGtgAbLohzkvTwN5it7Xl3iKSKb6RK228k7JQxUnl-OPPKaXrjq5v-eaj9XrPQ/exec'
};

const KEYS = {
  USER: 'cw_username',
  USERS_DB: 'cw_users_db',
  DEVICE_ID: 'cw_device_id',
  JOURNAL_GLOBAL: 'cw_signal_journal_global',
  JOURNAL_USER_PREFIX: 'cw_signal_journal_user_',
  CODES: 'cw_premium_codes',
  SUGGESTIONS: 'cw_suggestions',
  SHARES: 'cw_shares_history',
  AD_CONFIG: 'cw_ad_network_config',
  PRICE_ALERTS: 'cw_price_alerts',
  AUTO_PAIRS: 'cw_auto_discovered_pairs'
};

export const DEFAULT_AD_CONFIG = {
  network: 'admob' as 'admob' | 'adsterra' | 'monetag',
  appId: ADMOB_CONFIG.appId,
  rewardedAdUnitId: ADMOB_CONFIG.rewardedAdUnitId,
  interstitialAdUnitId: ADMOB_CONFIG.interstitialAdUnitId,
  appOpenAdUnitId: ADMOB_CONFIG.interstitialAdUnitId,
  adsterraDirectLink: '',
  monetagZoneId: ''
};

export const mergeAdConfig = (prev: typeof DEFAULT_AD_CONFIG, fetched: any): typeof DEFAULT_AD_CONFIG => {
  if (!fetched || typeof fetched !== 'object') return prev;
  const rawNet = String(fetched.network || prev.network || DEFAULT_AD_CONFIG.network).toLowerCase();
  const network: 'admob' | 'adsterra' | 'monetag' =
    rawNet === 'adsterra' || rawNet === 'monetag' ? rawNet : 'admob';
  const appId = sanitizeAdMobId(fetched.appId ?? prev.appId, ADMOB_CONFIG.appId);
  const rewardedAdUnitId = sanitizeAdMobId(
    fetched.rewardedAdUnitId ?? prev.rewardedAdUnitId,
    ADMOB_CONFIG.rewardedAdUnitId
  );
  const rawInterstitial =
    fetched.interstitialAdUnitId ||
    fetched.appOpenAdUnitId ||
    prev.interstitialAdUnitId ||
    prev.appOpenAdUnitId;
  const interstitialAdUnitId = sanitizeAdMobId(rawInterstitial, ADMOB_CONFIG.interstitialAdUnitId);
  const rawAppOpen =
    fetched.appOpenAdUnitId ||
    fetched.interstitialAdUnitId ||
    prev.appOpenAdUnitId ||
    prev.interstitialAdUnitId;
  const appOpenAdUnitId = sanitizeAdMobId(rawAppOpen, ADMOB_CONFIG.interstitialAdUnitId);

  return {
    network,
    appId,
    rewardedAdUnitId,
    interstitialAdUnitId,
    appOpenAdUnitId,
    adsterraDirectLink:
      fetched.adsterraDirectLink !== undefined
        ? String(fetched.adsterraDirectLink).trim()
        : (prev.adsterraDirectLink || ''),
    monetagZoneId:
      fetched.monetagZoneId !== undefined
        ? String(fetched.monetagZoneId).trim()
        : (prev.monetagZoneId || '')
  };
};

export const buildOpeningAdCandidates = (config: typeof DEFAULT_AD_CONFIG) => {
  const interstitialNativeId = toNativeAdUnitId(
    config?.interstitialAdUnitId,
    ADMOB_CONFIG.interstitialAdUnitId
  );
  const configuredAppOpenNativeId = toNativeAdUnitId(
    config?.appOpenAdUnitId,
    ADMOB_CONFIG.interstitialAdUnitId
  );
  const dedicatedAppOpenNativeId = ADMOB_CONFIG.appOpenAdUnitId.replace('~', '/');

  const appOpenIds = Array.from(
    new Set([configuredAppOpenNativeId, dedicatedAppOpenNativeId, interstitialNativeId].filter(Boolean))
  );
  const interstitialIds = Array.from(
    new Set([interstitialNativeId, configuredAppOpenNativeId].filter(Boolean))
  );

  return { appOpenIds, interstitialIds };
};

const PLAN_LIMITS: Record<string, number> = {
  FREE: 1,
  BASIC: 5,
  PRO: 10,
  ELITE: 20
};

const SUPPORTED_COINS: CryptoCoin[] = BASE_SUPPORTED_COINS;

interface TradingSignal {
  id: string;
  sheetRow?: number;
  symbol: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT' | 'NO_TRADE';
  signalDirection?: 'LONG' | 'SHORT' | 'NEUTRAL';
  entryStatus: 'READY' | 'NO_TRADE';
  currentPrice: number;
  entry: number;
  suggestedEntry?: number;
  triggerPrice?: number;
  invalidationPrice?: number;
  entryImproved?: boolean;
  stopLoss: number;
  takeProfit: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Hit?: boolean;
  tp2Hit?: boolean;
  tp3Hit?: boolean;
  targetHit?: string;
  rr: number | string;
  suggestedRR?: number | string;
  confidence: number;
  directionConfidence?: number;
  entryConfidence?: number;
  signalQuality: 'STRONG' | 'MODERATE' | 'WEAK' | 'N/A';
  signalQualityDetails?: string;
  signalQualityScore?: string;
  model: string;
  timestamp: number;
  resolved: boolean;
  outcome: 'WIN' | 'LOSS' | 'OPEN' | 'EXPIRED' | null;
  closedPrice?: number;
  closedTime?: string;
  reasoning?: string;
  warnings?: string[];
  userId?: string;
  userDisplayName?: string;
}

interface UserProfile {
  username: string;
  plan: 'FREE' | 'BASIC' | 'PRO' | 'ELITE';
  planBaseQuota: number;
  dailyQuotaLeft: number;
  lastResetDate: string;
  referralCode: string;
  referralsCount: number;
  referralBonus: number;
  isSheetVerified?: boolean;
}

// -------------------------------------------------------------
// PRICE FORMATTING & TARGET NORMALIZER HELPERS
// -------------------------------------------------------------
export const formatCryptoPrice = (val: number | undefined | null): string => {
  const n = Number(val) || 0;
  if (n === 0) return '0.00';
  if (Math.abs(n) < 0.0001) return n.toFixed(8);
  if (Math.abs(n) < 1) return n.toFixed(4);
  if (Math.abs(n) < 10) return n.toFixed(3);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const normalizeSignalTargets = (s: any): TradingSignal => {
  const rawDir = String(s.direction || '').toUpperCase().trim();
  const normDir: TradingSignal['direction'] =
    rawDir === 'BUY' || rawDir === 'LONG' || rawDir === 'BULLISH'
      ? 'LONG'
      : rawDir === 'SELL' || rawDir === 'SHORT' || rawDir === 'BEARISH'
        ? 'SHORT'
        : 'NO_TRADE';
  const isLong = normDir === 'LONG';
  const entry = Number(s.entry) || Number(s.currentPrice) || (s.symbol === 'PEPEUSDT' ? 0.0000045 : 100);

  // 1. Stop Loss validation
  let sl = Number(s.stopLoss);
  if (!sl || sl <= 0 || (isLong && sl >= entry) || (!isLong && sl <= entry)) {
    const slDist = entry * 0.01;
    sl = isLong ? (entry - slDist) : (entry + slDist);
  }

  // 2. Take Profit (T2) validation - Check all possible backend response aliases
  const riskDist = Math.abs(entry - sl);
  let rawTp = Number(s.takeProfit) || Number(s.tp2) || Number(s.tp) || Number(s.target) || Number(s.targetPrice);
  let rewardDist = Math.abs(rawTp - entry);

  if (!rawTp || rawTp <= 0 || rewardDist <= 0 || (isLong && rawTp <= entry) || (!isLong && rawTp >= entry)) {
    // Default 1:2 Risk to Reward, or at least 2% distance
    rewardDist = riskDist > 0 ? (riskDist * 2) : (entry * 0.02);
    rawTp = isLong ? (entry + rewardDist) : (entry - rewardDist);
  }

  // 3. T2 (Main TP / 100% target)
  let tp2 = Number(s.tp2);
  if (!tp2 || tp2 <= 0 || (isLong && tp2 <= entry) || (!isLong && tp2 >= entry)) {
    tp2 = rawTp;
  }

  // 4. T1 (Secured TP - 50% target distance)
  let tp1 = Number(s.tp1);
  if (!tp1 || tp1 <= 0 || (isLong && (tp1 <= entry || tp1 >= tp2)) || (!isLong && (tp1 >= entry || tp1 <= tp2))) {
    tp1 = isLong ? (entry + rewardDist * 0.5) : (entry - rewardDist * 0.5);
  }

  // 5. T3 (Runner TP - 150% target distance)
  let tp3 = Number(s.tp3);
  if (!tp3 || tp3 <= 0 || (isLong && tp3 <= tp2) || (!isLong && (tp3 >= tp2 || tp3 <= 0))) {
    const minPositive = entry < 1 ? 0.0000001 : 0.01;
    tp3 = isLong ? (entry + rewardDist * 1.5) : Math.max(minPositive, entry - rewardDist * 1.5);
  }

  const decimals = entry < 0.001 ? 8 : (entry < 1 ? 4 : 2);
  const roundDec = (val: number) => Number(val.toFixed(decimals));

  const rEntry = roundDec(entry);
  const rSl = roundDec(sl);
  const rTp1 = roundDec(tp1);
  const rTp2 = roundDec(tp2);
  const rTp3 = roundDec(tp3);

  const checkPrice = Number(s.closedPrice) || Number(s.currentPrice) || 0;
  const hit1 = Boolean(s.tp1Hit || s.outcome === 'WIN' || s.targetHit === 'TP1' || s.targetHit === 'TP2' || s.targetHit === 'TP3' || (checkPrice > 0 && (isLong ? checkPrice >= rTp1 : checkPrice <= rTp1)));
  const hit2 = Boolean(s.tp2Hit || s.outcome === 'WIN' || s.targetHit === 'TP2' || s.targetHit === 'TP3' || (checkPrice > 0 && (isLong ? checkPrice >= rTp2 : checkPrice <= rTp2)));
  const hit3 = Boolean(s.tp3Hit || s.targetHit === 'TP3' || (checkPrice > 0 && (isLong ? checkPrice >= rTp3 : checkPrice <= rTp3)));

  return {
    ...s,
    direction: normDir,
    entry: rEntry,
    stopLoss: rSl,
    takeProfit: rTp2,
    tp1: rTp1,
    tp2: rTp2,
    tp3: rTp3,
    tp1Hit: hit1,
    tp2Hit: hit2,
    tp3Hit: hit3
  };
};

export const computeTargetHits = (sig: TradingSignal, livePrice: number, progressPct = 0) => {
  const rawDir = String(sig.direction || '').toUpperCase().trim();
  const isLong = rawDir === 'LONG' || rawDir === 'BUY' || rawDir === 'BULLISH';
  const effectivePrice = sig.resolved
    ? (Number(sig.closedPrice) || livePrice || Number(sig.entry))
    : (livePrice || Number(sig.currentPrice) || Number(sig.entry));
  const tp1 = Number(sig.tp1) || 0;
  const tp2 = Number(sig.tp2) || Number(sig.takeProfit) || 0;
  const tp3 = Number(sig.tp3) || 0;
  const sl = Number(sig.stopLoss) || 0;

  const priceHitT1 = effectivePrice > 0 && tp1 > 0 && (isLong ? effectivePrice >= tp1 : effectivePrice <= tp1);
  const priceHitT2 = effectivePrice > 0 && tp2 > 0 && (isLong ? effectivePrice >= tp2 : effectivePrice <= tp2);
  const priceHitT3 = effectivePrice > 0 && tp3 > 0 && (isLong ? effectivePrice >= tp3 : effectivePrice <= tp3);
  const priceHitSL = effectivePrice > 0 && sl > 0 && (isLong ? effectivePrice <= sl : effectivePrice >= sl);

  const t3Hit = Boolean(sig.tp3Hit || sig.targetHit === 'TP3' || priceHitT3 || progressPct >= 149.5);
  const t2Hit = Boolean(t3Hit || sig.tp2Hit || sig.outcome === 'WIN' || sig.targetHit === 'TP2' || priceHitT2 || progressPct >= 99.5);
  const t1Hit = Boolean(t2Hit || sig.tp1Hit || sig.targetHit === 'TP1' || priceHitT1 || progressPct >= 49.5);
  const slHit = Boolean(!t2Hit && (sig.outcome === 'LOSS' || sig.targetHit === 'SL' || priceHitSL || progressPct <= -99.5));

  return { t1Hit, t2Hit, t3Hit, slHit };
};

// -------------------------------------------------------------
// MAIN COMPONENT
// -------------------------------------------------------------
export default function App() {
  const [activeTab, setActiveTab] = useState<'signals' | 'progress' | 'chart' | 'account' | 'admin'>('signals');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // In-App Update Checker State (Feature 1)
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateData, setUpdateData] = useState<{ downloadUrl: string; latestVersion: string; releaseNotes: string } | null>(null);

  // Super Admin In-App Dashboard State (Feature 2)
  const [adminSubTab, setAdminSubTab] = useState<'licenses' | 'users' | 'ads'>('licenses');
  const [adminLoginModalOpen, setAdminLoginModalOpen] = useState(false);
  const [adminInputKey, setAdminInputKey] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);

  // VIP Licenses State (Synced with Google Sheet PremiumCodes Tab)
  const [adminCodes, setAdminCodes] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem(KEYS.CODES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [adminCodesLoading, setAdminCodesLoading] = useState(false);
  const [adminCodeGenerating, setAdminCodeGenerating] = useState(false);
  const [adminCodeFilter, setAdminCodeFilter] = useState<'ALL' | 'UNUSED' | 'USED' | 'BASIC' | 'PRO' | 'ELITE'>('ALL');
  const [adminSinglePlan, setAdminSinglePlan] = useState<'BASIC' | 'PRO' | 'ELITE'>('PRO');
  const [adminSingleDuration, setAdminSingleDuration] = useState(30);

  // Users State
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUserSearch, setAdminUserSearch] = useState('');
  const [adminResetModalOpen, setAdminResetModalOpen] = useState(false);
  const [adminResetTargetUser, setAdminResetTargetUser] = useState('');
  const [adminNewUserPassword, setAdminNewUserPassword] = useState('');
  const [adminResetModalMsg, setAdminResetModalMsg] = useState('');

  // Ads Config State for Admin Panel
  const [adminAdSettings, setAdminAdSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(KEYS.AD_CONFIG);
      return saved ? mergeAdConfig(DEFAULT_AD_CONFIG, JSON.parse(saved)) : DEFAULT_AD_CONFIG;
    } catch {
      return DEFAULT_AD_CONFIG;
    }
  });

  // User State (Strictly initialized from localStorage - Clears any legacy default credentials)
  const [user, setUser] = useState<UserProfile | null>(() => {
    const savedUser = localStorage.getItem(KEYS.USER);
    if (savedUser && savedUser === 'guest') {
      localStorage.removeItem(KEYS.USER);
      return null;
    }
    if (savedUser) {
      const rawDb = localStorage.getItem(KEYS.USERS_DB);
      const db = rawDb ? JSON.parse(rawDb) : {};
      if (db[savedUser]) return db[savedUser];
      return {
        username: savedUser,
        plan: 'FREE',
        planBaseQuota: 1,
        dailyQuotaLeft: 1,
        lastResetDate: new Date().toDateString(),
        referralCode: savedUser.substring(0, 4).toUpperCase() + '2026',
        referralsCount: 0,
        referralBonus: 0,
        isSheetVerified: false
      };
    }
    return null; // Strictly force Login on any new device / session
  });

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSheetSyncing, setIsSheetSyncing] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authRefCode, setAuthRefCode] = useState('');
  const [authError, setAuthError] = useState('');
  const [redeemCode, setRedeemCode] = useState('');

  // Google AdMob Real Video, App Open & Interstitial Ads State
  const [isAdLoading, setIsAdLoading] = useState(false);
  const [isInterstitialLoading, setIsInterstitialLoading] = useState(false);
  const [adConfig, setAdConfig] = useState(() => {
    try {
      const saved = localStorage.getItem(KEYS.AD_CONFIG);
      const merged = saved ? mergeAdConfig(DEFAULT_AD_CONFIG, JSON.parse(saved)) : DEFAULT_AD_CONFIG;
      localStorage.setItem(KEYS.AD_CONFIG, JSON.stringify(merged));
      return merged;
    } catch {
      return DEFAULT_AD_CONFIG;
    }
  });
  const adConfigRef = useRef(adConfig);
  useEffect(() => {
    adConfigRef.current = adConfig;
  }, [adConfig]);

  // Single-flight locks & SDK warm-up trackers for reliable Android App Opening Ads
  const admobInitPromiseRef = useRef<Promise<boolean> | null>(null);
  const isOpeningAdBusyRef = useRef(false);
  const lastOpeningAdShownAtRef = useRef(0);
  const lastBackgroundedAtRef = useRef(0);

  const saveAdConfig = (newConfig: typeof DEFAULT_AD_CONFIG) => {
    const merged = mergeAdConfig(DEFAULT_AD_CONFIG, newConfig);
    setAdConfig(merged);
    setAdminAdSettings(merged);
    localStorage.setItem(KEYS.AD_CONFIG, JSON.stringify(merged));
    showToast('AdMob settings mehfooz ho gayi hain!', 'success');
  };



  // Market & Pricing + Auto-Discovered Pairs + Price Alerts
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({});
  const [marketChanges, setMarketChanges] = useState<Record<string, number>>({});
  const marketPricesRef = useRef<Record<string, number>>({});
  useEffect(() => {
    marketPricesRef.current = marketPrices;
  }, [marketPrices]);

  const [allCoins, setAllCoins] = useState<CryptoCoin[]>(() => {
    try {
      const raw = localStorage.getItem(KEYS.AUTO_PAIRS);
      if (raw) {
        const saved: CryptoCoin[] = JSON.parse(raw);
        if (Array.isArray(saved)) {
          const baseSet = new Set(BASE_SUPPORTED_COINS.map(c => c.symbol));
          const validSaved = saved.filter(
            c => c && isValidUsdtTradingPair(c.symbol) && !baseSet.has(c.symbol)
          );
          return [...BASE_SUPPORTED_COINS, ...validSaved];
        }
      }
    } catch {}
    return BASE_SUPPORTED_COINS;
  });
  const allCoinsRef = useRef<CryptoCoin[]>(allCoins);
  useEffect(() => {
    allCoinsRef.current = allCoins;
  }, [allCoins]);
  const [isSyncingNewPairs, setIsSyncingNewPairs] = useState(false);
  const [pairSearchQuery, setPairSearchQuery] = useState('');

  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>(() => {
    try {
      const raw = localStorage.getItem(KEYS.PRICE_ALERTS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const priceAlertsRef = useRef<PriceAlert[]>(priceAlerts);
  useEffect(() => {
    priceAlertsRef.current = priceAlerts;
    try {
      localStorage.setItem(KEYS.PRICE_ALERTS, JSON.stringify(priceAlerts));
    } catch {}
  }, [priceAlerts]);
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [alertSymbol, setAlertSymbol] = useState('BTCUSDT');
  const [alertTargetInput, setAlertTargetInput] = useState('');
  const [alertConditionMode, setAlertConditionMode] = useState<AlertConditionMode>('AUTO');
  const [alertNoteInput, setAlertNoteInput] = useState('');
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [triggeredAlertBanner, setTriggeredAlertBanner] = useState<PriceAlert | null>(null);

  const [selectedCoin, setSelectedCoin] = useState('BTCUSDT');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  const [selectedModel, setSelectedModel] = useState('GEMINI');

  // Generator & Scanner
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [currentSignal, setCurrentSignal] = useState<TradingSignal | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);

  // App Launch & Loading Sequence (Fast Boot)
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(25);
  const [loadingStatus, setLoadingStatus] = useState('Booting CryptoWorld AI...');

  // Device Lock Alert Modal
  const [deviceLockAlert, setDeviceLockAlert] = useState<{ open: boolean; message: string; existingUser?: string } | null>(null);

  // Journals & Accuracy (Strictly Google Sheets Global Database)
  const [statsScope] = useState<'GLOBAL'>('GLOBAL');
  const [chartEngine, setChartEngine] = useState<'LIGHTWEIGHT' | 'TRADINGVIEW'>('LIGHTWEIGHT');
  const [isChartLoading, setIsChartLoading] = useState(false);
  const lwChartContainerRef = useRef<HTMLDivElement | null>(null);
  const lwCandleSeriesRef = useRef<any>(null);
  const lwLastCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);
  const lwPriceLinesRef = useRef<any[]>([]);
  const [globalJournal, setGlobalJournal] = useState<TradingSignal[]>([]);
  const [, setUserJournal] = useState<TradingSignal[]>([]);
  const [sheetAccuracy, setSheetAccuracy] = useState({
    totalClosed: 0,
    wins: 0,
    losses: 0,
    expired: 0,
    winRate: 0,
    tp1Wins: 0,
    tp2Wins: 0,
    tp3Wins: 0
  });

  // Feedback State
  const [feedbackCategory, setFeedbackCategory] = useState('FEATURE');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [userSuggestions, setUserSuggestions] = useState<any[]>([]);

  // Toast System
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // -------------------------------------------------------------
  // APPS SCRIPT BACKEND CALLER (With Auto Device ID & Sheet ID Injection)
  // -------------------------------------------------------------
  const callBackend = useCallback(async (action: string, payload: any = {}) => {
    let devId = localStorage.getItem(KEYS.DEVICE_ID);
    if (!devId) {
      devId = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem(KEYS.DEVICE_ID, devId);
    }

    const requestBody = JSON.stringify({
      action,
      deviceId: devId,
      sheetId: resolveVaultRef(),
      ...payload
    });

    // 1. Direct browser fetch with text/plain (bypasses CORS preflight)
    try {
      const direct = await fetch(BACKEND_CONFIG.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: requestBody,
        redirect: 'follow'
      });
      if (direct.ok) return await direct.json();
    } catch (e) {
      // fallback to proxy
    }

    // 2. Server Proxy Fallback
    try {
      const res = await fetch('/api/apps-script-backend', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: requestBody
      });
      if (res.ok) return await res.json();
    } catch {}

    return { error: true, message: 'Google Apps Script se rabta nahi ho saka.' };
  }, []);

  // -------------------------------------------------------------
  // FETCH SHEET ACCURACY (Direct from Google Sheet Journal tab)
  // -------------------------------------------------------------
  const fetchSheetAccuracy = useCallback(async (isRetry = false) => {
    try {
      const rep = await callBackend('accuracy');
      if (rep && !rep.error && rep.totalClosed !== undefined) {
        const winsVal = Number(rep.wins) || 0;
        const lossesVal = Number(rep.losses) || 0;
        const closedVal = Number(rep.totalClosed) || (winsVal + lossesVal);
        const parsedWr = typeof rep.winRate === 'string'
          ? parseFloat(rep.winRate.replace(/[^0-9.]/g, '')) || 0
          : (Number(rep.winRate) || 0);
        setSheetAccuracy({
          totalClosed: closedVal,
          wins: winsVal,
          losses: lossesVal,
          expired: Number(rep.expired) || 0,
          winRate: parsedWr,
          tp1Wins: Number(rep.tp1Wins) || winsVal,
          tp2Wins: Number(rep.tp2Wins) || winsVal,
          tp3Wins: Number(rep.tp3Wins) || 0
        });
      } else if (!isRetry) {
        setTimeout(() => fetchSheetAccuracy(true), 1500);
      }
    } catch (e) {
      if (!isRetry) {
        setTimeout(() => fetchSheetAccuracy(true), 1500);
      }
      console.warn('Accuracy fetch error:', e);
    }
  }, [callBackend]);

  // -------------------------------------------------------------
  // FETCH GLOBAL AD CONFIG (From Google Sheet on startup & foreground)
  // -------------------------------------------------------------
  const fetchGlobalAdConfig = useCallback(async () => {
    try {
      const res = await callBackend('get_ad_config');
      const fetched = res?.config || (res?.network || res?.appId || res?.rewardedAdUnitId || res?.interstitialAdUnitId ? res : null);
      if (fetched && !res.error) {
        setAdConfig((prev: typeof DEFAULT_AD_CONFIG) => {
          const merged = mergeAdConfig(prev, fetched);
          localStorage.setItem(KEYS.AD_CONFIG, JSON.stringify(merged));
          return merged;
        });

        setAdminAdSettings((prev: typeof DEFAULT_AD_CONFIG) => mergeAdConfig(prev, fetched));
      }
    } catch (e) {
      console.warn('[AdConfig] Global config fetch fallback to local/defaults:', e);
    }
  }, [callBackend]);

  // -------------------------------------------------------------
  // GOOGLE SHEET USER & QUOTA VERIFICATION
  // -------------------------------------------------------------
  const verifyAndSyncWithGoogleSheet = useCallback(async (username: string): Promise<number | null> => {
    if (!username || username === 'guest') return null;
    setIsSheetSyncing(true);
    try {
      const res = await callBackend('quota', { username: username.trim() });
      if (res && !res.error && res.signalsLeft !== undefined && res.signalsLeft !== null) {
        const fresh = Math.max(0, Number(res.signalsLeft));
        const planFromSheet = String(res.premiumPlan || 'FREE').toUpperCase() as any;
        const quotaLimit = Number(res.quotaLimit) || PLAN_LIMITS[planFromSheet] || 1;

        setUser(prev => {
          const current: UserProfile = prev || {
            username: username.trim(),
            plan: planFromSheet,
            planBaseQuota: quotaLimit,
            dailyQuotaLeft: fresh,
            lastResetDate: new Date().toDateString(),
            referralCode: username.substring(0, 4).toUpperCase(),
            referralsCount: 0,
            referralBonus: 0,
            isSheetVerified: true
          };

          const updated: UserProfile = {
            ...current,
            dailyQuotaLeft: fresh,
            planBaseQuota: quotaLimit,
            plan: planFromSheet,
            isSheetVerified: true
          };

          try {
            const rawDb = localStorage.getItem(KEYS.USERS_DB);
            const db = rawDb ? JSON.parse(rawDb) : {};
            db[username.trim()] = updated;
            localStorage.setItem(KEYS.USERS_DB, JSON.stringify(db));
          } catch {}

          return updated;
        });

        return fresh;
      }
      if (res && res.error && res.message && res.message.includes('User nahi mila')) {
        setUser(prev => prev ? { ...prev, isSheetVerified: false } : null);
      }
      return null;
    } catch {
      return null;
    } finally {
      setIsSheetSyncing(false);
    }
  }, [callBackend]);

  const handleManualSheetSync = async () => {
    if (!user?.username) {
      showToast('Pehle login karein!', 'info');
      setLoginModalOpen(true);
      return;
    }
    showToast('Google Sheet se sync ho raha hai...', 'info');
    fetchOpenSignalsFromSheet();
    const fresh = await verifyAndSyncWithGoogleSheet(user.username);
    if (fresh !== null) {
      showToast(`✅ Google Sheet Synced! Quota: ${fresh.toFixed(2)} signals`, 'success');
    } else {
      showToast('⚠️ Google Sheet se rabta nahi ho saka ya user nahi mila.', 'error');
    }
  };

  const loadUserProfile = (username: string, password?: string) => {
    const rawDb = localStorage.getItem(KEYS.USERS_DB);
    const db = rawDb ? JSON.parse(rawDb) : {};
    let profile = db[username];

    if (!profile) {
      profile = {
        username,
        password: password || '',
        plan: 'FREE',
        planBaseQuota: 1,
        dailyQuotaLeft: 1,
        lastResetDate: new Date().toDateString(),
        referralCode: username.substring(0, 4).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase(),
        referralsCount: 0,
        referralBonus: 0,
        isSheetVerified: false
      };
      db[username] = profile;
      localStorage.setItem(KEYS.USERS_DB, JSON.stringify(db));
    } else if (password) {
      profile.password = password;
      db[username] = profile;
      localStorage.setItem(KEYS.USERS_DB, JSON.stringify(db));
    }

    const today = new Date().toDateString();
    if (profile.lastResetDate !== today) {
      profile.dailyQuotaLeft = profile.planBaseQuota || PLAN_LIMITS[profile.plan] || 1;
      profile.lastResetDate = today;
      db[username] = profile;
      localStorage.setItem(KEYS.USERS_DB, JSON.stringify(db));
    }

    setUser(profile);
  };

  const loadJournals = () => {
    try {
      const rawGlobal = localStorage.getItem(KEYS.JOURNAL_GLOBAL);
      if (rawGlobal) {
        const parsed: TradingSignal[] = JSON.parse(rawGlobal);
        const seedIds = ['SIG-DEC-01', 'SIG-DEC-02', 'SIG-DEC-03'];
        const cleaned = parsed.filter((s: any) =>
          !seedIds.includes(s.id) &&
          s.userId?.toLowerCase() !== 'waleedshah1' &&
          s.userId?.toLowerCase() !== 'waleedsha1' &&
          !s.resolved &&
          (!s.outcome || String(s.outcome).toUpperCase() === 'OPEN')
        );
        const sanitized = cleaned.map(s => normalizeSignalTargets(s));
        setGlobalJournal(sanitized);
        localStorage.setItem(KEYS.JOURNAL_GLOBAL, JSON.stringify(sanitized));
      } else {
        setGlobalJournal([]);
      }
    } catch {
      setGlobalJournal([]);
    }

    const uname = localStorage.getItem(KEYS.USER);
    if (!uname || uname === 'guest') {
      setUserJournal([]);
      return;
    }
    try {
      const rawUser = localStorage.getItem(`${KEYS.JOURNAL_USER_PREFIX}${uname}`);
      if (rawUser) {
        const parsedUser: TradingSignal[] = JSON.parse(rawUser);
        const sanitizedUser = parsedUser.map(s => normalizeSignalTargets(s));
        setUserJournal(sanitizedUser);
        localStorage.setItem(`${KEYS.JOURNAL_USER_PREFIX}${uname}`, JSON.stringify(sanitizedUser));
      } else {
        setUserJournal([]);
      }
    } catch {
      setUserJournal([]);
    }
  };

  // Guard to prevent duplicate update_outcome calls for the same Google Sheet row
  const resolvingRowsRef = useRef<Set<number>>(new Set());

  const fetchKlinesForSymbol = useCallback(async (symbol: string, interval = '1h', limit = 200): Promise<any[][]> => {
    // Priority #1: Binance Futures API (fapi.binance.com) for accurate Futures tracking, then Spot fallbacks
    const klineEndpoints = [
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      `/api/binance-klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    ];
    for (const url of klineEndpoints) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            return data;
          }
        }
      } catch {}
    }
    return [];
  }, []);

  // -------------------------------------------------------------
  // REAL-TIME SIGNAL EVALUATION & GOOGLE SHEET RECORDING (TP & SL)
  // -------------------------------------------------------------
  const evaluateActiveSignalsLive = useCallback((priceMap: Record<string, number>, klinesMap: Record<string, any[][]> = {}) => {
    const processSignal = (rawS: TradingSignal) => {
      const s = normalizeSignalTargets(rawS);
      if (s.direction !== 'LONG' && s.direction !== 'SHORT') {
        return { sig: s, isNewlyResolved: false, isHitEvent: false, hitEventLabel: '' };
      }

      const livePrice = priceMap[s.symbol] || s.currentPrice || 0;
      const symbolKlines = klinesMap[s.symbol];

      // If already resolved as WIN, ensure tp1Hit/tp2Hit flags are synchronized
      if (s.resolved) {
        if (s.outcome === 'WIN' && (!s.tp1Hit || !s.tp2Hit)) {
          return {
            sig: { ...s, tp1Hit: true, tp2Hit: true },
            isNewlyResolved: false,
            isHitEvent: false,
            hitEventLabel: ''
          };
        }
        return { sig: s, isNewlyResolved: false, isHitEvent: false, hitEventLabel: '' };
      }

      if (!livePrice && (!symbolKlines || symbolKlines.length === 0)) {
        return { sig: s, isNewlyResolved: false, isHitEvent: false, hitEventLabel: '' };
      }

      const isLong = s.direction === 'LONG';
      const tpTarget = Number(s.takeProfit) || Number(s.tp2);
      const slTarget = Number(s.stopLoss);

      let outcome: 'WIN' | 'LOSS' | null = null;
      let targetHit = s.targetHit || 'OPEN';
      let tp1Hit = Boolean(s.tp1Hit);
      let tp2Hit = Boolean(s.tp2Hit);
      let tp3Hit = Boolean(s.tp3Hit);
      let closedPrice = s.closedPrice;
      let closedTime = s.closedTime;
      let hitEventLabel = '';

      // 1. Check historical Binance FAPI / Spot candles (High/Low) after signal timestamp
      if (Array.isArray(symbolKlines) && symbolKlines.length > 0) {
        for (const k of symbolKlines) {
          const openTime = Number(k[0]);
          const high = parseFloat(k[2]);
          const low = parseFloat(k[3]);
          const closeTime = Number(k[6]) || Date.now();
          if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
          if (openTime < s.timestamp) continue;

          if (isLong) {
            if (high >= tpTarget) {
              outcome = 'WIN';
              targetHit = high >= s.tp3 ? 'TP3' : 'TP2';
              tp1Hit = true;
              tp2Hit = true;
              tp3Hit = high >= s.tp3;
              closedPrice = tpTarget;
              closedTime = new Date(closeTime).toISOString();
              hitEventLabel = targetHit;
              break;
            }
            if (low <= slTarget) {
              outcome = 'LOSS';
              targetHit = 'SL';
              closedPrice = slTarget;
              closedTime = new Date(closeTime).toISOString();
              hitEventLabel = 'SL';
              break;
            }
            if (high >= s.tp1 && !tp1Hit) {
              tp1Hit = true;
              targetHit = 'TP1';
              hitEventLabel = 'TP1';
            }
          } else {
            if (low <= tpTarget) {
              outcome = 'WIN';
              targetHit = low <= s.tp3 ? 'TP3' : 'TP2';
              tp1Hit = true;
              tp2Hit = true;
              tp3Hit = low <= s.tp3;
              closedPrice = tpTarget;
              closedTime = new Date(closeTime).toISOString();
              hitEventLabel = targetHit;
              break;
            }
            if (high >= slTarget) {
              outcome = 'LOSS';
              targetHit = 'SL';
              closedPrice = slTarget;
              closedTime = new Date(closeTime).toISOString();
              hitEventLabel = 'SL';
              break;
            }
            if (low <= s.tp1 && !tp1Hit) {
              tp1Hit = true;
              targetHit = 'TP1';
              hitEventLabel = 'TP1';
            }
          }
        }
      }

      // 2. Direct livePrice check against TakeProfit (TP2/TP3), TP1, and StopLoss
      if (!outcome && livePrice && livePrice > 0) {
        if (isLong) {
          if (livePrice >= tpTarget) {
            outcome = 'WIN';
            targetHit = livePrice >= s.tp3 ? 'TP3' : 'TP2';
            tp1Hit = true;
            tp2Hit = true;
            tp3Hit = livePrice >= s.tp3;
            closedPrice = tpTarget;
            closedTime = new Date().toISOString();
            hitEventLabel = targetHit;
          } else if (livePrice <= slTarget) {
            outcome = 'LOSS';
            targetHit = 'SL';
            closedPrice = slTarget;
            closedTime = new Date().toISOString();
            hitEventLabel = 'SL';
          } else if (livePrice >= s.tp1 && !tp1Hit) {
            tp1Hit = true;
            targetHit = 'TP1';
            hitEventLabel = 'TP1';
          }
        } else {
          if (livePrice <= tpTarget) {
            outcome = 'WIN';
            targetHit = livePrice <= s.tp3 ? 'TP3' : 'TP2';
            tp1Hit = true;
            tp2Hit = true;
            tp3Hit = livePrice <= s.tp3;
            closedPrice = tpTarget;
            closedTime = new Date().toISOString();
            hitEventLabel = targetHit;
          } else if (livePrice >= slTarget) {
            outcome = 'LOSS';
            targetHit = 'SL';
            closedPrice = slTarget;
            closedTime = new Date().toISOString();
            hitEventLabel = 'SL';
          } else if (livePrice <= s.tp1 && !tp1Hit) {
            tp1Hit = true;
            targetHit = 'TP1';
            hitEventLabel = 'TP1';
          }
        }
      }

      const isNewlyResolved = outcome !== null && !s.resolved;
      const isHitEvent = (tp1Hit && !s.tp1Hit) || (tp2Hit && !s.tp2Hit) || (tp3Hit && !s.tp3Hit);
      const hasHitUpdate =
        s.direction !== rawS.direction ||
        tp1Hit !== s.tp1Hit ||
        tp2Hit !== s.tp2Hit ||
        tp3Hit !== s.tp3Hit ||
        isNewlyResolved;

      if (hasHitUpdate) {
        const updatedSig: TradingSignal = {
          ...s,
          resolved: outcome !== null,
          outcome: outcome || s.outcome,
          targetHit,
          tp1Hit,
          tp2Hit,
          tp3Hit,
          closedPrice: closedPrice || livePrice || s.entry,
          closedTime: outcome !== null ? (closedTime || new Date().toISOString()) : s.closedTime
        };
        return { sig: updatedSig, isNewlyResolved, isHitEvent, hitEventLabel };
      }
      return { sig: s, isNewlyResolved: false, isHitEvent: false, hitEventLabel: '' };
    };

    setGlobalJournal(prev => {
      let anyChanged = false;
      const newlyResolvedSignals: TradingSignal[] = [];

      const updatedList = prev.map(s => {
        const { sig, isNewlyResolved, isHitEvent, hitEventLabel } = processSignal(s);
        if (sig !== s) {
          anyChanged = true;
          if (isNewlyResolved) {
            newlyResolvedSignals.push(sig);
          } else if (isHitEvent && hitEventLabel === 'TP1') {
            showToast(`🎯 ${sig.symbol} TP1 Hit! Signal runner active for main Take Profit.`, 'success');
          }
        }
        return sig;
      });

      if (newlyResolvedSignals.length > 0) {
        for (const sig of newlyResolvedSignals) {
          const rowKey = sig.sheetRow && sig.sheetRow > 0 ? sig.sheetRow : 0;
          if (rowKey > 0 && !resolvingRowsRef.current.has(rowKey)) {
            resolvingRowsRef.current.add(rowKey);
            callBackend('update_outcome', {
              id: sig.id,
              row: rowKey,
              sheetRow: rowKey,
              outcome: sig.outcome,
              closedPrice: sig.closedPrice,
              exitPrice: sig.closedPrice,
              closedTime: sig.closedTime,
              symbol: sig.symbol,
              coin: sig.symbol,
              targetHit: sig.targetHit,
              tp1Hit: sig.tp1Hit ? 'YES' : 'NO',
              tp2Hit: sig.tp2Hit ? 'YES' : 'NO',
              tp3Hit: sig.tp3Hit ? 'YES' : 'NO'
            }).then(() => fetchSheetAccuracy()).catch(console.warn);
          }

          // Immediately record the closed trade in Wins (TP Hit) or Losses (SL Hit) stats
          setSheetAccuracy(prevAcc => {
            const isWin = sig.outcome === 'WIN';
            const nextWins = isWin ? prevAcc.wins + 1 : prevAcc.wins;
            const nextLosses = !isWin ? prevAcc.losses + 1 : prevAcc.losses;
            const nextClosed = Math.max(prevAcc.totalClosed + 1, nextWins + nextLosses);
            const nextWr = nextClosed > 0 ? Number(((nextWins / nextClosed) * 100).toFixed(1)) : 0;
            return {
              ...prevAcc,
              totalClosed: nextClosed,
              wins: nextWins,
              losses: nextLosses,
              winRate: nextWr,
              tp1Wins: isWin ? prevAcc.tp1Wins + 1 : prevAcc.tp1Wins,
              tp2Wins: isWin ? prevAcc.tp2Wins + 1 : prevAcc.tp2Wins,
              tp3Wins: isWin && sig.tp3Hit ? prevAcc.tp3Wins + 1 : prevAcc.tp3Wins
            };
          });

          if (sig.outcome === 'WIN') {
            showToast(
              `🏆 ${sig.symbol} Trade Closed with WIN (${sig.targetHit} Hit)! Wins mein record ho gaya.`,
              'success'
            );
          } else {
            showToast(
              `🛑 ${sig.symbol} Stop Loss Hit! Losses mein record ho gaya.`,
              'error'
            );
          }
        }
      }

      // Keep strictly ONLY open / unresolved signals in globalJournal so closed trades never show in the list
      const activeOnly = updatedList.filter(
        s => !s.resolved && (!s.outcome || s.outcome === 'OPEN')
      );

      if (anyChanged || activeOnly.length !== prev.length) {
        localStorage.setItem(KEYS.JOURNAL_GLOBAL, JSON.stringify(activeOnly));
        return activeOnly;
      }
      return prev;
    });
  }, [callBackend, fetchSheetAccuracy]);

  const fetchMarketTickers = useCallback(async (extraSignals?: TradingSignal[] | any) => {
    try {
      const priceMap: Record<string, number> = {};
      const changeMap: Record<string, number> = {};

      // Collect all open trade symbols from localStorage & extraSignals so even non-SUPPORTED_COINS (e.g. SHIBUSDT) are tracked
      const openSymbolsSet = new Set<string>();
      if (Array.isArray(extraSignals)) {
        for (const s of extraSignals) {
          if (s && s.symbol) openSymbolsSet.add(s.symbol);
        }
      }
      try {
        const rawG = localStorage.getItem(KEYS.JOURNAL_GLOBAL);
        if (rawG) {
          const parsedG: TradingSignal[] = JSON.parse(rawG);
          for (const s of parsedG) {
            if (s && s.symbol) openSymbolsSet.add(s.symbol);
          }
        }
      } catch {}

      // Priority #1: Binance Futures FAPI 24hr Ticker, then Spot fallbacks
      const endpoints = [
        'https://fapi.binance.com/fapi/v1/ticker/24hr',
        'https://data-api.binance.vision/api/v3/ticker/24hr',
        'https://api.binance.com/api/v3/ticker/24hr'
      ];

      let allTickers: any[] | null = null;
      for (const url of endpoints) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              allTickers = data;
              break;
            }
          }
        } catch {}
      }

      if (allTickers) {
        for (const item of allTickers) {
          if (item.symbol && item.lastPrice) {
            const p = parseFloat(item.lastPrice);
            if (p > 0) {
              priceMap[item.symbol] = p;
              changeMap[item.symbol] = parseFloat(item.priceChangePercent || '0');
            }
          }
        }
      }

      // If any open signal symbol (like SHIBUSDT on Spot) is missing from priceMap, fetch its price directly
      for (const sym of openSymbolsSet) {
        if (!priceMap[sym]) {
          const spotUrls = [
            `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${sym}`,
            `https://data-api.binance.vision/api/v3/ticker/price?symbol=${sym}`,
            `https://api.binance.com/api/v3/ticker/price?symbol=${sym}`
          ];
          for (const sUrl of spotUrls) {
            try {
              const r = await fetch(sUrl);
              if (r.ok) {
                const d = await r.json();
                if (d && d.price) {
                  priceMap[sym] = parseFloat(d.price);
                  break;
                }
              }
            } catch {}
          }
        }
      }

      // Fetch recent 1h candles (high/low) for all open trade symbols via Binance FAPI / Spot
      const klinesMap: Record<string, any[][]> = {};
      if (openSymbolsSet.size > 0) {
        await Promise.all(
          Array.from(openSymbolsSet).map(async sym => {
            const klines = await fetchKlinesForSymbol(sym, '1h', 200);
            if (klines.length > 0) {
              klinesMap[sym] = klines;
            }
          })
        );
      }

      if (Object.keys(priceMap).length > 0 || Object.keys(klinesMap).length > 0) {
        setMarketPrices(prev => ({ ...prev, ...priceMap }));
        setMarketChanges(prev => ({ ...prev, ...changeMap }));
        evaluateActiveSignalsLive(priceMap, klinesMap);

        // Evaluate active user Price Alerts against latest live Binance prices
        if (Object.keys(priceMap).length > 0 && priceAlertsRef.current.length > 0) {
          const { updatedAlerts, newlyTriggered } = evaluatePriceAlerts(priceAlertsRef.current, priceMap);
          if (newlyTriggered.length > 0) {
            setPriceAlerts(updatedAlerts);
            playPriceAlertTone();
            setTriggeredAlertBanner(newlyTriggered[0]);
            newlyTriggered.forEach(hit => {
              const dirTxt = hit.condition === 'ABOVE' ? 'reached above' : 'dropped below';
              const formattedHit = formatCryptoPrice(hit.triggeredPrice || hit.targetPrice);
              const formattedTarget = formatCryptoPrice(hit.targetPrice);
              const alertMsg = `🔔 PRICE ALERT: ${hit.symbol} ${dirTxt} $${formattedTarget} (Live: $${formattedHit})`;
              showToast(alertMsg, 'success');
              sendPriceAlertNotification(`CryptoWorld Price Alert: ${hit.symbol}`, `${hit.symbol} hit $${formattedHit} (Target: $${formattedTarget})`);
            });
          }
        }
      }
    } catch (e) {
      console.warn('Market tickers fetch error:', e);
    }
  }, [evaluateActiveSignalsLive, fetchKlinesForSymbol]);

  // -------------------------------------------------------------
  // AUTO-DISCOVER NEWLY LAUNCHED BINANCE USDT PAIRS
  // -------------------------------------------------------------
  const syncNewlyLaunchedPairs = useCallback(async (silent = false) => {
    setIsSyncingNewPairs(true);
    try {
      const infoEndpoints = [
        'https://fapi.binance.com/fapi/v1/exchangeInfo',
        '/api/binance-exchange-info',
        'https://data-api.binance.vision/api/v3/exchangeInfo'
      ];
      let exchangeSymbols: any[] | null = null;
      for (const url of infoEndpoints) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const json: any = await res.json();
            if (Array.isArray(json?.symbols) && json.symbols.length > 0) {
              exchangeSymbols = json.symbols;
              break;
            }
          }
        } catch {}
      }

      if (!exchangeSymbols) {
        if (!silent) showToast('Binance se naye pairs check nahi ho sake. Baad mein koshish karein.', 'error');
        return;
      }

      const { mergedCoins, newlyAddedCoins } = discoverNewLaunchedPairs(
        allCoinsRef.current,
        exchangeSymbols,
        marketPricesRef.current,
        { recentWindowDays: 90, maxAutoPairs: 50 }
      );

      if (newlyAddedCoins.length > 0) {
        setAllCoins(mergedCoins);
        try {
          const baseSet = new Set(BASE_SUPPORTED_COINS.map(c => c.symbol));
          const autoOnly = mergedCoins.filter(c => !baseSet.has(c.symbol));
          localStorage.setItem(KEYS.AUTO_PAIRS, JSON.stringify(autoOnly));
        } catch {}
        const previewNames = newlyAddedCoins.slice(0, 3).map(c => c.symbol).join(', ');
        showToast(
          `🆕 ${newlyAddedCoins.length} new launched pair${newlyAddedCoins.length > 1 ? 's' : ''} auto-added: ${previewNames}`,
          'success'
        );
        sendPriceAlertNotification(
          'CryptoWorld: New Pairs Added',
          `${newlyAddedCoins.length} newly launched Binance pairs added (${previewNames}).`
        );
      } else if (!silent) {
        showToast(`✅ Sab pairs up-to-date hain (${allCoinsRef.current.length} active pairs).`, 'info');
      }
    } catch (e) {
      console.warn('Auto pair discovery error:', e);
    } finally {
      setIsSyncingNewPairs(false);
    }
  }, []);

  // -------------------------------------------------------------
  // PRICE ALERT HANDLERS
  // -------------------------------------------------------------
  const openAlertModalForCoin = (symbolToSelect?: string) => {
    const targetSym = symbolToSelect || selectedCoin || 'BTCUSDT';
    setAlertSymbol(targetSym);
    const liveP = marketPrices[targetSym] || allCoinsRef.current.find(c => c.symbol === targetSym)?.basePrice || 0;
    setAlertTargetInput(liveP > 0 ? String(liveP) : '');
    setAlertConditionMode('AUTO');
    setAlertNoteInput('');
    setAlertsModalOpen(true);
  };

  const handleRequestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifPermission('unsupported');
      showToast('Browser notifications is device par supported nahi hain (in-app & audio alerts active rahengi).', 'info');
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        showToast('🔔 Push/Browser Notifications enable ho gayin!', 'success');
      } else {
        showToast('Notifications permission deny hui; in-app aur sound alerts active rahengi.', 'info');
      }
    } catch {
      showToast('Notification permission request fail hui.', 'error');
    }
  };

  const handleCreatePriceAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const liveP = marketPrices[alertSymbol] || allCoinsRef.current.find(c => c.symbol === alertSymbol)?.basePrice || 0;
    const res = createPriceAlert({
      symbol: alertSymbol,
      targetPrice: parseFloat(alertTargetInput),
      currentPrice: liveP,
      conditionMode: alertConditionMode,
      note: alertNoteInput
    });

    if (!res.ok) {
      showToast(res.error, 'error');
      return;
    }

    setPriceAlerts(prev => [res.alert, ...prev]);
    setAlertTargetInput('');
    setAlertNoteInput('');
    const dirLabel = res.alert.condition === 'ABOVE' ? 'Above ≥' : 'Below ≤';
    showToast(`🔔 Alert set: ${res.alert.symbol} ${dirLabel} $${formatCryptoPrice(res.alert.targetPrice)}`, 'success');

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(perm => setNotifPermission(perm)).catch(() => {});
    }
  };

  const handleDeletePriceAlert = (id: string) => {
    setPriceAlerts(prev => prev.filter(a => a.id !== id));
    showToast('Price alert remove ho gaya.', 'info');
  };

  const handleRearmPriceAlert = (id: string) => {
    setPriceAlerts(prev =>
      prev.map(a =>
        a.id === id
          ? {
              ...a,
              triggered: false,
              triggeredAt: undefined,
              triggeredPrice: undefined,
              createdAt: Date.now()
            }
          : a
      )
    );
    showToast('🔄 Alert dubara active kar diya gaya hai!', 'success');
  };

  const handleClearTriggeredAlerts = () => {
    setPriceAlerts(prev => prev.filter(a => !a.triggered));
    setTriggeredAlertBanner(null);
    showToast('Triggered alert history clear ho gayi.', 'info');
  };

  // -------------------------------------------------------------
  // FETCH OPEN SIGNALS FROM GOOGLE SHEET JOURNAL TAB (OPEN ONLY)
  // -------------------------------------------------------------
  const fetchOpenSignalsFromSheet = useCallback(async () => {
    try {
      const res = await callBackend('get_open_signals');
      const rawList: any[] | null = Array.isArray(res?.openSignals)
        ? res.openSignals
        : (Array.isArray(res?.signals) ? res.signals : null);

      if (res && !res.error && rawList !== null) {
        const sheetOpenSignals: TradingSignal[] = rawList
          .filter((raw: any) => raw && (raw.symbol || raw.coin))
          .map((raw: any) => {
            const sym = String(raw.symbol || raw.coin || '').toUpperCase().trim();
            const rowNum = Number(raw.sheetRow || raw.row || 0);
            const parsedTs = typeof raw.timestamp === 'number'
              ? raw.timestamp
              : (Date.parse(raw.timestamp) || Date.now());
            const rawOutcome = String(raw.outcome || 'OPEN').toUpperCase().trim();
            const isResolved = rawOutcome === 'WIN' || rawOutcome === 'LOSS' || rawOutcome === 'EXPIRED';
            const entryVal = Number(raw.entry || raw.entryPrice) || 0;
            const baseSig: TradingSignal = {
              id: raw.id || (rowNum > 0 ? `SHEET-ROW-${rowNum}` : `SIG-${parsedTs}-${sym}`),
              symbol: sym,
              timeframe: raw.timeframe || '1h',
              direction: raw.direction,
              signalDirection: raw.direction,
              entryStatus: 'READY',
              currentPrice: entryVal,
              entry: entryVal,
              stopLoss: Number(raw.stopLoss) || 0,
              takeProfit: Number(raw.takeProfit) || 0,
              tp1: Number(raw.tp1) || 0,
              tp2: Number(raw.takeProfit) || 0,
              tp3: Number(raw.tp3) || 0,
              tp1Hit: String(raw.tp1Hit || '').toUpperCase() === 'YES',
              tp2Hit: false,
              tp3Hit: false,
              targetHit: String(raw.tp1Hit || '').toUpperCase() === 'YES' ? 'TP1' : 'OPEN',
              rr: raw.rr || raw.rrRatio || '1:2.0',
              confidence: Number(raw.confidence) || 75,
              signalQuality: 'STRONG',
              model: raw.model || 'Google-Sheet-Journal',
              timestamp: parsedTs,
              resolved: isResolved,
              outcome: isResolved ? (rawOutcome as any) : 'OPEN',
              closedPrice: Number(raw.closedPrice) || undefined,
              closedTime: raw.closedTime || undefined,
              userId: raw.userId || 'global',
              userDisplayName: String(raw.userId || 'SHEET_JOURNAL').toUpperCase(),
              reasoning: raw.reasoning || 'Synced from Google Sheet Journal.',
              sheetRow: rowNum
            };
            return normalizeSignalTargets(baseSig);
          })
          .filter(s => !s.resolved && (!s.outcome || s.outcome === 'OPEN') && (!s.sheetRow || !resolvingRowsRef.current.has(s.sheetRow)));

        setGlobalJournal(prev => {
          const existingByRow = new Map<number, TradingSignal>();
          const existingById = new Map<string, TradingSignal>();
          for (const item of prev) {
            if (item.sheetRow && item.sheetRow > 0) existingByRow.set(item.sheetRow, item);
            existingById.set(item.id, item);
          }

          const nextOpenList: TradingSignal[] = sheetOpenSignals.map(sheetSig => {
            const match = (sheetSig.sheetRow && existingByRow.get(sheetSig.sheetRow)) || existingById.get(sheetSig.id);
            if (!match) return sheetSig;
            return normalizeSignalTargets({
              ...match,
              ...sheetSig,
              tp1Hit: Boolean(match.tp1Hit || sheetSig.tp1Hit),
              resolved: false,
              outcome: 'OPEN'
            });
          });

          // Preserve any newly generated local OPEN signal from the last 2 minutes that hasn't received a sheetRow yet
          const now = Date.now();
          for (const localSig of prev) {
            if (
              !localSig.resolved &&
              (!localSig.outcome || localSig.outcome === 'OPEN') &&
              (!localSig.sheetRow || localSig.sheetRow === 0) &&
              now - localSig.timestamp < 120000 &&
              !nextOpenList.some(x => x.id === localSig.id || (x.symbol === localSig.symbol && Math.abs(x.timestamp - localSig.timestamp) < 60000))
            ) {
              nextOpenList.push(normalizeSignalTargets(localSig));
            }
          }

          nextOpenList.sort((a, b) => b.timestamp - a.timestamp);
          localStorage.setItem(KEYS.JOURNAL_GLOBAL, JSON.stringify(nextOpenList));
          return nextOpenList;
        });

        fetchMarketTickers(sheetOpenSignals);
      } else {
        fetchMarketTickers();
      }
    } catch (e) {
      console.warn('[OpenSignals] Failed to fetch open signals from Google Sheet:', e);
    }
  }, [callBackend, fetchMarketTickers]);

  // -------------------------------------------------------------
  // IN-APP UPDATE CHECKER (FEATURE 1)
  // -------------------------------------------------------------
  const checkAppVersion = useCallback(async () => {
    try {
      const res: any = await callBackend('check_app_version', { currentVersion: CURRENT_APP_VERSION });
      const latest = String(
        res?.latest_version ||
        res?.latestVersion ||
        res?.version ||
        res?.LATEST_APP_VERSION ||
        res?.appVersion ||
        res?.data?.latestVersion ||
        res?.data?.latest_version ||
        ''
      ).trim();
      if (latest && compareVersions(latest, CURRENT_APP_VERSION) > 0) {
        setUpdateData({
          downloadUrl: res.download_url || res.downloadUrl || res.url || 'https://cryptoworld.vip/download',
          latestVersion: latest,
          releaseNotes:
            res.release_notes ||
            res.releaseNotes ||
            res.notes ||
            res.message ||
            'CryptoWorld ka naya version release ho chuka hai! Behtar Binance data stream aur VIP features shamil hain.'
        });
        setUpdateModalOpen(true);
      }
    } catch (err) {
      console.warn('App version check fallback:', err);
    }
  }, [callBackend]);

  // -------------------------------------------------------------
  // RELIABLE ANDROID ADMOB INITIALIZATION & APP OPENING AD ENGINE
  // (Fixes cold-start race condition, ~ vs / unit ID format, concurrent load collision, & no-fill retries)
  // -------------------------------------------------------------
  const ensureAdMobInitialized = useCallback(async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    if (!admobInitPromiseRef.current) {
      admobInitPromiseRef.current = (async () => {
        try {
          await AdMob.initialize({
            initializeForTesting: false
          });
          // Allow native Google Play Services MobileAds.initialize callback to finish warming up adapters
          await new Promise(resolve => setTimeout(resolve, 650));
          console.log(
            '[AdMob] Native SDK initialized & warmed up with App ID:',
            adConfigRef.current.appId || ADMOB_CONFIG.appId
          );
          return true;
        } catch (err) {
          console.warn('[AdMob] SDK initialization warning:', err);
          admobInitPromiseRef.current = null;
          return false;
        }
      })();
    }
    return admobInitPromiseRef.current;
  }, []);

  const preloadNextAppOpenAd = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || isOpeningAdBusyRef.current) return;
    try {
      const ready = await ensureAdMobInitialized();
      if (!ready) return;
      const { appOpenIds } = buildOpeningAdCandidates(adConfigRef.current);
      for (const unitId of appOpenIds) {
        try {
          const loadedCheck = await AdMob.isAppOpenLoaded({ adId: unitId });
          if (loadedCheck?.value) return;
          await AdMob.loadAppOpen({ adId: unitId });
          return;
        } catch {}
      }
    } catch {}
  }, [ensureAdMobInitialized]);

  const triggerAppOpeningAd = useCallback(
    async (source: 'startup' | 'resume' | 'manual' = 'startup'): Promise<boolean> => {
      if (!Capacitor.isNativePlatform()) return false;

      // Single-flight guard: prevents AppOpenAdManager.kt from rejecting concurrent loads
      if (isOpeningAdBusyRef.current) {
        console.log(`[AdMob] Opening ad already in progress (skipped duplicate ${source} trigger)`);
        return false;
      }

      // Cooldown check for automatic resume triggers (minimum 45s between opening ads)
      const now = Date.now();
      if (source === 'resume' && now - lastOpeningAdShownAtRef.current < 45000) {
        return false;
      }

      isOpeningAdBusyRef.current = true;
      try {
        const sdkReady = await ensureAdMobInitialized();
        if (!sdkReady) return false;

        const { appOpenIds, interstitialIds } = buildOpeningAdCandidates(adConfigRef.current);
        const retryDelays = source === 'startup' ? [0, 1600, 3200] : [0, 1500];

        for (let attempt = 0; attempt < retryDelays.length; attempt++) {
          if (retryDelays[attempt] > 0) {
            await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
          }

          // Stage 1: Try showing already pre-cached App Open Ad or loading App Open Ad unit
          for (const appOpenId of appOpenIds) {
            try {
              const check = await AdMob.isAppOpenLoaded({ adId: appOpenId }).catch(() => ({ value: false }));
              if (!check?.value) {
                await AdMob.loadAppOpen({ adId: appOpenId });
              }
              await AdMob.showAppOpen({ adId: appOpenId });
              lastOpeningAdShownAtRef.current = Date.now();
              console.log(`[AdMob] App Open Ad displayed successfully (${appOpenId}) on attempt #${attempt + 1}`);
              setTimeout(() => preloadNextAppOpenAd(), 3500);
              return true;
            } catch {}
          }

          // Stage 2: Waterfall to Interstitial Ad unit (if opening unit is configured as Interstitial or App Open had no fill)
          for (const interstitialId of interstitialIds) {
            try {
              await AdMob.prepareInterstitial({ adId: interstitialId });
              await AdMob.showInterstitial({ adId: interstitialId });
              lastOpeningAdShownAtRef.current = Date.now();
              console.log(
                `[AdMob] Opening Interstitial Ad displayed successfully (${interstitialId}) on attempt #${attempt + 1}`
              );
              setTimeout(() => preloadNextAppOpenAd(), 3500);
              return true;
            } catch {}
          }
        }

        console.log(`[AdMob] Opening ad unavailable after ${retryDelays.length} attempts (${source})`);
        return false;
      } finally {
        isOpeningAdBusyRef.current = false;
      }
    },
    [ensureAdMobInitialized, preloadNextAppOpenAd]
  );

  // -------------------------------------------------------------
  // REAL SYNC INITIALIZATION SEQUENCE (FAST BOOT - NO STUCK)
  // -------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    // Device ID check
    let devId = localStorage.getItem(KEYS.DEVICE_ID);
    if (!devId) {
      devId = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem(KEYS.DEVICE_ID, devId);
    }

    setLoadingStatus('Systems Ready');
    setLoadingProgress(100);

    const timer = setTimeout(() => {
      if (isMounted) setIsAppLoading(false);
    }, 400);

    loadJournals();
    fetchOpenSignalsFromSheet();
    fetchMarketTickers();
    syncNewlyLaunchedPairs(true);
    fetchSheetAccuracy();
    fetchGlobalAdConfig();
    checkAppVersion();

    // Cold-start App Opening Ad on Native Android (runs once without re-triggering on state updates)
    if (Capacitor.isNativePlatform()) {
      triggerAppOpeningAd('startup');
    }

    // Re-sync Global Settings, App Version, Open Signals & Resume Opening Ad when app returns from background
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        lastBackgroundedAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        fetchGlobalAdConfig();
        fetchOpenSignalsFromSheet();
        checkAppVersion();
        const awayMs = lastBackgroundedAtRef.current > 0 ? Date.now() - lastBackgroundedAtRef.current : 0;
        if (Capacitor.isNativePlatform() && awayMs >= 15000) {
          triggerAppOpeningAd('resume');
        }
      }
    };

    const handleWindowFocus = () => {
      fetchGlobalAdConfig();
      fetchOpenSignalsFromSheet();
      checkAppVersion();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    const interval = setInterval(() => fetchMarketTickers(), 10000);
    const newPairsInterval = setInterval(() => syncNewlyLaunchedPairs(true), 5 * 60 * 1000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      clearInterval(interval);
      clearInterval(newPairsInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [fetchMarketTickers, syncNewlyLaunchedPairs, fetchOpenSignalsFromSheet, fetchSheetAccuracy, fetchGlobalAdConfig, checkAppVersion, triggerAppOpeningAd]);

  // Sync with Google Sheet when user changes/logs in
  useEffect(() => {
    if (user?.username && user.username !== 'guest') {
      verifyAndSyncWithGoogleSheet(user.username);
    }
  }, [user?.username, verifyAndSyncWithGoogleSheet]);

  // -------------------------------------------------------------
  // ADMIN STATUS VERIFICATION
  // -------------------------------------------------------------
  useEffect(() => {
    const adminToken = localStorage.getItem('cw_admin_token');
    if (!adminToken) {
      setIsAdmin(false);
      return;
    }
    callBackend('check_admin_status', { adminToken })
      .then((res: any) => {
        if (res && res.isAdmin) {
          setIsAdmin(true);
        } else {
          const exp = Number(localStorage.getItem('cw_admin_token_expires') || '0');
          if (exp > Date.now()) {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
            localStorage.removeItem('cw_admin_token');
          }
        }
      })
      .catch(() => {
        const exp = Number(localStorage.getItem('cw_admin_token_expires') || '0');
        if (exp > Date.now()) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      });
  }, [user?.username, callBackend]);

  // -------------------------------------------------------------
  // ADMIN PANEL CONTROLLERS (FEATURE 2 - GOOGLE SHEET PREMIUMCODES & USERS SYNC)
  // -------------------------------------------------------------
  const normalizeAdminCode = useCallback((c: any) => {
    const rawPlan = String(c?.plan || c?.planType || c?.PlanType || c?.Plan || 'PRO').toUpperCase().trim();
    const plan: 'BASIC' | 'PRO' | 'ELITE' =
      rawPlan === 'BASIC' || rawPlan === 'ELITE' ? rawPlan : 'PRO';
    const defaultSignals = plan === 'BASIC' ? 5 : plan === 'PRO' ? 10 : 20;
    const rawUsed = c?.used ?? c?.Used ?? c?.status ?? c?.Status ?? false;
    const isUsed =
      rawUsed === true ||
      String(rawUsed).toUpperCase() === 'TRUE' ||
      String(rawUsed).toUpperCase() === 'YES' ||
      String(rawUsed).toUpperCase() === 'USED' ||
      String(rawUsed).toUpperCase() === 'CLAIMED';

    return {
      code: String(c?.code || c?.Code || c?.key || '').trim().toUpperCase(),
      plan,
      signalsPerDay: Number(c?.signalsPerDay || c?.SignalsPerDay || c?.signals || defaultSignals) || defaultSignals,
      durationDays: Number(c?.durationDays || c?.DurationDays || c?.duration || c?.days || 30) || 30,
      used: isUsed,
      usedBy: c?.usedBy || c?.UsedBy || c?.claimedBy || null,
      createdAt: c?.createdAt || c?.CreatedAt || new Date().toISOString(),
      cloudSynced: Boolean(c?.cloudSynced ?? true)
    };
  }, []);

  const fetchAdminCodes = useCallback(async () => {
    setAdminCodesLoading(true);
    const adminToken = localStorage.getItem('cw_admin_token') || '';
    try {
      const res = await callBackend('admin_list_codes', { adminToken });
      const rawList = res?.codes || res?.data || res?.premiumCodes || res?.items;
      if (res && !res.error && Array.isArray(rawList)) {
        const sheetCodes = rawList
          .map((c: any) => normalizeAdminCode({ ...c, cloudSynced: true }))
          .filter((c: any) => c.code.length > 0);
        setAdminCodes(sheetCodes);
        localStorage.setItem(KEYS.CODES, JSON.stringify(sheetCodes));
        setAdminCodesLoading(false);
        return sheetCodes;
      }
    } catch (e) {
      console.warn('Error fetching admin codes from Google Sheet:', e);
    }
    setAdminCodesLoading(false);
    return null;
  }, [callBackend, normalizeAdminCode]);

  const fetchAdminUsers = useCallback(async () => {
    setAdminUsersLoading(true);
    const adminToken = localStorage.getItem('cw_admin_token') || '';
    try {
      const res = await callBackend('admin_list_users', { adminToken });
      if (res && res.success && Array.isArray(res.users) && res.users.length > 0) {
        setAdminUsers(res.users.map((u: any) => ({
          username: u.username,
          plan: u.plan || 'FREE',
          dailyQuotaLeft: u.dailyQuotaLeft !== undefined ? u.dailyQuotaLeft : 1,
          referralCode: u.referralCode || '',
          referralsCount: u.referralsCount || 0,
          referralBonus: u.referralBonus || 0,
          password: u.hasPassword ? 'ACTIVE_SET' : '',
          cloudSynced: true
        })));
        setAdminUsersLoading(false);
        return;
      }
    } catch (e) {
      console.warn('Error fetching admin users from backend:', e);
    }

    // Fallback: load from local DB
    const rawDb = localStorage.getItem(KEYS.USERS_DB);
    const db = rawDb ? JSON.parse(rawDb) : {};
    const localList = Object.values(db).map((u: any) => ({
      username: u.username,
      plan: u.plan || 'FREE',
      dailyQuotaLeft: u.dailyQuotaLeft !== undefined ? u.dailyQuotaLeft : 1,
      referralCode: u.referralCode || '',
      referralsCount: u.referralsCount || 0,
      referralBonus: u.referralBonus || 0,
      password: u.password ? 'ACTIVE_SET' : '',
      cloudSynced: false
    }));
    setAdminUsers(localList);
    setAdminUsersLoading(false);
  }, [callBackend]);

  useEffect(() => {
    if (isAdmin && activeTab === 'admin') {
      fetchAdminCodes();
      fetchAdminUsers();
    }
  }, [isAdmin, activeTab, fetchAdminCodes, fetchAdminUsers]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const pass = adminInputKey.trim();
    if (!pass) {
      setAdminAuthError('Master Passphrase enter karein.');
      return;
    }
    setAdminAuthLoading(true);
    setAdminAuthError('');
    try {
      const res = await callBackend('admin_login', { adminKey: pass });
      if (res && res.token) {
        localStorage.setItem('cw_admin_token', res.token);
        localStorage.setItem('cw_admin_token_expires', String(Date.now() + (res.expiresIn ? res.expiresIn * 1000 : 3600000)));
        setIsAdmin(true);
        setAdminLoginModalOpen(false);
        setActiveTab('admin');
        setAdminInputKey('');
        showToast('Super Admin Dashboard Unlocked!', 'success');
        fetchAdminCodes();
        fetchAdminUsers();
      } else {
        setAdminAuthError(res?.message || 'Ghalat Master Passphrase! Dastaras radd kar di gayi.');
      }
    } catch {
      setAdminAuthError('Backend se rabta nahi ho saka. Internet connection check karein.');
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('cw_admin_token');
    localStorage.removeItem('cw_admin_token_expires');
    setIsAdmin(false);
    setActiveTab('signals');
    showToast('Admin session logout ho gaya.', 'info');
  };

  const handleAdminResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminResetTargetUser) return;
    if (adminNewUserPassword.length < 6) {
      setAdminResetModalMsg('❌ Password kam az kam 6 characters ka hona chahiye.');
      return;
    }
    const adminToken = localStorage.getItem('cw_admin_token') || '';
    try {
      await callBackend('admin_reset_password', {
        adminToken,
        username: adminResetTargetUser,
        newPassword: adminNewUserPassword
      });
    } catch {}

    const rawDb = localStorage.getItem(KEYS.USERS_DB);
    const db = rawDb ? JSON.parse(rawDb) : {};
    if (db[adminResetTargetUser]) {
      db[adminResetTargetUser].password = adminNewUserPassword;
      localStorage.setItem(KEYS.USERS_DB, JSON.stringify(db));
    }
    localStorage.setItem('cw_user_pwd_' + adminResetTargetUser, adminNewUserPassword);

    setAdminUsers(prev => prev.map(u => u.username === adminResetTargetUser ? { ...u, password: 'ACTIVE_SET' } : u));
    showToast(`User ${adminResetTargetUser} ka password update ho gaya!`, 'success');
    setAdminResetModalOpen(false);
    setAdminNewUserPassword('');
    setAdminResetModalMsg('');
  };

  const handleBulkGenerateCodes = async () => {
    if (adminCodeGenerating) return;
    setAdminCodeGenerating(true);
    const plans = [
      { plan: 'BASIC', signals: 5, count: 20 },
      { plan: 'PRO', signals: 10, count: 20 },
      { plan: 'ELITE', signals: 20, count: 20 }
    ];
    const newCodes: any[] = [];
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    plans.forEach(p => {
      for (let i = 0; i < p.count; i++) {
        let suffix = '';
        for (let j = 0; j < 8; j++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
        newCodes.push({
          code: `${p.plan}-${suffix}`,
          plan: p.plan,
          signalsPerDay: p.signals,
          durationDays: 30,
          used: false,
          usedBy: null,
          createdAt: new Date().toISOString(),
          cloudSynced: false
        });
      }
    });

    const adminToken = localStorage.getItem('cw_admin_token') || '';
    try {
      const res = await callBackend('admin_bulk_generate', {
        adminToken,
        codes: newCodes,
        countPerPlan: 20,
        totalCount: 60,
        durationDays: 30
      });

      if (res && !res.error) {
        const backendReturnedList = Array.isArray(res.codes) && res.codes.length > 0
          ? res.codes.map((c: any) => normalizeAdminCode({ ...c, cloudSynced: true }))
          : newCodes.map(c => ({ ...c, cloudSynced: true }));

        setAdminCodes(prev => {
          const existingSet = new Set(backendReturnedList.map((c: any) => c.code));
          const combined = [...backendReturnedList, ...prev.filter(c => !existingSet.has(c.code))];
          localStorage.setItem(KEYS.CODES, JSON.stringify(combined));
          return combined;
        });

        await fetchAdminCodes();
        showToast(`✅ Kamyabi! ${backendReturnedList.length} Bulk VIP Codes Google Sheet (PremiumCodes tab) mein save ho gaye!`, 'success');
      } else {
        setAdminCodes(prev => {
          const combined = [...newCodes, ...prev];
          localStorage.setItem(KEYS.CODES, JSON.stringify(combined));
          return combined;
        });
        showToast(res?.message || '⚠️ Bulk codes local save hue, magar Google Sheet sync fail hua.', 'error');
      }
    } catch {
      setAdminCodes(prev => {
        const combined = [...newCodes, ...prev];
        localStorage.setItem(KEYS.CODES, JSON.stringify(combined));
        return combined;
      });
      showToast('⚠️ Google Sheet se rabta nahi ho saka. Bulk codes local save hue.', 'error');
    } finally {
      setAdminCodeGenerating(false);
    }
  };

  const handleSingleGenerateCode = async () => {
    if (adminCodeGenerating) return;
    setAdminCodeGenerating(true);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let j = 0; j < 8; j++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    const sigs = adminSinglePlan === 'BASIC' ? 5 : adminSinglePlan === 'PRO' ? 10 : 20;
    const duration = Number(adminSingleDuration) || 30;
    const codeObj = {
      code: `${adminSinglePlan}-${suffix}`,
      plan: adminSinglePlan,
      signalsPerDay: sigs,
      durationDays: duration,
      used: false,
      usedBy: null,
      createdAt: new Date().toISOString(),
      cloudSynced: false
    };

    const adminToken = localStorage.getItem('cw_admin_token') || '';
    try {
      const res = await callBackend('admin_generate_single', {
        adminToken,
        code: codeObj.code,
        plan: codeObj.plan,
        planType: codeObj.plan,
        signalsPerDay: codeObj.signalsPerDay,
        durationDays: codeObj.durationDays,
        duration: codeObj.durationDays,
        days: codeObj.durationDays
      });

      if (res && !res.error) {
        const returnedCodeObj =
          res.code && typeof res.code === 'object'
            ? normalizeAdminCode({ ...codeObj, ...res.code, cloudSynced: true })
            : normalizeAdminCode({
                ...codeObj,
                code: typeof res.code === 'string' && res.code.trim() ? res.code.trim().toUpperCase() : codeObj.code,
                cloudSynced: true
              });

        setAdminCodes(prev => {
          const combined = [returnedCodeObj, ...prev.filter(c => c.code !== returnedCodeObj.code)];
          localStorage.setItem(KEYS.CODES, JSON.stringify(combined));
          return combined;
        });

        await fetchAdminCodes();
        showToast(`✅ VIP License Key Google Sheet (PremiumCodes tab) mein save ho gayi: ${returnedCodeObj.code}`, 'success');
      } else {
        setAdminCodes(prev => {
          const combined = [codeObj, ...prev];
          localStorage.setItem(KEYS.CODES, JSON.stringify(combined));
          return combined;
        });
        showToast(res?.message || `⚠️ Key local save hui (${codeObj.code}), magar Google Sheet sync fail hua.`, 'error');
      }
    } catch {
      setAdminCodes(prev => {
        const combined = [codeObj, ...prev];
        localStorage.setItem(KEYS.CODES, JSON.stringify(combined));
        return combined;
      });
      showToast(`⚠️ Google Sheet se rabta nahi ho saka. Key local save hui: ${codeObj.code}`, 'error');
    } finally {
      setAdminCodeGenerating(false);
    }
  };

  const handleCopyUnusedCodes = () => {
    const unused = adminCodes.filter(c => !c.used).map(c => `${c.code} (${c.plan} - ${c.signalsPerDay}/day)`).join('\n');
    if (!unused) {
      showToast('Koi unused code mojood nahi.', 'error');
      return;
    }
    navigator.clipboard.writeText(unused);
    showToast('Tamam Unused Codes clipboard par copy ho gaye!', 'success');
  };

  const handlePurgeUsedCodes = () => {
    const unused = adminCodes.filter(c => !c.used);
    const purged = adminCodes.length - unused.length;
    if (purged === 0) {
      showToast('Purge karne ke liye koi used code nahi mila.', 'info');
      return;
    }
    setAdminCodes(unused);
    localStorage.setItem(KEYS.CODES, JSON.stringify(unused));
    showToast(`${purged} used codes list se clean ho gaye.`, 'success');
  };

  const handleSaveAdConfig = () => {
    const sanitizedConfig = mergeAdConfig(DEFAULT_AD_CONFIG, adminAdSettings);
    setAdminAdSettings(sanitizedConfig);
    setAdConfig(sanitizedConfig);
    localStorage.setItem(KEYS.AD_CONFIG, JSON.stringify(sanitizedConfig));
    showToast('✅ AdMob App ID & Ad Unit IDs saved and active across the app!', 'success');

    // Background Google Sheet Sync (Applies globally across all worldwide users)
    const adminToken = localStorage.getItem('cw_admin_token') || '';
    callBackend('set_ad_config', {
      config: sanitizedConfig,
      adminToken
    }).catch(err => {
      console.warn('[AdConfig] Background sheet sync warning:', err);
    });
  };

  const handleResetAdConfig = () => {
    setAdminAdSettings(DEFAULT_AD_CONFIG);
    localStorage.setItem(KEYS.AD_CONFIG, JSON.stringify(DEFAULT_AD_CONFIG));
    setAdConfig(DEFAULT_AD_CONFIG);
    showToast('🔄 AdMob IDs reset to official approved defaults!', 'info');

    const adminToken = localStorage.getItem('cw_admin_token') || '';
    callBackend('set_ad_config', {
      config: DEFAULT_AD_CONFIG,
      adminToken
    }).catch(err => {
      console.warn('[AdConfig] Background sheet reset warning:', err);
    });
  };

  const filteredAdminCodes = useMemo(() => {
    let list = adminCodes;
    if (adminCodeFilter === 'UNUSED') list = list.filter(c => !c.used);
    else if (adminCodeFilter === 'USED') list = list.filter(c => c.used);
    else if (adminCodeFilter === 'BASIC') list = list.filter(c => c.plan === 'BASIC');
    else if (adminCodeFilter === 'PRO') list = list.filter(c => c.plan === 'PRO');
    else if (adminCodeFilter === 'ELITE') list = list.filter(c => c.plan === 'ELITE');
    return list;
  }, [adminCodes, adminCodeFilter]);

  const filteredAdminUsers = useMemo(() => {
    if (!adminUserSearch.trim()) return adminUsers;
    const q = adminUserSearch.toLowerCase().trim();
    return adminUsers.filter(u =>
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.referralCode && u.referralCode.toLowerCase().includes(q)) ||
      (u.plan && u.plan.toLowerCase().includes(q))
    );
  }, [adminUsers, adminUserSearch]);

  // -------------------------------------------------------------
  // REAL GOOGLE ADMOB APP OPENING / INTERSTITIAL AD (DYNAMIC UNIT ID)
  // -------------------------------------------------------------
  const handleShowInterstitialAd = async () => {
    if (isInterstitialLoading) return;
    const interstitialId = toNativeAdUnitId(
      adConfig.interstitialAdUnitId || adConfig.appOpenAdUnitId,
      ADMOB_CONFIG.interstitialAdUnitId
    );

    if (!Capacitor.isNativePlatform()) {
      showToast(`⚠️ App Open / Interstitial Ad (${interstitialId}) sirf Android App mein chal sakta hai, Web par nahi.`, 'info');
      return;
    }

    setIsInterstitialLoading(true);
    showToast('Loading Google AdMob Opening / Interstitial Ad...', 'info');
    try {
      const shown = await triggerAppOpeningAd('manual');
      if (!shown) {
        showToast('Opening / Interstitial Ad abhi available nahi hai. Internet check karke dobara koshish karein.', 'error');
      }
    } catch (err) {
      console.warn('[AdMob] Opening / Interstitial Ad could not be shown:', err);
      showToast('Opening / Interstitial Ad abhi available nahi hai. Dobara koshish karein.', 'error');
    } finally {
      setIsInterstitialLoading(false);
    }
  };

  // -------------------------------------------------------------
  // REAL GOOGLE ADMOB REWARDED AD (NO TIMER - STRICT REWARD VERIFICATION)
  // -------------------------------------------------------------
  const handleWatchRewardedAd = async () => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    if (isAdLoading) return;

    const adUnitId = toNativeAdUnitId(adConfig.rewardedAdUnitId, ADMOB_CONFIG.rewardedAdUnitId);

    // Web Browser Check (Real AdMob strictly runs on installed Android APK)
    if (!Capacitor.isNativePlatform()) {
      showToast('⚠️ Test Ad sirf Android App mein chal sakta hai, Web par nahi.', 'error');
      return;
    }

    // Native Mobile AdMob flow
    setIsAdLoading(true);
    showToast('Loading Google AdMob video...', 'info');

    // Auto-retry helper: Ensures AdMob SDK is initialized and retries on transient network failure
    const prepareRewardAd = async (isRetry = false): Promise<boolean> => {
      try {
        await ensureAdMobInitialized();
        await AdMob.prepareRewardVideoAd({ adId: adUnitId });
        return true;
      } catch (err) {
        if (!isRetry) {
          console.warn('[AdMob] First Rewarded Ad load attempt failed, retrying...', err);
          await new Promise(r => setTimeout(r, 1500));
          return prepareRewardAd(true);
        }
        console.error('[AdMob] Rewarded Ad load failed after auto-retry:', err);
        return false;
      }
    };

    try {
      const isReady = await prepareRewardAd(false);
      if (!isReady) {
        setIsAdLoading(false);
        showToast('Ad could not be loaded. Please check your internet and try again.', 'error');
        return;
      }

      // Show the loaded rewarded ad. Resolves with AdMobRewardItem ONLY when user completes the video!
      const rewardItem = await AdMob.showRewardVideoAd();
      setIsAdLoading(false);

      if (rewardItem) {
        showToast('🎉 Ad mukammal dekhi! Quota update ho raha hai...', 'info');
        try {
          const res = await callBackend('watch_ad_reward', { username: user.username });
          if (res && res.error) {
            showToast(res.message || 'Ad reward claim nahi ho saka.', 'error');
            return;
          }
          await verifyAndSyncWithGoogleSheet(user.username);
          showToast('🎉 Mubarak! Real AdMob video mukammal dekhne par +1 Signal Quota mil gaya!', 'success');
        } catch {
          showToast('Ad reward verify nahi ho saka. Dobara koshish karein.', 'error');
        }
      } else {
        showToast('Ad reward verify nahi hua. Quota paaney ke liye video mukammal dekhna lazmi hai.', 'info');
      }
    } catch (err) {
      setIsAdLoading(false);
      console.error('[AdMob] Error playing reward video ad:', err);
      showToast('Ad could not be loaded. Please check your internet and try again.', 'error');
    }
  };

  // -------------------------------------------------------------
  // REAL-TIME SIGNAL PNL PROGRESS (TP & SL PERCENTAGE)
  // -------------------------------------------------------------
  const calculateSignalPnLProgress = (sig: TradingSignal, livePrice: number) => {
    const entry = Number(sig.entry) || 1;
    const tp = Number(sig.takeProfit) || entry;
    const sl = Number(sig.stopLoss) || entry;
    const rawDir = String(sig.direction || '').toUpperCase().trim();
    const isLong = rawDir === 'LONG' || rawDir === 'BUY' || rawDir === 'BULLISH';
    const effectivePrice = sig.resolved ? (sig.closedPrice || livePrice || entry) : (livePrice || sig.currentPrice || entry);

    let progressPct = 0; // -100 to +100 (or beyond if runner)
    let statusText = '';
    let isProfit = true;

    if (isLong) {
      if (effectivePrice >= entry) {
        const reward = tp - entry;
        progressPct = reward > 0 ? ((effectivePrice - entry) / reward) * 100 : 0;
        isProfit = true;
      } else {
        const risk = entry - sl;
        progressPct = risk > 0 ? -((entry - effectivePrice) / risk) * 100 : 0;
        isProfit = false;
      }
    } else {
      // SHORT / SELL
      if (effectivePrice <= entry) {
        const reward = entry - tp;
        progressPct = reward > 0 ? ((entry - effectivePrice) / reward) * 100 : 0;
        isProfit = true;
      } else {
        const risk = sl - entry;
        progressPct = risk > 0 ? -((effectivePrice - entry) / risk) * 100 : 0;
        isProfit = false;
      }
    }

    const roundedPct = progressPct.toFixed(1);

    if (sig.resolved) {
      if (sig.outcome === 'WIN') {
        const target = sig.tp3Hit ? 'T3 Runner (+150%)' : (sig.tp2Hit ? 'T2 Main TP (100%)' : 'T1 Secured (+50%)');
        statusText = `🎯 Target Reached (+${Math.max(50, Math.round(progressPct))}% Success | ${target})`;
      } else {
        statusText = `🛑 Stopped Out (-100.0% Loss)`;
      }
    } else {
      if (progressPct >= 150) {
        statusText = `🏆 T3 Hit (+${roundedPct}% Runner Achieved)`;
      } else if (progressPct >= 100) {
        statusText = `🚀 T2 Hit (+${roundedPct}% TP Achieved)`;
      } else if (progressPct >= 50) {
        statusText = `🎯 T1 Hit (+${roundedPct}% Running towards T2)`;
      } else if (progressPct > 0) {
        statusText = `🟢 +${roundedPct}% In Profit`;
      } else if (progressPct === 0) {
        statusText = `⚪ At Entry (0.0%)`;
      } else {
        statusText = `🔴 ${roundedPct}% Drawdown`;
      }
    }

    // Progress bar fill width (0 to 50% from center)
    const fillWidth = Math.min(50, Math.abs(progressPct) * 0.5);

    return { progressPct, roundedPct, statusText, isProfit, effectivePrice, fillWidth };
  };

  // -------------------------------------------------------------
  // ACCURATE BINANCE TECHNICAL INDICATOR CALCULATOR
  // -------------------------------------------------------------
  const computeIndicators = (candles: number[][], currentPrice: number) => {
    const closes = candles.map(c => Number(c[4]));
    const highs = candles.map(c => Number(c[2]));
    const lows = candles.map(c => Number(c[3]));
    const volumes = candles.map(c => Number(c[5]) || 0);
    const len = closes.length;

    // 1. Wilder's Smoothed RSI (14) - Matches Binance Chart 100%
    let rsi = 50.0;
    if (len > 14) {
      let gains = 0, losses = 0;
      for (let i = 1; i <= 14; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
      }
      let avgGain = gains / 14;
      let avgLoss = losses / 14;

      for (let i = 15; i < len; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;
        avgGain = (avgGain * 13 + gain) / 14;
        avgLoss = (avgLoss * 13 + loss) / 14;
      }
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi = Math.round((100 - 100 / (1 + rs)) * 10) / 10;
    }

    // 2. Accurate EMA Series Helper
    const calcEMASeries = (data: number[], p: number) => {
      const k = 2 / (p + 1);
      const emaArr = [data[0]];
      for (let i = 1; i < data.length; i++) {
        emaArr.push(data[i] * k + emaArr[i - 1] * (1 - k));
      }
      return emaArr;
    };

    const ema20Arr = calcEMASeries(closes, 20);
    const ema50Arr = calcEMASeries(closes, 50);
    const ema200Arr = calcEMASeries(closes, 200);

    const ema20 = ema20Arr[len - 1];
    const ema50 = ema50Arr[len - 1];
    const ema200 = ema200Arr[len - 1];

    // 3. Real MACD (12, 26, 9)
    const ema12Arr = calcEMASeries(closes, 12);
    const ema26Arr = calcEMASeries(closes, 26);
    const macdSeries = closes.map((_, i) => ema12Arr[i] - ema26Arr[i]);
    const signalSeries = calcEMASeries(macdSeries, 9);
    const macd = macdSeries[len - 1];
    const signal = signalSeries[len - 1];
    const hist = macd - signal;

    // 4. ATR (14) & ADX (14) — Wilder smoothing
    const period = 14;
    const trSeries: number[] = [];
    const plusDMSeries: number[] = [];
    const minusDMSeries: number[] = [];
    for (let i = 1; i < len; i++) {
      const h = highs[i], l = lows[i], ph = highs[i - 1], pl = lows[i - 1], pc = closes[i - 1];
      const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      const upMove = h - ph;
      const downMove = pl - l;
      trSeries.push(tr);
      plusDMSeries.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDMSeries.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    let atr = currentPrice * 0.01;
    let adx = 25;
    if (trSeries.length >= period) {
      let smTR = trSeries.slice(0, period).reduce((a, b) => a + b, 0);
      let smPlus = plusDMSeries.slice(0, period).reduce((a, b) => a + b, 0);
      let smMinus = minusDMSeries.slice(0, period).reduce((a, b) => a + b, 0);
      const dxSeries: number[] = [];
      for (let i = period; i < trSeries.length; i++) {
        smTR = smTR - (smTR / period) + trSeries[i];
        smPlus = smPlus - (smPlus / period) + plusDMSeries[i];
        smMinus = smMinus - (smMinus / period) + minusDMSeries[i];
        const diPlus = (smPlus / smTR) * 100;
        const diMinus = (smMinus / smTR) * 100;
        const sum = diPlus + diMinus;
        dxSeries.push(sum > 0 ? (Math.abs(diPlus - diMinus) / sum) * 100 : 0);
      }
      atr = smTR / period;
      if (dxSeries.length >= period) {
        let smoothedADX = dxSeries.slice(0, period).reduce((a, b) => a + b, 0) / period;
        for (let i = period; i < dxSeries.length; i++) {
          smoothedADX = (smoothedADX * (period - 1) + dxSeries[i]) / period;
        }
        adx = Math.round(Math.max(0, Math.min(100, smoothedADX)) * 10) / 10;
      } else if (dxSeries.length > 0) {
        adx = Math.round(dxSeries[dxSeries.length - 1] * 10) / 10;
      }
    }

    // 5. Volume Ratio
    const lastVol = volumes[len - 1];
    const prev20Vols = volumes.slice(-21, -1);
    const avgVol = prev20Vols.reduce((a, b) => a + b, 0) / (prev20Vols.length || 1) || 1;
    const volRatio = Math.round((lastVol / avgVol) * 100) / 100;

    // 6. Recent Structure Support / Resistance (Last 30 candles)
    const recentHighs = highs.slice(-30);
    const recentLows = lows.slice(-30);
    const resistance = Math.max(...recentHighs);
    const support = Math.min(...recentLows);

    return {
      rsi,
      macd: { macd, signal, hist },
      adx,
      atr,
      volRatio: Math.max(0.1, volRatio),
      ema20,
      ema50,
      ema200,
      support,
      resistance
    };
  };

  // -------------------------------------------------------------
  // AI SIGNAL GENERATOR (Direct code.gs Groq + Gemini Engine)
  // -------------------------------------------------------------
  const generateSignal = async () => {
    if (!user) return;

    if (user.username === 'guest') {
      showToast('Google Sheet Journal mein signal save karne ke liye pehle Login karein!', 'info');
      setLoginModalOpen(true);
      return;
    }

    const freshQuota = await verifyAndSyncWithGoogleSheet(user.username);
    const quotaLeft = freshQuota !== null ? freshQuota : user.dailyQuotaLeft;

    if (quotaLeft <= 0) {
      showToast('Aapka quota khatam ho chuka hai! Reward ad dekh kar +1 free signal hasil karein.', 'info');
      handleWatchRewardedAd();
      return;
    }

    setIsScanning(true);
    setSignalError(null);
    setScanStep('Binance Live Candlesticks (100 Candles) & Volume Stream Fetch...');

    try {
      // 2. Fetch live Binance multi-timeframe candles directly (250 candles for accurate EMA200 & RSI14)
      const fetchDirectKlines = async (symbol: string, interval: string, limit = 250): Promise<number[][]> => {
        const urls = [
          `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
          `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
          `/api/binance-klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
        ];
        for (const url of urls) {
          try {
            const r = await fetch(url);
            if (r.ok) {
              const d = await r.json();
              if (Array.isArray(d) && d.length >= 30) {
                return d.map((k: any) => [
                  Number(k[0]), Number(k[1]), Number(k[2]), Number(k[3]), Number(k[4]), Number(k[5])
                ]);
              }
            }
          } catch {}
        }
        return [];
      };

      const fetchLatestSymbolPrice = async (symbol: string): Promise<number | null> => {
        const priceUrls = [
          `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`,
          `https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`,
          `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
        ];
        for (const url of priceUrls) {
          try {
            const r = await fetch(url);
            if (r.ok) {
              const d = await r.json();
              const p = parseFloat(d?.price);
              if (Number.isFinite(p) && p > 0) return p;
            }
          } catch {}
        }
        return null;
      };

      const [candles, candles4h, candles1d, latestSpotOrFuturesPrice] = await Promise.all([
        fetchDirectKlines(selectedCoin, selectedTimeframe, 250),
        fetchDirectKlines(selectedCoin, '4h', 250),
        fetchDirectKlines(selectedCoin, '1d', 250),
        fetchLatestSymbolPrice(selectedCoin)
      ]);

      // STRICT CHECK: Agar live data nahi aaya to fake signal mat banao!
      if (candles.length < 30) {
        showToast('Live Binance chart data fetch nahi ho saka. Internet check karein aur dobara try karein.', 'error');
        setIsScanning(false);
        setScanStep('');
        return;
      }

      // Latest live price from Binance ticker endpoint (fallback to latest candle close)
      const livePrice = latestSpotOrFuturesPrice && latestSpotOrFuturesPrice > 0
        ? latestSpotOrFuturesPrice
        : candles[candles.length - 1][4];
      // Sync latest candle close with latest live price
      candles[candles.length - 1][4] = livePrice;
      setMarketPrices(prev => ({ ...prev, [selectedCoin]: livePrice }));

      // Format last 100 candles with both OHLC object keys and array indices for V7 momentum analysis
      const formatCandlesForBackend = (rawCandles: number[][], limit = 100) => {
        return rawCandles.slice(-limit).map(k => ({
          0: Number(k[0]),
          1: Number(k[1]),
          2: Number(k[2]),
          3: Number(k[3]),
          4: Number(k[4]),
          5: Number(k[5]),
          time: Number(k[0]),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: Number(k[5]),
          o: Number(k[1]),
          h: Number(k[2]),
          l: Number(k[3]),
          c: Number(k[4]),
          v: Number(k[5])
        }));
      };

      setScanStep('AI is analyzing market momentum...');
      const ind1 = computeIndicators(candles, livePrice);
      const valid4h = candles4h.length >= 30 ? candles4h : candles;
      const valid1d = candles1d.length >= 30 ? candles1d : candles;
      const ind4h = computeIndicators(valid4h, livePrice);
      const ind1d = computeIndicators(valid1d, livePrice);

      const recent100Candles = formatCandlesForBackend(candles, 100);
      const recent100Candles4h = formatCandlesForBackend(valid4h, 100);
      const recent100Candles1d = formatCandlesForBackend(valid1d, 100);

      const payload = {
        action: 'signal',
        username: user.username,
        symbol: selectedCoin,
        timeframe: selectedTimeframe,
        currentPrice: livePrice,
        price: livePrice,
        marketTimestamp: new Date().toISOString(),
        rsi: ind1.rsi,
        macd: ind1.macd.macd,
        macdSignal: ind1.macd.signal,
        macdHistogram: ind1.macd.hist,
        adx: ind1.adx,
        atr: ind1.atr,
        volumeRatio: ind1.volRatio,
        ema20: ind1.ema20,
        ema50: ind1.ema50,
        ema200: ind1.ema200,
        support: ind1.support,
        resistance: ind1.resistance,
        tf1: {
          timeframe: selectedTimeframe,
          rsi: ind1.rsi,
          macd: ind1.macd.macd,
          macdSignal: ind1.macd.signal,
          macdHistogram: ind1.macd.hist,
          adx: ind1.adx,
          atr: ind1.atr,
          volumeRatio: ind1.volRatio,
          ema20: ind1.ema20,
          ema50: ind1.ema50,
          ema200: ind1.ema200,
          support: ind1.support,
          resistance: ind1.resistance,
          trend: livePrice >= ind1.ema20 ? 'BULLISH' : 'BEARISH'
        },
        tf2: {
          timeframe: '4h',
          rsi: ind4h.rsi,
          macd: ind4h.macd.macd,
          macdSignal: ind4h.macd.signal,
          macdHistogram: ind4h.macd.hist,
          adx: ind4h.adx,
          atr: ind4h.atr,
          volumeRatio: ind4h.volRatio,
          ema20: ind4h.ema20,
          ema50: ind4h.ema50,
          ema200: ind4h.ema200,
          support: ind4h.support,
          resistance: ind4h.resistance,
          trend: livePrice >= ind4h.ema20 ? 'BULLISH' : 'BEARISH'
        },
        tf3: {
          timeframe: '1d',
          rsi: ind1d.rsi,
          macd: ind1d.macd.macd,
          macdSignal: ind1d.macd.signal,
          macdHistogram: ind1d.macd.hist,
          adx: ind1d.adx,
          atr: ind1d.atr,
          volumeRatio: ind1d.volRatio,
          ema20: ind1d.ema20,
          ema50: ind1d.ema50,
          ema200: ind1d.ema200,
          support: ind1d.support,
          resistance: ind1d.resistance,
          trend: livePrice >= ind1d.ema20 ? 'BULLISH' : 'BEARISH'
        },
        recentCandles: recent100Candles,
        candles4h: recent100Candles4h,
        candles1d: recent100Candles1d
      };

      setScanStep('AI is analyzing market momentum...');
      const res = await callBackend('signal', payload);

      if (!res || res.error) {
        const errMsg = res?.message || 'AI API se signal generate nahi ho saka. Dobara koshish karein.';
        setSignalError(errMsg);
        setCurrentSignal(null);
        showToast(errMsg, 'error');
        return;
      }

      // Success response from V7 Momentum Focused backend (LONG, SHORT, or NO_TRADE when market is flat)
      const rawDir = String(res.direction || 'NO_TRADE').toUpperCase().trim();
      const direction: 'LONG' | 'SHORT' | 'NO_TRADE' =
        rawDir === 'LONG' || rawDir === 'BUY' || rawDir === 'BULLISH'
          ? 'LONG'
          : rawDir === 'SHORT' || rawDir === 'SELL' || rawDir === 'BEARISH'
            ? 'SHORT'
            : 'NO_TRADE';
      const isActionable = direction === 'LONG' || direction === 'SHORT';
      const livePriceNumber = Number(livePrice) || (selectedCoin === 'PEPEUSDT' ? 0.0000045 : 84500);
      const entryPrice = Number(res.entry) || Number(res.entryPrice) || livePriceNumber;

      const rawSl = Number(res.stopLoss) || Number(res.sl) || Number(res.slPrice);
      const rawTp = Number(res.takeProfit) || Number(res.tp2) || Number(res.tp) || Number(res.target) || Number(res.targetPrice);
      const rawTp1 = Number(res.tp1);
      const rawTp2 = Number(res.tp2) || rawTp;
      const rawTp3 = Number(res.tp3);

      const targetLevels = normalizeSignalTargets({
        symbol: selectedCoin,
        direction,
        entry: entryPrice,
        stopLoss: rawSl,
        takeProfit: rawTp,
        tp1: rawTp1,
        tp2: rawTp2,
        tp3: rawTp3,
        currentPrice: livePriceNumber
      });

      const newSignal: TradingSignal = {
        id: `SIG-${Date.now()}`,
        symbol: selectedCoin,
        timeframe: selectedTimeframe,
        direction,
        signalDirection: isActionable ? direction : 'NEUTRAL',
        entryStatus: isActionable ? 'READY' : 'NO_TRADE',
        currentPrice: livePriceNumber,
        entry: targetLevels.entry,
        suggestedEntry: res.suggestedEntry,
        triggerPrice: res.triggerPrice,
        invalidationPrice: res.invalidationPrice,
        entryImproved: res.entryImproved,
        stopLoss: targetLevels.stopLoss,
        takeProfit: targetLevels.takeProfit,
        tp1: targetLevels.tp1,
        tp2: targetLevels.tp2,
        tp3: targetLevels.tp3,
        tp1Hit: false,
        tp2Hit: false,
        tp3Hit: false,
        targetHit: 'OPEN',
        rr: res.rr || 'N/A',
        suggestedRR: res.suggestedRR,
        confidence: res.confidence || 75,
        directionConfidence: res.directionConfidence,
        entryConfidence: res.entryConfidence,
        signalQuality: isActionable ? (res.signalQuality && res.signalQuality !== 'WAIT' ? res.signalQuality : 'STRONG') : 'N/A',
        signalQualityDetails: res.signalQualityDetails,
        signalQualityScore: res.signalQualityScore,
        model: res.model || 'V7-Momentum-AI',
        timestamp: Date.now(),
        resolved: false,
        outcome: isActionable ? 'OPEN' : null,
        userId: user.username,
        userDisplayName: user.username.toUpperCase(),
        reasoning: res.reasoning || (direction === 'NO_TRADE' ? 'Market flat hai, koi signal nahi mila.' : ''),
        warnings: res.warnings || [],
        sheetRow: Number(res.sheetRow || res.row || res.journalRow || 0)
      };

      setSignalError(null);
      setCurrentSignal(newSignal);

      // Save to Local Journals (only if actionable LONG/SHORT trade)
      if (isActionable) {
        setUserJournal(prev => {
          const updated = [newSignal, ...prev.filter(s => s.id !== newSignal.id)];
          localStorage.setItem(`${KEYS.JOURNAL_USER_PREFIX}${user.username}`, JSON.stringify(updated));
          return updated;
        });

        setGlobalJournal(prev => {
          const updated = [newSignal, ...prev.filter(s => s.id !== newSignal.id)];
          localStorage.setItem(KEYS.JOURNAL_GLOBAL, JSON.stringify(updated));
          return updated;
        });
      }

      // Update Quota Left from code.gs response
      if (res.signalsLeft !== undefined) {
        const updatedUser: UserProfile = { ...user, dailyQuotaLeft: Number(res.signalsLeft) };
        setUser(updatedUser);
        const rawDb = localStorage.getItem(KEYS.USERS_DB);
        const db = rawDb ? JSON.parse(rawDb) : {};
        db[user.username] = updatedUser;
        localStorage.setItem(KEYS.USERS_DB, JSON.stringify(db));
      }

      // Refresh Google Sheet Journal Accuracy stats
      fetchSheetAccuracy();

      if (direction === 'NO_TRADE') {
        showToast('Market flat hai, koi signal nahi mila', 'info');
      } else {
        const badgeLabel = direction === 'LONG' ? 'BUY' : 'SELL';
        showToast(`Shandar! ${selectedCoin} ${badgeLabel} (${direction}) signal Google Sheet Journal mein save ho gaya! (Model: ${res.model || 'V7-Momentum'})`, 'success');
      }
    } catch (err: any) {
      const errMsg = 'Signal generate karne mein kharabi: ' + (err.message || 'Backend Error');
      setSignalError(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setIsScanning(false);
      setScanStep('');
    }
  };

  // -------------------------------------------------------------
  // LIGHTWEIGHT CHARTS BINANCE FAPI LIVE CANDLESTICK & TP/SL TRACKER
  // (Stable lifecycle — zero flickering on background price/journal updates)
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab === 'progress') {
      fetchOpenSignalsFromSheet();
      fetchSheetAccuracy();
    }
  }, [activeTab, fetchOpenSignalsFromSheet, fetchSheetAccuracy]);

  useEffect(() => {
    if (activeTab !== 'chart' || chartEngine !== 'LIGHTWEIGHT' || !lwChartContainerRef.current) {
      lwCandleSeriesRef.current = null;
      lwLastCandleRef.current = null;
      lwPriceLinesRef.current = [];
      return;
    }

    const container = lwChartContainerRef.current;
    container.innerHTML = '';
    setIsChartLoading(true);

    const coinMeta = allCoinsRef.current.find(c => c.symbol === selectedCoin);
    const refPrice = coinMeta?.basePrice || 100;
    const precision = refPrice < 0.001 ? 8 : (refPrice < 1 ? 4 : (refPrice < 10 ? 3 : 2));
    const minMove = Number((1 / Math.pow(10, precision)).toFixed(precision));

    const chart = createChart(container, {
      width: container.clientWidth || 600,
      height: 420,
      layout: {
        background: { type: ColorType.Solid, color: '#0e1320' },
        textColor: '#94a3b8'
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' }
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        autoScale: true
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00e676',
      downColor: '#ff4d4d',
      borderVisible: false,
      wickUpColor: '#00e676',
      wickDownColor: '#ff4d4d',
      priceFormat: {
        type: 'price',
        precision,
        minMove
      }
    });

    lwCandleSeriesRef.current = candleSeries;
    lwLastCandleRef.current = null;
    lwPriceLinesRef.current = [];

    let isDisposed = false;
    let initialLoaded = false;
    let currentSeriesLastTime: number | null = null;

    const loadAndTrackChartKlines = async () => {
      const klines = await fetchKlinesForSymbol(selectedCoin, selectedTimeframe, 180);
      if (isDisposed) return;

      const uniqueSorted = sanitizeKlinesToOhlc(klines);

      if (uniqueSorted.length > 0 && !isDisposed) {
        if (!initialLoaded) {
          candleSeries.setData(uniqueSorted as any);
          chart.timeScale().fitContent();
          initialLoaded = true;
          currentSeriesLastTime = uniqueSorted[uniqueSorted.length - 1].time;
          setIsChartLoading(false);
        } else {
          // Safe incremental update: NEVER pass bars older than currentSeriesLastTime to series.update()
          const seriesLatestTime = lwLastCandleRef.current?.time
            ? Math.max(currentSeriesLastTime ?? 0, lwLastCandleRef.current.time)
            : currentSeriesLastTime;
          const plan = getSafeIncrementalBars(uniqueSorted, seriesLatestTime);

          try {
            if (plan.needsFullReset) {
              candleSeries.setData(uniqueSorted as any);
            } else {
              for (const bar of plan.barsToUpdate) {
                candleSeries.update(bar as any);
              }
            }
            currentSeriesLastTime = plan.nextLastTime;
          } catch {
            // Safe fallback if series state diverged
            candleSeries.setData(uniqueSorted as any);
            currentSeriesLastTime = uniqueSorted[uniqueSorted.length - 1].time;
          }
        }

        const latestBar = uniqueSorted[uniqueSorted.length - 1];
        if (!lwLastCandleRef.current || latestBar.time >= lwLastCandleRef.current.time) {
          lwLastCandleRef.current = {
            time: latestBar.time,
            open: latestBar.open,
            high: latestBar.high,
            low: latestBar.low,
            close: latestBar.close
          };
        }

        setMarketPrices(prev => (prev[selectedCoin] === latestBar.close ? prev : { ...prev, [selectedCoin]: latestBar.close }));
      } else {
        setIsChartLoading(false);
      }
    };

    loadAndTrackChartKlines();
    const pollTimer = setInterval(loadAndTrackChartKlines, 10000);

    const handleResize = () => {
      if (!isDisposed && container && container.clientWidth > 0) {
        chart.applyOptions({ width: container.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(container);
    }

    return () => {
      isDisposed = true;
      clearInterval(pollTimer);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      lwCandleSeriesRef.current = null;
      lwLastCandleRef.current = null;
      lwPriceLinesRef.current = [];
      chart.remove();
    };
  }, [activeTab, chartEngine, selectedCoin, selectedTimeframe, fetchKlinesForSymbol]);

  // Smoothly tick current candle when marketPrices[selectedCoin] updates without recreating chart
  useEffect(() => {
    const series = lwCandleSeriesRef.current;
    const lastBar = lwLastCandleRef.current;
    const livePrice = marketPrices[selectedCoin];
    if (!series || !lastBar || !livePrice || !Number.isFinite(livePrice) || livePrice <= 0) return;

    const updatedBar = {
      time: lastBar.time as any,
      open: lastBar.open,
      high: Math.max(lastBar.high, livePrice),
      low: Math.min(lastBar.low, livePrice),
      close: livePrice
    };
    lwLastCandleRef.current = updatedBar;
    try {
      series.update(updatedBar);
    } catch {}
  }, [marketPrices, selectedCoin]);

  // Draw / update active signal price lines on the chart without destroying the chart canvas
  useEffect(() => {
    const series = lwCandleSeriesRef.current;
    if (!series || activeTab !== 'chart' || chartEngine !== 'LIGHTWEIGHT') return;

    for (const oldLine of lwPriceLinesRef.current) {
      try {
        series.removePriceLine(oldLine);
      } catch {}
    }
    lwPriceLinesRef.current = [];

    const coinSig = globalJournal.find(s => s.symbol === selectedCoin && !s.resolved && (!s.outcome || s.outcome === 'OPEN'));
    if (coinSig) {
      const norm = normalizeSignalTargets(coinSig);
      try {
        lwPriceLinesRef.current.push(
          series.createPriceLine({ price: norm.entry, color: '#ffffff', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'ENTRY' }),
          series.createPriceLine({ price: norm.stopLoss, color: '#ff4d4d', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'SL' }),
          series.createPriceLine({ price: norm.tp1, color: '#00e676', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'T1' }),
          series.createPriceLine({ price: norm.tp2, color: '#00d2ff', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'T2 (MAIN TP)' }),
          series.createPriceLine({ price: norm.tp3, color: '#ffcc00', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'T3 (RUNNER)' })
        );
      } catch {}
    }
  }, [activeTab, chartEngine, selectedCoin, globalJournal]);

  // Accuracy Calculation directly from Google Sheet Global Database + Live FAPI Evaluation
  const activeJournal = globalJournal;

  // Strictly display ONLY Open / Active signals in Google Sheet Journal Signals list
  const displayedSignals = useMemo(() => {
    const list = activeJournal.map(s => normalizeSignalTargets(s));
    return list.filter(s => {
      if (s.direction !== 'LONG' && s.direction !== 'SHORT') return false;
      if (s.resolved || s.outcome === 'WIN' || s.outcome === 'LOSS' || s.outcome === 'EXPIRED') return false;
      const liveP = marketPrices[s.symbol] || s.currentPrice || s.entry;
      const pnl = calculateSignalPnLProgress(s, liveP);
      const hits = computeTargetHits(s, liveP, pnl.progressPct);
      // Once main TP (T2) or SL is hit, do not show in active signals list
      if (hits.t2Hit || hits.slHit) return false;
      return true;
    });
  }, [activeJournal, marketPrices]);

  const stats = useMemo(() => {
    const activeCount = displayedSignals.length;
    let activeT1Hits = 0;

    for (const sig of displayedSignals) {
      const liveP = marketPrices[sig.symbol] || sig.currentPrice || sig.entry;
      const pnl = calculateSignalPnLProgress(sig, liveP);
      const hits = computeTargetHits(sig, liveP, pnl.progressPct);
      if (hits.t1Hit) activeT1Hits++;
    }

    const totalWins = sheetAccuracy.wins;
    const totalLosses = sheetAccuracy.losses;
    const totalClosed = Math.max(sheetAccuracy.totalClosed, totalWins + totalLosses);
    const t1Count = Math.max(sheetAccuracy.tp1Wins, totalWins) + activeT1Hits;
    const t2Count = Math.max(sheetAccuracy.tp2Wins, totalWins);
    const t3Count = sheetAccuracy.tp3Wins;

    const decisive = totalWins + totalLosses;
    const winRate = decisive > 0 ? ((totalWins / decisive) * 100).toFixed(1) + '%' : '0.0%';

    return {
      activeCount,
      totalClosed,
      wins: totalWins,
      losses: totalLosses,
      winRate,
      t1Count,
      t2Count,
      t3Count
    };
  }, [displayedSignals, marketPrices, sheetAccuracy]);

  // Dynamic AI Quantitative Radar Hot Pairs computed from live market changes across all 35+ & newly launched pairs
  const recommendedHotPairs = useMemo(() => {
    const list = allCoins.map(c => {
      const price = marketPrices[c.symbol] || c.basePrice;
      const change = marketChanges[c.symbol] || 0;
      const isPositive = change >= 0;
      return {
        symbol: c.symbol,
        name: c.name,
        price,
        change,
        direction: (isPositive ? 'LONG' : 'SHORT') as 'LONG' | 'SHORT',
        confidence: Math.min(94, Math.max(78, Math.round(80 + Math.abs(change) * 2.5)))
      };
    });

    // 1. Top Bullish Momentum Breakout
    const sortedGainers = [...list].sort((a, b) => b.change - a.change);
    const topMomentum = sortedGainers[0] || list[0];

    // 2. High Liquidity Benchmark Anchor (BTC or ETH, distinct from topMomentum)
    const institutionalCandidate = list.find(c => c.symbol === 'BTCUSDT');
    const institutional = (institutionalCandidate && institutionalCandidate.symbol !== topMomentum.symbol)
      ? institutionalCandidate
      : (list.find(c => c.symbol === 'ETHUSDT' && c.symbol !== topMomentum.symbol) || list[1]);

    // 3. Oversold Demand Rebound Candidate (distinct from topMomentum & institutional)
    const sortedDippers = [...list].sort((a, b) => a.change - b.change);
    const dipRebound = sortedDippers.find(c => c.symbol !== topMomentum.symbol && c.symbol !== institutional.symbol) || list[2];

    return [
      {
        ...topMomentum,
        tagClass: 'hot',
        category: 'TOP GAINER (24H)',
        tf: '24h',
        reason: `${topMomentum.change >= 0 ? '+' : ''}${topMomentum.change.toFixed(2)}% in last 24 hours`
      },
      {
        ...institutional,
        tagClass: 'breakout',
        category: 'MARKET BENCHMARK',
        tf: '24h',
        reason: `${institutional.change >= 0 ? '+' : ''}${institutional.change.toFixed(2)}% in last 24 hours`
      },
      {
        ...dipRebound,
        tagClass: 'momentum',
        category: 'TOP LOSER (24H)',
        tf: '24h',
        reason: `${dipRebound.change >= 0 ? '+' : ''}${dipRebound.change.toFixed(2)}% in last 24 hours`
      }
    ];
  }, [allCoins, marketPrices, marketChanges]);

  // Auth Submit (Login / Register to Google Sheet)
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const u = authUsername.trim().toLowerCase();
    const p = authPassword.trim();

    if (!u || u.length < 3) {
      setAuthError('Username kam az kam 3 characters ka hona chahiye.');
      return;
    }
    if (!p || p.length < 6) {
      setAuthError('Password kam az kam 6 characters ka hona chahiye.');
      return;
    }

    try {
      if (authMode === 'register') {
        const res = await callBackend('register', { username: u, password: p, referralCode: authRefCode.trim() });
        if (res && res.error) {
          if (res.code === 'DEVICE_LOCKED' || (res.message && res.message.toLowerCase().includes('device'))) {
            setDeviceLockAlert({
              open: true,
              message: res.message || 'Is device se pehle hi account registered hai. Aik device par aik account ki ijazat hai.',
              existingUser: res.existingUser
            });
            setLoginModalOpen(false);
            return;
          }
          if (res.message && (res.message.toLowerCase().includes('already') || res.message.toLowerCase().includes('pehle se') || res.message.toLowerCase().includes('exists'))) {
            setAuthError('Yeh username pehle se registered hai! Password enter karein aur Login button dabayein.');
            setAuthMode('login');
            return;
          }
          setAuthError(res.message || 'Registration nakam hui.');
          return;
        }
        localStorage.setItem(KEYS.USER, u);
        loadUserProfile(u, p);
        verifyAndSyncWithGoogleSheet(u);
        setLoginModalOpen(false);
        showToast(`Mubarak! Account ${u} Google Sheet mein kamyabi se register ho gaya!`, 'success');
      } else {
        // LOGIN MODE
        const res = await callBackend('login', { username: u, password: p });
        if (res && res.error) {
          // Check local cache fallback
          const rawDb = localStorage.getItem(KEYS.USERS_DB);
          const db = rawDb ? JSON.parse(rawDb) : {};
          if (db[u] && db[u].password && db[u].password === p) {
            localStorage.setItem(KEYS.USER, u);
            loadUserProfile(u, p);
            verifyAndSyncWithGoogleSheet(u);
            setLoginModalOpen(false);
            showToast(`Khushamdeed ${u.toUpperCase()}! Login kamyab raha.`, 'success');
            return;
          }

          if (res.message && (res.message.toLowerCase().includes('nahi mila') || res.message.toLowerCase().includes('not found'))) {
            setAuthError('Yeh username Google Sheet mein nahi mila. Agar aap naye hain to oper "Register" tab par click karein.');
          } else if (res.message && (res.message.toLowerCase().includes('ghalat') || res.message.toLowerCase().includes('password'))) {
            setAuthError('Ghalat Password! Baraye meharbani sahi password enter karein.');
          } else {
            // Server connection issue fallback
            if (db[u]) {
              localStorage.setItem(KEYS.USER, u);
              loadUserProfile(u, p);
              setLoginModalOpen(false);
              showToast(`Khushamdeed ${u.toUpperCase()}! (Offline Mode Login)`, 'info');
              return;
            }
            setAuthError(res.message || 'Backend se rabta nahi ho saka. Dobara koshish karein.');
          }
          return;
        }
        localStorage.setItem(KEYS.USER, u);
        loadUserProfile(u, p);
        verifyAndSyncWithGoogleSheet(u);
        setLoginModalOpen(false);
        showToast(`Khushamdeed ${u.toUpperCase()}! Google Sheet se login tasdeeq ho gayi.`, 'success');
      }
    } catch {
      // Local recovery if server is unreachable
      const rawDb = localStorage.getItem(KEYS.USERS_DB);
      const db = rawDb ? JSON.parse(rawDb) : {};
      if (db[u] && (!db[u].password || db[u].password === p)) {
        localStorage.setItem(KEYS.USER, u);
        loadUserProfile(u, p);
        setLoginModalOpen(false);
        showToast(`Khushamdeed ${u.toUpperCase()}! Local session restored.`, 'info');
      } else {
        setAuthError('Google Sheet server se rabta nahi ho saka. Internet connection check karein.');
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(KEYS.USER);
    setUser(null); // Strictly set to null to force login screen
    showToast('Aap kamyabi se logout ho gaye hain.', 'info');
  };

  // Redeem Premium Code (Direct to Google Sheet)
  const handleRedeemCode = async () => {
    if (!redeemCode.trim()) {
      showToast('Baraye meharbani VIP Code enter karein.', 'error');
      return;
    }
    if (!user) {
      showToast('Code redeem karne ke liye pehle Login karein!', 'info');
      setLoginModalOpen(true);
      return;
    }

    try {
      const codeClean = redeemCode.trim().toUpperCase();
      const res = await callBackend('redeem_premium_code', { username: user.username, code: codeClean });
      if (res && (res.success || (!res.error && (res.planType || res.plan)))) {
        const plan = String(res.planType || res.plan || 'BASIC').toUpperCase() as any;
        const newQuota = Number(res.signalsPerDay) || PLAN_LIMITS[plan] || 5;
        const updatedUser: UserProfile = {
          ...user,
          plan,
          planBaseQuota: newQuota,
          dailyQuotaLeft: res.signalsLeft !== undefined ? Number(res.signalsLeft) : newQuota,
          isSheetVerified: true
        };
        setUser(updatedUser);
        const rawDb = localStorage.getItem(KEYS.USERS_DB);
        const db = rawDb ? JSON.parse(rawDb) : {};
        db[user.username] = updatedUser;
        localStorage.setItem(KEYS.USERS_DB, JSON.stringify(db));

        setAdminCodes(prev => {
          const next = prev.map(c => c.code === codeClean ? { ...c, used: true, usedBy: user.username } : c);
          localStorage.setItem(KEYS.CODES, JSON.stringify(next));
          return next;
        });

        setRedeemCode('');
        setPremiumModalOpen(false);
        verifyAndSyncWithGoogleSheet(user.username);
        showToast(`Mubarak! ${plan} Plan Google Sheet mein active ho gaya (${newQuota} signals/day)!`, 'success');
      } else {
        showToast(res?.message || 'Ghalat ya Naqabil-e-amal VIP Code!', 'error');
      }
    } catch {
      showToast('Code verify karne mein kharabi hui.', 'error');
    }
  };

  const handleShareBonus = async (platform: string) => {
    if (!user) {
      showToast('Share bonus claim karne ke liye pehle Login karein.', 'info');
      setLoginModalOpen(true);
      return;
    }
    const shareUrl = window.location.origin;
    const shareText = `CryptoWorld - Pakistan ka pehla AI-powered crypto signals app! Real-time Binance data aur daily free quota. Mera referral code use karein: ${user.referralCode} 👉 ${shareUrl}`;

    try {
      const res = await callBackend('share_claim', { username: user.username, platform });
      if (res && res.error) {
        showToast(res.message || 'Share bonus claim nahi ho saka.', 'error');
        return;
      }
      await verifyAndSyncWithGoogleSheet(user.username);
      showToast('Shukriya! +0.5 Bonus Signal aapke quota mein shamil ho gaya!', 'success');
    } catch {
      showToast('Share bonus verify nahi ho saka. Dobara koshish karein.', 'error');
      return;
    }

    let link = '';
    if (platform === 'whatsapp') link = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    if (platform === 'twitter') link = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    if (platform === 'telegram') link = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
    if (platform === 'facebook') link = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    if (link) window.open(link, '_blank');
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = feedbackText.trim();
    if (!cleanText) {
      showToast('Baraye meharbani apni raye ya tajweez darj karein.', 'error');
      return;
    }
    if (cleanText.length < 5) {
      showToast('Tajweez kam az kam 5 characters ki honi chahiye.', 'error');
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      const res = await callBackend('submit_suggestion', {
        username: user?.username || 'Guest',
        category: feedbackCategory,
        suggestion: cleanText
      });

      if (res && (res.success || !res.error)) {
        setFeedbackText('');
        showToast(res.message || 'Shukriya! Aapki suggestion Google Sheet mein mehfooz ho gayi.', 'success');

        // Refresh suggestions list from Google Sheet
        if (user && user.username !== 'guest') {
          const mySugg = await callBackend('get_my_suggestions', { username: user.username });
          if (mySugg && Array.isArray(mySugg.suggestions)) {
            setUserSuggestions(mySugg.suggestions);
          }
        }
      } else {
        showToast(res?.message || 'Suggestion save karne mein masla pesh aya.', 'error');
      }
    } catch {
      showToast('Google Sheet server se rabta nahi ho saka.', 'error');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // -------------------------------------------------------------
  // MAIN COMPONENT RETURN & GUARDS
  // -------------------------------------------------------------

  // 1. FAST LOADING ANIMATION (Only for a brief moment)
  if (isAppLoading) {
    return (
      <div className="app-launch-screen">
        <div className="launch-core">
          <div className="launch-radar-ring">
            <div className="radar-sweep-beam" />
            <div className="radar-ping-ring" />
            <div className="launch-logo-inner">
              <Zap size={38} color="#00e5ff" />
            </div>
          </div>
          <div className="launch-brand-title">CryptoWorld <span>AI</span></div>
          <div className="launch-brand-subtitle">QUANTUM CRYPTO INTELLIGENCE SYSTEM</div>
          <div className="launch-progress-wrap">
            <div className="launch-progress-bar" style={{ width: `${loadingProgress}%` }} />
          </div>
          <div className="launch-status-text">{loadingStatus}</div>
        </div>
      </div>
    );
  }

  // 2. STRICT LOGIN GUARD: If no user is logged in, show Login/Register Screen
  if (!user) {
    return (
      <div style={{ background: '#0b0f19', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', width: '100vw', position: 'fixed', top: 0, left: 0, zIndex: 99999 }}>
        <div className="material-card" style={{ maxWidth: '440px', width: '100%', border: '1px solid var(--accent-cyan)', boxShadow: '0 8px 32px rgba(0,210,255,0.18)', background: '#121824', padding: '26px', borderRadius: '14px' }}>
          <div style={{ textAlign: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', background: 'rgba(0,210,255,0.1)', marginBottom: '8px' }}>
              <Zap size={32} color="#00e5ff" />
            </div>
            <h2 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 800, margin: '0 0 6px' }}>CryptoWorld AI Login</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: 0 }}>
              {authMode === 'login'
                ? 'Apne Google Sheet account credentials se login karein. Har new device par login zaroori hai.'
                : 'Naya account banayein (aik device par sirf 1 account allow hai).'}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#090d16', padding: '4px', borderRadius: '8px', marginBottom: '18px', border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              className={authMode === 'login' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '8px', fontSize: '0.85rem', fontWeight: 700, borderRadius: '6px', border: authMode === 'login' ? 'none' : 'transparent' }}
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
            >
              🔑 Login
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '8px', fontSize: '0.85rem', fontWeight: 700, borderRadius: '6px', border: authMode === 'register' ? 'none' : 'transparent' }}
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
            >
              📝 Register
            </button>
          </div>

          <form onSubmit={handleAuth}>
            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ display: 'block', marginBottom: '6px', color: '#fff', fontSize: '0.85rem' }}>Username</label>
              <input
                type="text"
                className="form-input"
                style={{ width: '100%', padding: '10px 12px', background: '#0b0f19', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '8px' }}
                placeholder="Apna username darj karein"
                value={authUsername}
                onChange={e => setAuthUsername(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="form-group" style={{ marginBottom: '14px' }}>
              <label className="form-label" style={{ display: 'block', marginBottom: '6px', color: '#fff', fontSize: '0.85rem' }}>Password</label>
              <input
                type="password"
                className="form-input"
                style={{ width: '100%', padding: '10px 12px', background: '#0b0f19', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '8px' }}
                placeholder="••••••••"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
              />
            </div>

            {authMode === 'register' && (
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label className="form-label" style={{ display: 'block', marginBottom: '6px', color: '#fff', fontSize: '0.85rem' }}>Referral Code (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ width: '100%', padding: '10px 12px', background: '#0b0f19', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '8px' }}
                  placeholder="e.g. ZULQ2026"
                  value={authRefCode}
                  onChange={e => setAuthRefCode(e.target.value)}
                />
              </div>
            )}

            {authError && (
              <div style={{ color: '#ff4d4d', fontSize: '0.85rem', marginBottom: '14px', textAlign: 'center', background: 'rgba(255, 77, 77, 0.1)', padding: '8px', borderRadius: '6px' }}>
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', padding: '12px', fontWeight: 800, borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem' }}
            >
              {authMode === 'login' ? '🚀 Login to Account' : '✨ Register New Account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 3. MAIN APP UI
  return (
    <>
      {/* Toast Overlay */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <button className="btn-icon" onClick={() => setSidebarOpen(true)} title="Menu">
            <Menu size={20} />
          </button>
          <div className="logo-badge" onClick={() => setActiveTab('signals')} style={{ cursor: 'pointer' }}>
            <span className="logo-icon">
              <Zap size={22} color="#00e5ff" />
            </span>
            <span className="logo-title">CryptoWorld</span>
            <span className="logo-tag">AI PRO</span>
          </div>
        </div>

        <div className="header-right">
          {isAdmin ? (
            <button
              className="btn-icon"
              title="Admin Control Center"
              onClick={() => setActiveTab('admin')}
              style={{ color: '#ff6b8b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ShieldCheck size={18} />
            </button>
          ) : (
            <button
              className="btn-icon"
              title="Admin Login"
              onClick={() => setAdminLoginModalOpen(true)}
              style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <ShieldCheck size={18} />
            </button>
          )}

          <button
            className="btn-icon"
            onClick={() => openAlertModalForCoin(selectedCoin)}
            title="Price Alerts"
            style={{ position: 'relative', color: 'var(--accent-cyan)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {priceAlerts.some(a => a.triggered) ? <BellRing size={18} color="#ffb300" /> : <Bell size={18} />}
            {priceAlerts.filter(a => !a.triggered).length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  minWidth: '16px',
                  height: '16px',
                  borderRadius: '999px',
                  background: '#00d2ff',
                  color: '#000',
                  fontSize: '0.62rem',
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px'
                }}
              >
                {priceAlerts.filter(a => !a.triggered).length}
              </span>
            )}
          </button>

          <button className="btn-icon" onClick={() => setPremiumModalOpen(true)} title="VIP Upgrade" style={{ color: 'var(--accent-yellow)' }}>
            <Star size={18} fill="#ffb300" />
          </button>

          <button
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            onClick={() => {
              if (user && user.username !== 'guest') {
                setActiveTab('account');
              } else {
                setLoginModalOpen(true);
              }
            }}
          >
            <User size={14} style={{ marginRight: '4px' }} />
            <span>{user && user.username !== 'guest' ? user.username.toUpperCase() : 'Login'}</span>
          </button>
        </div>
      </header>

      {/* Slide-in Sidebar */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? 'active' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-badge">
            <span className="logo-icon">
              <Zap size={22} color="#00e5ff" />
            </span>
            <span className="logo-title">CryptoWorld</span>
          </div>
          <button className="btn-icon" onClick={() => setSidebarOpen(false)} style={{ border: 'none', fontSize: '1.4rem' }}>
            <X size={20} />
          </button>
        </div>

        <div className="sidebar-content">
          <button
            className={`nav-link ${activeTab === 'signals' ? 'active' : ''}`}
            onClick={() => { setActiveTab('signals'); setSidebarOpen(false); }}
          >
            <span className="nav-icon"><Zap size={16} /></span>
            <span>Signal Generator & Hours</span>
          </button>
          <button
            className={`nav-link ${activeTab === 'progress' ? 'active' : ''}`}
            onClick={() => { setActiveTab('progress'); setSidebarOpen(false); }}
          >
            <span className="nav-icon"><TrendingUp size={16} /></span>
            <span>Live Signal Progress</span>
          </button>
          <button
            className={`nav-link ${activeTab === 'chart' ? 'active' : ''}`}
            onClick={() => { setActiveTab('chart'); setSidebarOpen(false); }}
          >
            <span className="nav-icon"><BarChart2 size={16} /></span>
            <span>TradingView Chart & Market</span>
          </button>
          <button
            className={`nav-link ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => { setActiveTab('account'); setSidebarOpen(false); }}
          >
            <span className="nav-icon"><User size={16} /></span>
            <span>Account & VIP Quota</span>
          </button>

          <div style={{ height: '1px', background: 'var(--border-color)', margin: '12px 0' }} />

          <a href="/src/pages/about.html" className="nav-link">
            <span className="nav-icon"><Info size={16} /></span>
            <span>About Us</span>
          </a>
          <a href="/src/pages/terms.html" className="nav-link">
            <span className="nav-icon"><CheckCircle2 size={16} /></span>
            <span>Terms & Conditions</span>
          </a>
          <a href="/src/pages/disclaimer.html" className="nav-link">
            <span className="nav-icon"><AlertTriangle size={16} /></span>
            <span>Risk Disclaimer</span>
          </a>
          <a href="/src/pages/contact.html" className="nav-link">
            <span className="nav-icon"><MessageCircle size={16} /></span>
            <span>Contact Support</span>
          </a>

          {isAdmin ? (
            <button
              className={`nav-link ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => { setActiveTab('admin'); setSidebarOpen(false); }}
              style={{ color: '#ff6b8b' }}
            >
              <span className="nav-icon"><ShieldCheck size={16} /></span>
              <span>Admin Panel</span>
            </button>
          ) : (
            <button
              className="nav-link"
              onClick={() => { setAdminLoginModalOpen(true); setSidebarOpen(false); }}
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="nav-icon"><ShieldCheck size={16} /></span>
              <span>Admin Login</span>
            </button>
          )}
        </div>

        <div className="sidebar-footer">
          <div>CryptoWorld v{CURRENT_APP_VERSION} (Material React)</div>
          <div style={{ marginTop: '4px' }}>Google Sheets Cloud DB & Binance Live</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="app-main">
        {/* Triggered Price Alert Banner */}
        {triggeredAlertBanner && (
          <div
            className="material-card"
            style={{
              border: '1px solid #00e676',
              background: 'rgba(0, 230, 118, 0.12)',
              padding: '12px 16px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BellRing size={20} color="#00e676" />
              <div>
                <div style={{ fontWeight: 800, color: '#00e676', fontSize: '0.9rem' }}>
                  Price Target Hit: {triggeredAlertBanner.symbol}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#fff' }}>
                  {triggeredAlertBanner.condition === 'ABOVE' ? 'Crossed above' : 'Dropped below'} ${formatCryptoPrice(triggeredAlertBanner.targetPrice)} (Hit at ${formatCryptoPrice(triggeredAlertBanner.triggeredPrice || triggeredAlertBanner.targetPrice)})
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                onClick={() => {
                  setSelectedCoin(triggeredAlertBanner.symbol);
                  setActiveTab('chart');
                  setTriggeredAlertBanner(null);
                }}
              >
                Open Chart
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '5px 10px', borderColor: '#00e676', color: '#00e676' }}
                onClick={() => {
                  setAlertsModalOpen(true);
                  setTriggeredAlertBanner(null);
                }}
              >
                Manage Alerts
              </button>
              <button
                type="button"
                onClick={() => setTriggeredAlertBanner(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                aria-label="Dismiss price alert"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* User Status Bar with Google Sheet Verification Badge */}
        <div className="user-panel-bar material-card">
          <div className="stat-item">
            <span className="stat-label">Daily Quota Left</span>
            <div className="stat-value">
              <span className="badge-quota">{user ? user.dailyQuotaLeft.toFixed(2) : '1.00'} signals</span>
              {user && user.isSheetVerified && (
                <span className="sheet-verified-badge" title="Verified with Google Sheet Quota Tab">
                  <Database size={10} /> Verified
                </span>
              )}
            </div>
          </div>
          <div className="stat-item">
            <span className="stat-label">Membership Tier</span>
            <div className="stat-value">
              <span className={`badge-plan ${(user?.plan || 'FREE').toLowerCase()}`}>{user?.plan || 'FREE'}</span>
            </div>
          </div>
          <div className="stat-item">
            <span className="stat-label">Google Sheet DB</span>
            <div className="stat-value" style={{ color: 'var(--accent-cyan)', fontSize: '0.85rem' }}>
              <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#00e5ff', boxShadow: '0 0 6px #00e5ff' }} />
              <span>{isSheetSyncing ? 'Syncing...' : (user?.isSheetVerified ? 'Connected' : 'Offline')}</span>
            </div>
          </div>
          <div className="stat-item">
            <span className="stat-label">Market Engine</span>
            <div className="stat-value" style={{ color: 'var(--accent-green)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#00e676', boxShadow: '0 0 6px #00e676' }} />
              <span>Binance Futures Live</span>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* TAB 1: SIGNALS & BEST TRADING HOURS                       */}
        {/* ========================================================= */}
        {activeTab === 'signals' && (
          <div className="tab-pane active">
            {/* Quick Coins Chips Strip */}
            <div className="coins-quick-strip">
              {SUPPORTED_COINS.slice(0, 8).map(c => {
                const price = marketPrices[c.symbol] || c.basePrice;
                const change = marketChanges[c.symbol] || 0;
                const isSelected = selectedCoin === c.symbol;
                return (
                  <button
                    key={c.symbol}
                    className={`material-chip ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedCoin(c.symbol)}
                  >
                    <span>{c.symbol.replace('USDT', '')}</span>
                    <span style={{ color: '#fff', marginLeft: '2px' }}>
                      ${price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <span style={{ color: change >= 0 ? '#00e676' : '#ff4d4d', marginLeft: '4px' }}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </span>
                  </button>
                );
              })}
            </div>

            {/* AI Quantitative Radar Suggestions Panel */}
            <div className="ai-suggestions-panel material-card">
              <div className="ai-panel-header">
                <div className="ai-panel-title">
                  <span className="ai-pulse-dot" />
                  <Radio size={18} color="#00e5ff" />
                  <span>📊 Market Movers (24h) — Top Gainer, Benchmark, Top Loser</span>
                </div>
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '4px 8px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
                  onClick={fetchMarketTickers}
                >
                  <RefreshCw size={12} style={{ marginRight: '4px' }} />
                  Re-Scan
                </button>
              </div>

              <div className="ai-suggestions-grid">
                {recommendedHotPairs.map((item, idx) => (
                  <div
                    key={`${item.category}-${item.symbol}-${idx}`}
                    className={`ai-suggestion-card ${item.tagClass}`}
                    onClick={() => {
                      setSelectedCoin(item.symbol);
                      setSelectedTimeframe(item.tf.split(' / ')[0]);
                      showToast(`${item.symbol} selected for AI analysis!`, 'info');
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="ai-card-top">
                      <div className="ai-pair-badge">
                        <span className={`token-icon ${item.symbol.substring(0, 3).toLowerCase()}`}>
                          {item.symbol.substring(0, 1)}
                        </span>
                        <strong style={{ color: '#fff' }}>{item.symbol}</strong>
                      </div>
                      <span className={`ai-signal-type-tag ${item.direction.toLowerCase()}`}>
                        {item.direction}
                      </span>
                    </div>
                    <div className="ai-card-mid">
                      <span className="ai-card-price">
                        ${item.price.toLocaleString(undefined, { minimumFractionDigits: item.price < 1 ? 4 : 2 })}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: item.change >= 0 ? '#00e676' : '#ff4d4d', fontWeight: 700 }}>
                        {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}% (24h)
                      </span>
                    </div>
                    <div className="ai-card-reason">{item.reason}</div>
                    <button className="ai-trade-btn">⚡ Analyze {item.symbol.replace('USDT', '')} Setup</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Generator Controls with Model Selection */}
            <div className="material-card">
              <div className="controls-bar">
                <div className="selector-group">
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>
                        Select Crypto Pair ({allCoins.length} Pairs)
                      </label>
                      <button
                        type="button"
                        onClick={() => openAlertModalForCoin(selectedCoin)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: 'rgba(0, 210, 255, 0.12)',
                          color: 'var(--accent-cyan)',
                          border: '1px solid rgba(0, 210, 255, 0.35)',
                          borderRadius: '6px',
                          padding: '2px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                        title={`Set target price alert for ${selectedCoin}`}
                      >
                        <Bell size={12} />
                        <span>Set Alert</span>
                      </button>
                    </div>
                    <select
                      className="app-select"
                      value={selectedCoin}
                      onChange={e => setSelectedCoin(e.target.value)}
                    >
                      <optgroup label="Benchmark Pairs">
                        {allCoins.filter(c => c.isMain8).map(c => (
                          <option key={c.symbol} value={c.symbol}>{c.symbol} ({c.name})</option>
                        ))}
                      </optgroup>
                      <optgroup label="Popular Altcoins (35+ Pairs)">
                        {allCoins.filter(c => !c.isMain8 && !c.isNewLaunch).map(c => (
                          <option key={c.symbol} value={c.symbol}>{c.symbol} ({c.name})</option>
                        ))}
                      </optgroup>
                      {allCoins.some(c => c.isNewLaunch) && (
                        <optgroup label="🆕 New Launches (Auto-Detected)">
                          {allCoins.filter(c => c.isNewLaunch).map(c => (
                            <option key={c.symbol} value={c.symbol}>🆕 {c.symbol} ({c.name})</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Timeframe</label>
                    <div className="timeframe-pill-group">
                      {['15m', '1h', '4h', '1d'].map(tf => (
                        <button
                          key={tf}
                          className={`tf-btn ${selectedTimeframe === tf ? 'active' : ''}`}
                          onClick={() => setSelectedTimeframe(tf)}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="form-label">
                      <Cpu size={12} style={{ display: 'inline', marginRight: '4px', color: 'var(--accent-cyan)' }} />
                      AI Engine Routing (code.gs Pipeline)
                    </label>
                    <div style={{ background: '#0b0f19', border: '1px solid rgba(0,210,255,0.2)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <span style={{ background: 'rgba(0,210,255,0.15)', color: 'var(--accent-cyan)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          1️⃣ Groq Primary (openai/gpt-oss-120b)
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>➔</span>
                        <span style={{ background: 'rgba(255,204,0,0.12)', color: '#ffcc00', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          2️⃣ Gemini Fallback
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>➔</span>
                        <span style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px' }}>
                          3️⃣ Technical Fallback
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {user && user.dailyQuotaLeft <= 0 ? (
                  <button
                    type="button"
                    className="btn-reward-ad"
                    onClick={handleWatchRewardedAd}
                    disabled={isAdLoading}
                  >
                    <div className="reward-ad-btn-content">
                      <div className="reward-ad-icon-pulse">
                        <Film size={22} color="#fbbf24" />
                      </div>
                      <div className="reward-ad-btn-texts">
                        <span className="reward-ad-title">
                          <Film size={18} /> {isAdLoading ? 'LOADING REAL ADMOB VIDEO...' : 'WATCH AD TO EARN +1 SIGNAL QUOTA'}
                        </span>
                        <span className="reward-ad-subtitle">
                          Daily quota khatam ho gaya! Google AdMob video mukammal dekh kar foran free signal unlock karein
                        </span>
                      </div>
                      <div className="reward-ad-badge">+1 SIGNAL</div>
                    </div>
                  </button>
                ) : (
                  <button
                    className={`btn-primary btn-generate-signal ${isScanning ? 'scanning' : ''}`}
                    onClick={generateSignal}
                    disabled={isScanning}
                  >
                    {isScanning ? (
                      <div className="btn-scanning-content">
                        <div className="quantum-orb-spinner">
                          <div className="orb-ring ring-1" />
                          <div className="orb-ring ring-2" />
                          <Zap size={16} className="orb-core" />
                        </div>
                        <div className="btn-scanning-text-wrap">
                          <span className="btn-scanning-title">AI QUANTUM RADAR SCANNING...</span>
                          <span className="btn-scanning-subtitle">{scanStep || 'Executing Groq / Gemini Confluence...'}</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Zap size={20} />
                        <span>GENERATE AI TRADING SIGNAL</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Scanning State & Market Momentum Indicator */}
              {isScanning && (
                <div className="radar-screen" style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'rgba(0, 229, 255, 0.12)',
                      border: '1px solid rgba(0, 229, 255, 0.4)',
                      borderRadius: '999px',
                      padding: '6px 14px',
                      marginBottom: '14px',
                      color: '#00e5ff',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      letterSpacing: '0.3px'
                    }}
                  >
                    <span className="ai-pulse-dot" />
                    <span>AI is analyzing market momentum</span>
                  </div>
                  <div className="radar-circle" />
                  <div className="radar-scanner" />
                  <div style={{ marginTop: '14px', color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.9rem' }}>
                    {scanStep || 'AI is analyzing market momentum...'}
                  </div>
                  <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    Syncing 100 OHLC candles ({selectedTimeframe}) + HTF (4H & 1D) + Live Price for {selectedCoin}
                  </div>
                </div>
              )}
            </div>

            {/* Backend / AI API Error Alert Banner */}
            {signalError && !isScanning && (
              <div
                className="material-card"
                style={{
                  border: '1px solid #ff4d4d',
                  background: 'rgba(255, 77, 77, 0.08)',
                  padding: '16px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <AlertTriangle size={20} color="#ff4d4d" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ color: '#ff6b8b', fontWeight: 800, fontSize: '0.92rem', marginBottom: '4px' }}>
                      Signal Generation Error
                    </div>
                    <div style={{ color: '#fff', fontSize: '0.84rem', lineHeight: 1.5 }}>
                      {signalError}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSignalError(null)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                  aria-label="Dismiss error"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Generated Signal Output (LONG/BUY, SHORT/SELL, or Simple Flat Market NO_TRADE) */}
            {currentSignal && !isScanning && (() => {
              const livePrice = marketPrices[currentSignal.symbol] || currentSignal.currentPrice || currentSignal.entry;
              const isNoTrade = currentSignal.direction === 'NO_TRADE';

              // 1. SIMPLE FLAT MARKET NO_TRADE RENDERING (No old WAIT design)
              if (isNoTrade) {
                return (
                  <div className="material-card signal-box" style={{ border: '1px solid #ffcc00', textAlign: 'center', padding: '24px 20px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255, 204, 0, 0.14)', color: '#ffcc00', border: '1px solid rgba(255, 204, 0, 0.35)', padding: '6px 14px', borderRadius: '8px', fontWeight: 800, fontSize: '0.85rem', marginBottom: '12px' }}>
                      <AlertTriangle size={16} />
                      <span>Market Flat - No Trade</span>
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>
                      {currentSignal.symbol} ({currentSignal.timeframe})
                    </div>
                    <p style={{ color: '#e2e8f0', fontSize: '0.92rem', margin: '0 0 12px', lineHeight: 1.5 }}>
                      Market flat hai, koi signal nahi mila
                    </p>
                    {currentSignal.reasoning && currentSignal.reasoning !== 'Market flat hai, koi signal nahi mila.' && (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 12px', lineHeight: 1.5 }}>
                        {currentSignal.reasoning}
                      </p>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      AI Engine: <strong style={{ color: 'var(--accent-cyan)' }}>{currentSignal.model}</strong>
                    </div>
                  </div>
                );
              }

              // 2. BUY (LONG) / SELL (SHORT) SIGNAL CARD RENDERING
              const pnl = calculateSignalPnLProgress(currentSignal, livePrice);

              return (
                <div className="material-card signal-box" style={{ border: '1px solid var(--accent-cyan)' }}>
                  <div className="signal-header-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`signal-badge-direction ${currentSignal.direction}`}>
                        {currentSignal.direction === 'LONG' ? 'BUY' : 'SELL'}
                      </span>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>{currentSignal.symbol}</span>
                      <span style={{ fontSize: '0.78rem', background: '#1c2336', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                        {currentSignal.timeframe}
                      </span>
                    </div>
                    <span className="badge-quality strong">{currentSignal.signalQuality}</span>
                  </div>

                  {/* Real-time Market PnL Progress Bar */}
                  <div className="pnl-progress-container">
                    <div className="pnl-progress-header">
                      <span style={{ color: 'var(--accent-red)' }}>SL: ${formatCryptoPrice(currentSignal.stopLoss)}</span>
                      <span style={{ color: pnl.isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {pnl.statusText}
                      </span>
                      <span style={{ color: 'var(--accent-cyan)' }}>TP: ${formatCryptoPrice(currentSignal.takeProfit)}</span>
                    </div>

                    <div className="pnl-progress-track">
                      <div className="pnl-progress-center-line" />
                      {pnl.isProfit ? (
                        <div
                          className="pnl-progress-fill profit"
                          style={{ width: `${pnl.fillWidth}%` }}
                        />
                      ) : (
                        <div
                          className="pnl-progress-fill loss"
                          style={{ width: `${pnl.fillWidth}%` }}
                        />
                      )}
                    </div>

                    <div className="pnl-progress-labels">
                      <span>100% SL Loss</span>
                      <span>Entry: ${formatCryptoPrice(currentSignal.entry)}</span>
                      <span>100% TP Success</span>
                    </div>
                  </div>

                  <div className="tracker-levels-row">
                    <div className="tracker-lvl-item">
                      <div className="t-lbl">ENTRY</div>
                      <div className="t-val">${formatCryptoPrice(currentSignal.entry)}</div>
                    </div>
                    <div className="tracker-lvl-item">
                      <div className="t-lbl">STOP LOSS</div>
                      <div className="t-val red">${formatCryptoPrice(currentSignal.stopLoss)}</div>
                    </div>
                    <div className="tracker-lvl-item">
                      <div className="t-lbl">TAKE PROFIT (T2)</div>
                      <div className="t-val green">${formatCryptoPrice(currentSignal.takeProfit)}</div>
                    </div>
                    <div className="tracker-lvl-item">
                      <div className="t-lbl">R:R RATIO</div>
                      <div className="t-val cyan">{currentSignal.rr}</div>
                    </div>
                  </div>

                  {(() => {
                    const cEntry = Number(currentSignal.entry) || 1;
                    const cT1Gain = Math.abs(((Number(currentSignal.tp1) - cEntry) / cEntry) * 100).toFixed(2);
                    const cT2Gain = Math.abs(((Number(currentSignal.tp2) - cEntry) / cEntry) * 100).toFixed(2);
                    const cT3Gain = Math.abs(((Number(currentSignal.tp3) - cEntry) / cEntry) * 100).toFixed(2);
                    const cHits = computeTargetHits(currentSignal, livePrice, pnl.progressPct);
                    return (
                      <div className="tracker-targets-grid">
                        <div
                          className="tracker-target-box"
                          style={{
                            borderColor: cHits.t1Hit ? '#00e676' : 'rgba(255,255,255,0.08)',
                            background: cHits.t1Hit ? 'rgba(0,230,118,0.12)' : undefined
                          }}
                        >
                          <div className="tracker-target-title">{cHits.t1Hit ? '✅ ' : ''}T1 (+{cT1Gain}%)</div>
                          <div className="tracker-target-price green">${formatCryptoPrice(currentSignal.tp1)}</div>
                          <span className={`tracker-target-tag ${cHits.t1Hit ? 'green' : ''}`}>
                            {cHits.t1Hit ? '✓ T1 HIT' : 'PENDING'}
                          </span>
                        </div>
                        <div
                          className="tracker-target-box"
                          style={{
                            borderColor: cHits.t2Hit ? '#00d2ff' : 'rgba(255,255,255,0.08)',
                            background: cHits.t2Hit ? 'rgba(0,210,255,0.12)' : undefined
                          }}
                        >
                          <div className="tracker-target-title">{cHits.t2Hit ? '✅ ' : ''}T2 (+{cT2Gain}%)</div>
                          <div className="tracker-target-price cyan">${formatCryptoPrice(currentSignal.tp2)}</div>
                          <span className={`tracker-target-tag ${cHits.t2Hit ? 'cyan' : ''}`}>
                            {cHits.t2Hit ? '✓ T2 HIT' : 'PENDING'}
                          </span>
                        </div>
                        <div
                          className="tracker-target-box"
                          style={{
                            borderColor: cHits.t3Hit ? '#ffcc00' : 'rgba(255,255,255,0.08)',
                            background: cHits.t3Hit ? 'rgba(255,204,0,0.12)' : undefined
                          }}
                        >
                          <div className="tracker-target-title">{cHits.t3Hit ? '✅ ' : ''}T3 (+{cT3Gain}%)</div>
                          <div className="tracker-target-price yellow">${formatCryptoPrice(currentSignal.tp3)}</div>
                          <span className={`tracker-target-tag ${cHits.t3Hit ? 'yellow' : ''}`}>
                            {cHits.t3Hit ? '✓ T3 HIT' : 'PENDING'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ background: '#0e1320', padding: '12px', borderRadius: '8px', marginTop: '12px', fontSize: '0.85rem', lineHeight: 1.6 }}>
                    <div style={{ color: 'var(--accent-cyan)', fontWeight: 700, marginBottom: '4px' }}>💡 AI Strategic Reasoning:</div>
                    <p style={{ color: 'var(--text-secondary)' }}>{currentSignal.reasoning}</p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>AI Model: <strong style={{ color: 'var(--accent-green)' }}>{currentSignal.model}</strong></span>
                    <span>Saved in: <strong style={{ color: 'var(--accent-cyan)' }}>Google Sheet Journal Tab ✓</strong></span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button
                      className="btn-secondary"
                      style={{ flex: 1, fontSize: '0.8rem' }}
                      onClick={() => {
                        const text = `⚡ CryptoWorld AI Signal: ${currentSignal.direction} ${currentSignal.symbol} (${currentSignal.timeframe})\nEntry: $${currentSignal.entry}\nSL: $${currentSignal.stopLoss}\nT1: $${currentSignal.tp1}\nT2: $${currentSignal.tp2}\nT3: $${currentSignal.tp3}\nModel: ${currentSignal.model}`;
                        navigator.clipboard.writeText(text);
                        showToast('Signal clipboard par copy ho gaya!', 'success');
                      }}
                    >
                      <Copy size={14} style={{ marginRight: '4px' }} />
                      Copy Trade Plan
                    </button>
                    <button
                      className="btn-primary"
                      style={{ flex: 1, fontSize: '0.8rem' }}
                      onClick={() => {
                        setActiveTab('progress');
                        showToast('Signal journal mein track ho raha hai.', 'info');
                      }}
                    >
                      <TrendingUp size={14} style={{ marginRight: '4px' }} />
                      Track in Progress
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Best Trading Hours */}
            <div className="material-card">
              <div className="trading-hours-header">
                <h3 className="card-title" style={{ marginBottom: 0 }}>🕒 Prime Global Crypto Trading Sessions (PKT)</h3>
                <span className="prime-radar-badge">London & NY Active</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
                High volume sessions offer highest win rate setups and tight spreads:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ background: '#111624', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#fff' }}>London Session (13:00 - 22:00 PKT)</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Major breakout volume & volatility expansion</div>
                  </div>
                  <span className="status-badge-prime">PRIME ACTIVE</span>
                </div>
                <div style={{ background: '#111624', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#fff' }}>New York Session (18:00 - 03:00 PKT)</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>US institutional flows & high liquidity moves</div>
                  </div>
                  <span className="badge-quality moderate">UPCOMING</span>
                </div>
                <div style={{ background: '#111624', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#fff' }}>Asian Session (05:00 - 14:00 PKT)</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Consolidation & range accumulation</div>
                  </div>
                  <span className="badge-quality moderate">CLOSED</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: LIVE SIGNAL PROGRESS & GOOGLE SHEET JOURNAL        */}
        {/* ========================================================= */}
        {activeTab === 'progress' && (
          <div className="tab-pane active">
            {/* Google Sheets Global Database Header */}
            <div className="material-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h2 className="card-title" style={{ marginBottom: '2px' }}>
                    🌐 Google Sheets Global Signal Journal
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>
                    Auto Win/Loss & TP/SL Tracking via Binance FAPI & Lightweight Charts
                  </p>
                </div>

                <button
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.78rem' }}
                  onClick={() => {
                    showToast('Syncing Google Sheet Journal & Binance FAPI...', 'info');
                    fetchOpenSignalsFromSheet();
                    fetchSheetAccuracy();
                    fetchMarketTickers();
                  }}
                >
                  <RefreshCw size={14} />
                  Sync Sheet Journal
                </button>
              </div>

              {/* Accuracy Grid */}
              <div className="accuracy-grid" style={{ marginTop: '14px' }}>
                <div className="accuracy-card">
                  <div className="accuracy-title">Active Signals</div>
                  <div className="accuracy-val cyan">{stats.activeCount}</div>
                  <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Live in Market</div>
                </div>

                <div className="accuracy-card">
                  <div className="accuracy-title">Total Closed</div>
                  <div className="accuracy-val yellow">{stats.totalClosed}</div>
                  <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Evaluated Trades</div>
                </div>

                {/* Accuracy Wins with Multi-Target Badges */}
                <div className="accuracy-card">
                  <div className="accuracy-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <span>Wins (TP Hit)</span>
                    <span style={{ fontSize: '0.62rem', background: 'rgba(0,230,118,0.2)', color: '#00e676', padding: '0 4px', borderRadius: '4px' }}>TP1+</span>
                  </div>
                  <div className="accuracy-val green">{stats.wins}</div>
                  <div className="stat-tp-breakdown" style={{ fontSize: '0.67rem', marginTop: '4px', display: 'flex', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    <span title="Total times Take Profit 1 was hit" style={{ background: 'rgba(0,230,118,0.14)', color: '#00e676', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                      T1✓: {stats.t1Count}
                    </span>
                    <span title="Total times Take Profit 2 was hit" style={{ background: 'rgba(0,210,255,0.14)', color: '#00d2ff', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                      T2✓: {stats.t2Count}
                    </span>
                    <span title="Total times Take Profit 3 was hit" style={{ background: 'rgba(255,204,0,0.14)', color: '#ffcc00', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                      T3✓: {stats.t3Count}
                    </span>
                  </div>
                </div>

                <div className="accuracy-card">
                  <div className="accuracy-title">Losses (SL Hit)</div>
                  <div className="accuracy-val red">{stats.losses}</div>
                  <div style={{ fontSize: '0.67rem', marginTop: '4px' }}>
                    <span style={{ background: 'rgba(255,107,139,0.14)', color: '#ff6b8b', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                      🛑 SL Hit: {stats.losses}
                    </span>
                  </div>
                </div>

                <div className="accuracy-card">
                  <div className="accuracy-title">Win Rate</div>
                  <div className="accuracy-val green">{stats.winRate}</div>
                  <div style={{ fontSize: '0.67rem', color: '#00e676', fontWeight: 600 }}>TP1/2/3 Hit Rate</div>
                </div>
              </div>
            </div>

            {/* Open / Active Signals Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                🌐 Google Sheet Journal Signals:
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span className="tf-btn active" style={{ cursor: 'default' }}>
                  🟢 OPEN / ACTIVE ONLY ({displayedSignals.length})
                </span>
              </div>
            </div>

            {/* Signals Feed with Live Market PnL Progress Bars & T1/T2/T3 Tick Marks */}
            <div>
              {displayedSignals.length === 0 ? (
                <div className="material-card" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                  ✅ Is waqt Google Sheet Journal mein koi OPEN / ACTIVE trade mojood nahi hai. TP ya SL hit hone wale tamam signals Wins ({stats.wins}) aur Losses ({stats.losses}) mein record ho chuke hain!
                </div>
              ) : (
                displayedSignals.map(sig => {
                  const livePrice = marketPrices[sig.symbol] || sig.currentPrice || sig.entry;
                  const pnl = calculateSignalPnLProgress(sig, livePrice);
                  const { t1Hit, t2Hit, t3Hit, slHit } = computeTargetHits(sig, livePrice, pnl.progressPct);

                  return (
                    <div key={sig.id} className="live-tracker-card material-card">
                      <div className="tracker-header">
                        <div className="tracker-pair-badge">
                          <span className={`signal-badge-direction ${sig.direction.toLowerCase()}`} style={{ fontSize: '0.75rem', padding: '2px 8px' }}>
                            {sig.direction === 'LONG' ? 'BUY' : 'SELL'}
                          </span>
                          <strong style={{ fontSize: '1rem', color: '#fff' }}>{sig.symbol}</strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: '#1c2336', padding: '1px 6px', borderRadius: '4px' }}>
                            {sig.timeframe}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>
                            👤 {sig.userDisplayName || 'TRADER'}
                          </span>
                        </div>

                        <div className="tracker-status-wrap">
                          {t3Hit && (
                            <span className="tracker-pnl-pill profit">
                              🏆 T1✓ T2✓ T3✓ HIT
                            </span>
                          )}
                          {!t3Hit && t2Hit && (
                            <span className="tracker-pnl-pill profit">
                              🚀 T1✓ T2✓ HIT
                            </span>
                          )}
                          {!t3Hit && !t2Hit && t1Hit && (
                            <span className="tracker-pnl-pill profit">
                              🎯 T1✓ HIT
                            </span>
                          )}
                          {!t1Hit && !t2Hit && !t3Hit && slHit && (
                            <span className="tracker-pnl-pill loss" style={{ background: 'rgba(255,77,77,0.18)', color: '#ff6b8b', border: '1px solid #ff4d4d' }}>
                              🛑 SL HIT
                            </span>
                          )}
                          {!t1Hit && !t2Hit && !t3Hit && !slHit && (
                            <span className="tracker-pnl-pill neutral">
                              ● ACTIVE IN MARKET
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Real-time Market PnL Progress Bar based on TP & SL */}
                      <div className="pnl-progress-container">
                        <div className="pnl-progress-header">
                          <span style={{ color: 'var(--accent-red)' }}>SL: ${formatCryptoPrice(sig.stopLoss)}</span>
                          <span style={{ color: pnl.isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                            {pnl.statusText}
                          </span>
                          <span style={{ color: 'var(--accent-cyan)' }}>TP: ${formatCryptoPrice(sig.takeProfit)}</span>
                        </div>

                        <div className="pnl-progress-track">
                          <div className="pnl-progress-center-line" />
                          {pnl.isProfit ? (
                            <div
                              className="pnl-progress-fill profit"
                              style={{ width: `${pnl.fillWidth}%` }}
                            />
                          ) : (
                            <div
                              className="pnl-progress-fill loss"
                              style={{ width: `${pnl.fillWidth}%` }}
                            />
                          )}
                        </div>

                        <div className="pnl-progress-labels">
                          <span>100% SL Loss</span>
                          <span>Entry: ${formatCryptoPrice(sig.entry)}</span>
                          <span>100% TP Success</span>
                        </div>
                      </div>

                      <div className="tracker-levels-row">
                        <div className="tracker-lvl-item">
                          <div className="t-lbl">ENTRY</div>
                          <div className="t-val">${formatCryptoPrice(sig.entry)}</div>
                        </div>
                        <div className="tracker-lvl-item">
                          <div className="t-lbl">{sig.resolved || t2Hit || slHit ? 'EXIT / LIVE' : 'LIVE'}</div>
                          <div className="t-val green">${formatCryptoPrice(sig.closedPrice || livePrice)}</div>
                        </div>
                        <div className="tracker-lvl-item">
                          <div className="t-lbl">STOP LOSS</div>
                          <div className="t-val red">${formatCryptoPrice(sig.stopLoss)}</div>
                        </div>
                        <div className="tracker-lvl-item">
                          <div className="t-lbl">TAKE PROFIT</div>
                          <div className="t-val green">${formatCryptoPrice(sig.takeProfit)}</div>
                        </div>
                      </div>

                      {(() => {
                        const sEntry = Number(sig.entry) || 1;
                        const sT1Gain = Math.abs(((Number(sig.tp1) - sEntry) / sEntry) * 100).toFixed(2);
                        const sT2Gain = Math.abs(((Number(sig.tp2) - sEntry) / sEntry) * 100).toFixed(2);
                        const sT3Gain = Math.abs(((Number(sig.tp3) - sEntry) / sEntry) * 100).toFixed(2);

                        return (
                          <div className="tracker-targets-grid">
                            <div
                              className="tracker-target-box"
                              style={{
                                borderColor: t1Hit ? '#00e676' : 'rgba(255,255,255,0.08)',
                                background: t1Hit ? 'rgba(0,230,118,0.12)' : undefined
                              }}
                            >
                              <div className="tracker-target-title">{t1Hit ? '✅ ' : ''}T1 (+{sT1Gain}%)</div>
                              <div className="tracker-target-price green">${formatCryptoPrice(sig.tp1)}</div>
                              <span className={`tracker-target-tag ${t1Hit ? 'green' : ''}`}>
                                {t1Hit ? '✓ T1 HIT' : 'PENDING'}
                              </span>
                            </div>
                            <div
                              className="tracker-target-box"
                              style={{
                                borderColor: t2Hit ? '#00d2ff' : 'rgba(255,255,255,0.08)',
                                background: t2Hit ? 'rgba(0,210,255,0.12)' : undefined
                              }}
                            >
                              <div className="tracker-target-title">{t2Hit ? '✅ ' : ''}T2 (+{sT2Gain}%)</div>
                              <div className="tracker-target-price cyan">${formatCryptoPrice(sig.tp2)}</div>
                              <span className={`tracker-target-tag ${t2Hit ? 'cyan' : ''}`}>
                                {t2Hit ? '✓ T2 HIT' : 'PENDING'}
                              </span>
                            </div>
                            <div
                              className="tracker-target-box"
                              style={{
                                borderColor: t3Hit ? '#ffcc00' : 'rgba(255,255,255,0.08)',
                                background: t3Hit ? 'rgba(255,204,0,0.12)' : undefined
                              }}
                            >
                              <div className="tracker-target-title">{t3Hit ? '✅ ' : ''}T3 (+{sT3Gain}%)</div>
                              <div className="tracker-target-price yellow">${formatCryptoPrice(sig.tp3)}</div>
                              <span className={`tracker-target-tag ${t3Hit ? 'yellow' : ''}`}>
                                {t3Hit ? '✓ T3 HIT' : 'PENDING'}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: LIGHTWEIGHT CHART (FAPI TRACKER) & TRADINGVIEW     */}
        {/* ========================================================= */}
        {activeTab === 'chart' && (
          <div className="tab-pane active">
            <div className="material-card">
              <div className="chart-header-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="chart-price-large">${formatCryptoPrice(marketPrices[selectedCoin] || allCoins.find(c => c.symbol === selectedCoin)?.basePrice || 84500)}</span>
                  <span className={`chart-change-badge ${(marketChanges[selectedCoin] || 0) >= 0 ? 'up' : 'down'}`}>
                    {(marketChanges[selectedCoin] || 0) >= 0 ? '+' : ''}{(marketChanges[selectedCoin] || 0).toFixed(2)}%
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => openAlertModalForCoin(selectedCoin)}
                    style={{ fontSize: '0.75rem', padding: '5px 10px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Bell size={13} />
                    <span>Set {selectedCoin.replace('USDT', '')} Alert</span>
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="timeframe-pill-group">
                    <button
                      className={`tf-btn ${chartEngine === 'LIGHTWEIGHT' ? 'active' : ''}`}
                      onClick={() => setChartEngine('LIGHTWEIGHT')}
                      title="Binance FAPI Lightweight Chart with Live TP/SL Lines"
                    >
                      ⚡ FAPI Tracker Chart
                    </button>
                    <button
                      className={`tf-btn ${chartEngine === 'TRADINGVIEW' ? 'active' : ''}`}
                      onClick={() => setChartEngine('TRADINGVIEW')}
                      title="TradingView Pro Chart"
                    >
                      📊 TradingView
                    </button>
                  </div>

                  <div className="timeframe-pill-group">
                    {['15m', '1h', '4h', '1d'].map(tf => (
                      <button
                        key={tf}
                        className={`tf-btn ${selectedTimeframe === tf ? 'active' : ''}`}
                        onClick={() => setSelectedTimeframe(tf)}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {chartEngine === 'LIGHTWEIGHT' ? (
                <div style={{ position: 'relative' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>🟢 Live Binance FAPI (`fapi.binance.com`) Candlesticks + Auto TP/SL Outcome Tracker</span>
                    <span>{selectedCoin} • {selectedTimeframe}</span>
                  </div>
                  {isChartLoading && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '28px',
                        left: 0,
                        right: 0,
                        height: '420px',
                        background: 'rgba(14, 19, 32, 0.78)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                        borderRadius: '8px',
                        color: 'var(--accent-cyan)',
                        fontSize: '0.85rem',
                        fontWeight: 600
                      }}
                    >
                      Loading {selectedCoin} ({selectedTimeframe}) Live Candlesticks...
                    </div>
                  )}
                  <div
                    ref={lwChartContainerRef}
                    style={{ width: '100%', height: '420px', borderRadius: '8px', overflow: 'hidden', background: '#0e1320' }}
                  />
                </div>
              ) : (
                <div style={{ width: '100%', height: '420px', borderRadius: '8px', overflow: 'hidden', background: '#0e1320' }}>
                  <iframe
                    key={`tv-${selectedCoin}-${selectedTimeframe}`}
                    title="TradingView Chart"
                    src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=BINANCE:${selectedCoin}&interval=${selectedTimeframe === '15m' ? '15' : selectedTimeframe === '1h' ? '60' : selectedTimeframe === '4h' ? '240' : 'D'}&hidesidetoolbar=1&symboledit=1&saveimage=0&toolbarbg=f1f3f6&studies=[]&theme=dark&style=1&timezone=Asia%2FKarachi&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&locale=en`}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              )}
            </div>

            <div className="material-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
                <div>
                  <h2 className="card-title" style={{ marginBottom: '2px' }}>
                    💵 Supported Binance Pairs ({allCoins.length} Pairs)
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0 }}>
                    35+ pairs + automatic newly launched Binance USDT pair discovery. Tap the bell icon on any pair to set a price alert.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => syncNewlyLaunchedPairs(false)}
                    disabled={isSyncingNewPairs}
                    style={{ fontSize: '0.76rem', padding: '6px 10px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Sparkles size={13} className={isSyncingNewPairs ? 'animate-spin' : ''} />
                    <span>{isSyncingNewPairs ? 'Scanning Binance...' : 'Sync New Pairs'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => openAlertModalForCoin(selectedCoin)}
                    style={{ fontSize: '0.76rem', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Bell size={13} />
                    <span>Alerts ({priceAlerts.filter(a => !a.triggered).length})</span>
                  </button>
                </div>
              </div>

              <div style={{ position: 'relative', marginBottom: '12px' }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  className="form-input"
                  value={pairSearchQuery}
                  onChange={e => setPairSearchQuery(e.target.value)}
                  placeholder="Search pair (e.g. BTC, ARB, WIF, JUP, NEW...)"
                  style={{ paddingLeft: '36px', fontSize: '0.85rem' }}
                />
              </div>

              <div className="market-list-grid">
                {allCoins
                  .filter(c => {
                    const q = pairSearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    if (q === 'new') return Boolean(c.isNewLaunch);
                    return c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                  })
                  .map(c => {
                    const p = marketPrices[c.symbol] || c.basePrice;
                    const chg = marketChanges[c.symbol] || 0;
                    const activeForCoin = priceAlerts.filter(a => a.symbol === c.symbol && !a.triggered).length;
                    return (
                      <div
                        key={c.symbol}
                        className="market-coin-card"
                        onClick={() => {
                          setSelectedCoin(c.symbol);
                          showToast(`${c.symbol} select ho gaya.`, 'info');
                        }}
                      >
                        <div className="market-coin-info">
                          <div className="m-name" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span>{c.symbol}</span>
                            {c.isNewLaunch && (
                              <span
                                style={{
                                  background: 'rgba(0, 230, 118, 0.16)',
                                  color: '#00e676',
                                  border: '1px solid rgba(0, 230, 118, 0.4)',
                                  fontSize: '0.62rem',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '4px'
                                }}
                              >
                                NEW
                              </span>
                            )}
                            {activeForCoin > 0 && (
                              <span
                                style={{
                                  background: 'rgba(0, 210, 255, 0.15)',
                                  color: '#00e5ff',
                                  fontSize: '0.62rem',
                                  fontWeight: 800,
                                  padding: '1px 5px',
                                  borderRadius: '4px'
                                }}
                              >
                                🔔 {activeForCoin}
                              </span>
                            )}
                          </div>
                          <div className="m-pair">{c.name}</div>
                        </div>
                        <div className="market-coin-stats" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div className="m-price">${formatCryptoPrice(p)}</div>
                            <div style={{ fontSize: '0.75rem', color: chg >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700 }}>
                              {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              openAlertModalForCoin(c.symbol);
                            }}
                            title={`Set Price Alert for ${c.symbol}`}
                            style={{
                              background: activeForCoin > 0 ? 'rgba(0, 210, 255, 0.18)' : 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.12)',
                              borderRadius: '8px',
                              padding: '6px',
                              color: activeForCoin > 0 ? '#00e5ff' : '#94a3b8',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Bell size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: USER ACCOUNT, VIP QUOTA & SETTINGS                */}
        {/* ========================================================= */}
        {activeTab === 'account' && (
          <div className="tab-pane active">
            <div className="material-card">
              <div className="account-profile-header">
                <div className="account-user-info">
                  <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'linear-gradient(135deg, #00d2ff, #0066ff)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.4rem', boxShadow: '0 4px 15px rgba(0, 210, 255, 0.4)', flexShrink: 0 }}>
                    {(user?.username || 'G').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="account-badge-wrap">
                      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>{user?.username.toUpperCase() || 'GUEST'}</span>
                      <span className={`badge-plan ${(user?.plan || 'FREE').toLowerCase()}`}>{user?.plan || 'FREE'}</span>
                      {user && user.isSheetVerified && (
                        <span className="sheet-verified-badge">
                          <CheckCircle2 size={11} /> Sheet Verified
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Device Lock: <strong style={{ color: 'var(--accent-cyan)' }}>{localStorage.getItem(KEYS.DEVICE_ID) || 'DEV-ACTIVE'}</strong>
                    </div>
                  </div>
                </div>

                <div className="account-actions-wrap">
                  {user ? (
                    <>
                      <button
                        className="btn-secondary"
                        onClick={handleManualSheetSync}
                        disabled={isSheetSyncing}
                        style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                        title="Sync latest quota and plan from Google Sheet"
                      >
                        <RefreshCw size={12} className={isSheetSyncing ? 'animate-spin' : ''} style={{ marginRight: '4px' }} />
                        {isSheetSyncing ? 'Syncing...' : 'Sync Sheet'}
                      </button>
                      <button className="btn-secondary" onClick={handleLogout} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                        Logout
                      </button>
                    </>
                  ) : (
                    <button className="btn-primary" onClick={() => setLoginModalOpen(true)} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                      Login / Register
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Google Sheet Live Quota Box */}
            <div className="material-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 className="card-title" style={{ marginBottom: '2px' }}>
                    <Database size={16} color="#00e5ff" style={{ display: 'inline', marginRight: '6px' }} />
                    Daily AI Signal Quota (Google Sheet Live)
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Quota Google Sheet ke Quota tab se directly verify hota hai.</p>
                </div>
                <button
                  className="btn-primary"
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  onClick={() => setPremiumModalOpen(true)}
                >
                  <Star size={14} style={{ marginRight: '4px' }} />
                  Upgrade Plan
                </button>
              </div>

              <div className="account-quota-grid">
                <div className="account-quota-col">
                  <div className="account-quota-label">Today's Remaining</div>
                  <div className="account-quota-value green">
                    {user?.dailyQuotaLeft.toFixed(2)}
                  </div>
                </div>
                <div className="account-quota-divider" />
                <div className="account-quota-col">
                  <div className="account-quota-label">Daily Base Quota</div>
                  <div className="account-quota-value">
                    {user?.planBaseQuota || 1}
                  </div>
                </div>
                <div className="account-quota-divider" />
                <div className="account-quota-col">
                  <div className="account-quota-label">Google Sheet Status</div>
                  <div className="account-quota-value sheet-status" style={{ color: user?.isSheetVerified ? '#00e676' : '#ffb300' }}>
                    {user?.isSheetVerified ? '✔ Connected' : 'Guest Mode'}
                  </div>
                </div>
              </div>
            </div>

            <div className="material-card">
              <h3 className="card-title">🎁 Share & Earn Bonus Signals (+0.5 Each)</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
                CryptoWorld ko doston ke sath share karein aur foran bonus signals hasil karein:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                <button className="btn-secondary" onClick={() => handleShareBonus('whatsapp')} style={{ borderColor: '#25D366', color: '#25D366' }}>
                  WhatsApp (+0.5)
                </button>
                <button className="btn-secondary" onClick={() => handleShareBonus('telegram')} style={{ borderColor: '#0088cc', color: '#0088cc' }}>
                  Telegram (+0.5)
                </button>
                <button className="btn-secondary" onClick={() => handleShareBonus('twitter')} style={{ borderColor: '#1DA1F2', color: '#1DA1F2' }}>
                  Twitter / X (+0.5)
                </button>
                <button className="btn-secondary" onClick={() => handleShareBonus('facebook')} style={{ borderColor: '#1877F2', color: '#1877F2' }}>
                  Facebook (+0.5)
                </button>
              </div>
            </div>

            <div className="material-card">
              <h3 className="card-title">👥 Your Referral Code</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
                Har dost ke signup par aapko permanent bonus signals milenge:
              </p>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={user?.referralCode || 'GUEST2026'}
                  className="form-input"
                  style={{ flex: 1, fontWeight: 700, letterSpacing: '1px', textAlign: 'center', color: 'var(--accent-cyan)' }}
                />
                <button
                  className="btn-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(user?.referralCode || '');
                    showToast('Referral code copy ho gaya!', 'success');
                  }}
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>

            <div className="material-card">
              <h3 className="card-title">💬 Feedback & Suggestions</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '12px' }}>
                CryptoWorld ko behtar banane ke liye apni raye Google Sheet tak pohanchayein:
              </p>

              <form onSubmit={handleFeedbackSubmit}>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select
                    className="app-select"
                    value={feedbackCategory}
                    onChange={e => setFeedbackCategory(e.target.value)}
                  >
                    <option value="FEATURE">New Feature Request</option>
                    <option value="ACCURACY">Signal Accuracy Feedback</option>
                    <option value="BUG">Bug / Technical Issue</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Aapki Raye / Message</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    placeholder="Yahan apni raye likhein..."
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                  />
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={isSubmittingFeedback}>
                  <Send size={14} style={{ marginRight: '6px' }} />
                  {isSubmittingFeedback ? 'Submitting to Google Sheet...' : 'Submit Feedback to Google Sheet'}
                </button>
              </form>

              {userSuggestions && userSuggestions.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '8px' }}>
                    📋 Aapki Guzishta Suggestions (Google Sheet):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {userSuggestions.map((sug: any, idx: number) => (
                      <div key={idx} style={{ background: '#0e1320', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                          <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>{sug.category || 'FEATURE'}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{sug.date || 'Sheet Record'}</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#fff' }}>{sug.text || sug.suggestion}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: SUPER ADMIN CONTROL CENTER (IN-APP FEATURE 2)     */}
        {/* ========================================================= */}
        {activeTab === 'admin' && (
          <div className="tab-pane active admin-tab-pane">
            {!isAdmin ? (
              <div className="material-card" style={{ maxWidth: '460px', margin: '40px auto', textAlign: 'center', border: '1px solid #ff6b8b', padding: '30px 22px', borderRadius: '16px' }}>
                <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(255, 107, 139, 0.15)', color: '#ff6b8b', marginBottom: '16px' }}>
                  <Lock size={36} />
                </div>
                <h2 style={{ color: '#fff', fontSize: '1.35rem', fontWeight: 800, margin: '0 0 8px' }}>
                  Super Admin Terminal
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: 1.5 }}>
                  VIP Licenses generator, Users List aur Ad Network monetization controls tak rasayi ke liye apna Master Passphrase enter karein.
                </p>
                <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Master Security Passphrase</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Master Passphrase enter karein"
                      value={adminInputKey}
                      onChange={e => setAdminInputKey(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {adminAuthError && (
                    <div style={{ color: '#ff4d4d', fontSize: '0.82rem', background: 'rgba(255, 77, 77, 0.12)', padding: '8px 12px', borderRadius: '6px' }}>
                      {adminAuthError}
                    </div>
                  )}
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={adminAuthLoading}
                    style={{ background: 'linear-gradient(135deg, #ff6b8b 0%, #d81b60 100%)', border: 'none', padding: '12px', fontWeight: 800, fontSize: '0.92rem' }}
                  >
                    {adminAuthLoading ? 'Verifying with Backend...' : '🔓 Unlock Admin Console'}
                  </button>
                </form>
              </div>
            ) : (
              <div>
                {/* Admin Header Bar */}
                <div className="material-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', padding: '16px 20px', marginBottom: '20px', borderLeft: '4px solid #ff6b8b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(255, 107, 139, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6b8b' }}>
                      <ShieldCheck size={24} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', fontWeight: 800 }}>Super Admin Control Center</h2>
                        <span style={{ fontSize: '0.65rem', background: 'rgba(0, 230, 118, 0.15)', color: '#00e676', border: '1px solid rgba(0,230,118,0.3)', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                          SESSION ACTIVE
                        </span>
                      </div>
                      <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Manage VIP licenses, Google Sheet registered users, and Rewarded Ads.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        fetchAdminCodes();
                        fetchAdminUsers();
                      }}
                      style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <RefreshCw size={13} className={(adminUsersLoading || adminCodesLoading) ? 'spin' : ''} />
                      <span>Sync Sheet</span>
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={handleAdminLogout}
                      style={{ fontSize: '0.78rem', padding: '6px 12px', color: '#ff6b8b', borderColor: 'rgba(255,107,139,0.4)', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <LogOut size={13} />
                      <span>Logout Admin</span>
                    </button>
                  </div>
                </div>

                {/* Sub Tab Navigation */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
                  <button
                    className={`material-chip ${adminSubTab === 'licenses' ? 'active' : ''}`}
                    onClick={() => setAdminSubTab('licenses')}
                    style={{ fontSize: '0.85rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Ticket size={15} />
                    <span>VIP Licenses ({adminCodes.filter(c => !c.used).length} Unused)</span>
                  </button>
                  <button
                    className={`material-chip ${adminSubTab === 'users' ? 'active' : ''}`}
                    onClick={() => setAdminSubTab('users')}
                    style={{ fontSize: '0.85rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Users size={15} />
                    <span>Registered Users ({adminUsers.length})</span>
                  </button>
                  <button
                    className={`material-chip ${adminSubTab === 'ads' ? 'active' : ''}`}
                    onClick={() => setAdminSubTab('ads')}
                    style={{ fontSize: '0.85rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Sliders size={15} />
                    <span>AdMob Settings ({adminAdSettings.network.toUpperCase()})</span>
                  </button>
                </div>

                {/* Sub Tab 1: VIP Licenses */}
                {adminSubTab === 'licenses' && (
                  <div>
                    {/* Stat Badges */}
                    <div className="plans-grid" style={{ marginBottom: '16px' }}>
                      <div className="material-card" style={{ padding: '16px', textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Total Generated (Sheet)</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>{adminCodes.length}</div>
                      </div>
                      <div className="material-card" style={{ padding: '16px', textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Active / Unused</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-green)', marginTop: '4px' }}>
                          {adminCodes.filter(c => !c.used).length}
                        </div>
                      </div>
                      <div className="material-card" style={{ padding: '16px', textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Redeemed / Used</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ff6b8b', marginTop: '4px' }}>
                          {adminCodes.filter(c => c.used).length}
                        </div>
                      </div>
                    </div>

                    {/* Generators Panel */}
                    <div className="material-card" style={{ marginBottom: '20px', padding: '20px' }}>
                      <h3 style={{ margin: '0 0 14px', fontSize: '1.05rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Ticket size={18} />
                        <span>VIP License Key Generator (Direct Google Sheet Sync)</span>
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {/* Bulk Generator */}
                        <div style={{ background: '#0e1424', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', color: '#fff' }}>⚡ 1-Click 60 Bulk Codes</h4>
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.4 }}>
                            20 Basic (5 sigs) + 20 Pro (10 sigs) + 20 Elite (20 sigs) ek click mein generate karke Google Sheet (PremiumCodes tab) mein save karein.
                          </p>
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ width: '100%', fontSize: '0.85rem', padding: '10px' }}
                            onClick={handleBulkGenerateCodes}
                            disabled={adminCodeGenerating}
                          >
                            {adminCodeGenerating ? 'Saving to Google Sheet...' : 'Generate 60 Bulk Codes'}
                          </button>
                        </div>

                        {/* Single Generator */}
                        <div style={{ background: '#0e1424', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                          <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem', color: '#fff' }}>🎯 Custom Single License</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.72rem' }}>Plan Tier</label>
                              <select
                                className="app-select"
                                style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem' }}
                                value={adminSinglePlan}
                                onChange={(e: any) => setAdminSinglePlan(e.target.value)}
                              >
                                <option value="BASIC">BASIC (5 sigs/day)</option>
                                <option value="PRO">PRO (10 sigs/day)</option>
                                <option value="ELITE">ELITE (20 sigs/day)</option>
                              </select>
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.72rem' }}>Duration</label>
                              <select
                                className="app-select"
                                style={{ width: '100%', padding: '6px 8px', fontSize: '0.8rem' }}
                                value={adminSingleDuration}
                                onChange={e => setAdminSingleDuration(Number(e.target.value))}
                              >
                                <option value={30}>30 Days (1 Month)</option>
                                <option value={60}>60 Days (2 Months)</option>
                                <option value={90}>90 Days (Quarter)</option>
                                <option value={365}>365 Days (1 Year)</option>
                              </select>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ width: '100%', fontSize: '0.85rem', padding: '8px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
                            onClick={handleSingleGenerateCode}
                            disabled={adminCodeGenerating}
                          >
                            {adminCodeGenerating ? 'Saving to Google Sheet...' : '+ Generate Single Key'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Filter and Table */}
                    <div className="material-card" style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {(['ALL', 'UNUSED', 'USED', 'BASIC', 'PRO', 'ELITE'] as const).map(f => (
                            <button
                              key={f}
                              className={`btn-secondary ${adminCodeFilter === f ? 'active' : ''}`}
                              style={{
                                fontSize: '0.75rem',
                                padding: '4px 10px',
                                background: adminCodeFilter === f ? 'var(--accent-cyan)' : undefined,
                                color: adminCodeFilter === f ? '#000' : undefined
                              }}
                              onClick={() => setAdminCodeFilter(f)}
                            >
                              {f}
                            </button>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={fetchAdminCodes} disabled={adminCodesLoading}>
                            <RefreshCw size={12} className={adminCodesLoading ? 'spin' : ''} style={{ marginRight: '4px' }} />
                            {adminCodesLoading ? 'Loading Sheet...' : 'Reload Sheet Codes'}
                          </button>
                          <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={handleCopyUnusedCodes}>
                            <Copy size={12} style={{ marginRight: '4px' }} />
                            Copy Unused
                          </button>
                          <button className="btn-secondary" style={{ fontSize: '0.75rem', padding: '4px 8px', color: '#ff6b8b', borderColor: 'rgba(255,107,139,0.3)' }} onClick={handlePurgeUsedCodes}>
                            <Trash2 size={12} style={{ marginRight: '4px' }} />
                            Purge Used
                          </button>
                        </div>
                      </div>

                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '8px 10px' }}>Code</th>
                              <th style={{ padding: '8px 10px' }}>Plan</th>
                              <th style={{ padding: '8px 10px' }}>Signals</th>
                              <th style={{ padding: '8px 10px' }}>Duration</th>
                              <th style={{ padding: '8px 10px' }}>Status</th>
                              <th style={{ padding: '8px 10px' }}>Claimed By</th>
                              <th style={{ padding: '8px 10px' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAdminCodes.length === 0 ? (
                              <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                                  Koi license key nahi mili.
                                </td>
                              </tr>
                            ) : (
                              filteredAdminCodes.map((c, idx) => (
                                <tr key={c.code || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                                    {c.code}
                                  </td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <span className={`badge-plan ${(c.plan || 'free').toLowerCase()}`}>{c.plan}</span>
                                  </td>
                                  <td style={{ padding: '8px 10px' }}>{c.signalsPerDay}/day</td>
                                  <td style={{ padding: '8px 10px' }}>{c.durationDays}d</td>
                                  <td style={{ padding: '8px 10px' }}>
                                    {c.used ? (
                                      <span style={{ color: '#ff6b8b', fontWeight: 700, fontSize: '0.72rem' }}>CLAIMED</span>
                                    ) : (
                                      <span style={{ color: '#00e676', fontWeight: 700, fontSize: '0.72rem' }}>ACTIVE</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{c.usedBy || '—'}</td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <button
                                      className="btn-secondary"
                                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                      onClick={() => {
                                        navigator.clipboard.writeText(c.code);
                                        showToast(`Copied: ${c.code}`, 'info');
                                      }}
                                    >
                                      Copy
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub Tab 2: Users Management */}
                {adminSubTab === 'users' && (
                  <div className="material-card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '340px' }}>
                        <Search size={16} color="var(--text-secondary)" />
                        <input
                          type="text"
                          className="form-input"
                          style={{ padding: '6px 12px', fontSize: '0.82rem', width: '100%' }}
                          placeholder="Search username / referral / plan..."
                          value={adminUserSearch}
                          onChange={e => setAdminUserSearch(e.target.value)}
                        />
                      </div>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                        onClick={fetchAdminUsers}
                      >
                        <RefreshCw size={12} style={{ marginRight: '6px' }} className={adminUsersLoading ? 'spin' : ''} />
                        Reload Users
                      </button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '8px 10px' }}>Username</th>
                            <th style={{ padding: '8px 10px' }}>Plan</th>
                            <th style={{ padding: '8px 10px' }}>Daily Quota</th>
                            <th style={{ padding: '8px 10px' }}>Referral Code</th>
                            <th style={{ padding: '8px 10px' }}>Referrals</th>
                            <th style={{ padding: '8px 10px' }}>Password</th>
                            <th style={{ padding: '8px 10px' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAdminUsers.length === 0 ? (
                            <tr>
                              <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                                Koi user record nahi mila.
                              </td>
                            </tr>
                          ) : (
                            filteredAdminUsers.map((u, idx) => (
                              <tr key={u.username || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '8px 10px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <strong style={{ color: '#fff' }}>{u.username}</strong>
                                    {u.cloudSynced && (
                                      <span style={{ fontSize: '0.62rem', background: 'rgba(0,230,118,0.12)', color: '#00e676', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                        Sheet
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <span className={`badge-plan ${(u.plan || 'free').toLowerCase()}`}>{u.plan || 'FREE'}</span>
                                </td>
                                <td style={{ padding: '8px 10px', color: 'var(--accent-green)', fontWeight: 700 }}>
                                  {u.dailyQuotaLeft !== undefined ? u.dailyQuotaLeft : 1} sigs
                                </td>
                                <td style={{ padding: '8px 10px', color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>
                                  {u.referralCode || '—'}
                                </td>
                                <td style={{ padding: '8px 10px' }}>{u.referralsCount || 0}</td>
                                <td style={{ padding: '8px 10px' }}>
                                  {u.password ? (
                                    <span style={{ color: '#00e676', fontSize: '0.72rem', fontWeight: 700 }}>ACTIVE</span>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Standard</span>
                                  )}
                                </td>
                                <td style={{ padding: '8px 10px' }}>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      className="btn-primary"
                                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                      onClick={() => {
                                        setAdminResetTargetUser(u.username);
                                        setAdminNewUserPassword('Crypto' + Math.floor(1000 + Math.random() * 9000));
                                        setAdminResetModalMsg('');
                                        setAdminResetModalOpen(true);
                                      }}
                                    >
                                      🔑 Reset Pass
                                    </button>
                                    <button
                                      className="btn-secondary"
                                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                      onClick={() => {
                                        const text = `CryptoWorld Account Recovery:\nUsername: ${u.username}\nReferral Code: ${u.referralCode || 'N/A'}\nStatus: Verified`;
                                        navigator.clipboard.writeText(text);
                                        showToast(`User ${u.username} recovery info copied!`, 'info');
                                      }}
                                    >
                                      Recovery
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Sub Tab 3: AdMob Settings & Ad Network Configuration */}
                {adminSubTab === 'ads' && (
                  <div className="material-card" style={{ padding: '20px' }}>
                    <div style={{ marginBottom: '18px' }}>
                      <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sliders size={20} color="var(--accent-cyan)" />
                        <span>AdMob Settings & Dynamic Ad Unit Configuration</span>
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        Yahan se official Google AdMob App ID, Rewarded Ad Unit ID, aur Interstitial Ad Unit ID dynamically update aur save karein. Yeh IDs bina code change kiye poori app aur Google Sheet mein sync hoti hain.
                      </p>
                    </div>

                    {/* Network Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                      {[
                        { id: 'admob', name: 'Google AdMob (Official)', desc: 'Direct native Android AdMob Rewarded & Interstitial Ads', badge: 'Approved / Primary' },
                        { id: 'adsterra', name: 'Adsterra Direct Link', desc: 'Direct Link SmartURL for fallback monetization', badge: 'Backup' },
                        { id: 'monetag', name: 'Monetag Zone', desc: 'In-App rewarded interstitial & push zones', badge: 'Backup' },
                      ].map(net => {
                        const isSelected = adminAdSettings.network === net.id;
                        return (
                          <div
                            key={net.id}
                            onClick={() => setAdminAdSettings({ ...adminAdSettings, network: net.id as any })}
                            style={{
                              background: isSelected ? '#11192e' : '#0e1424',
                              border: isSelected ? '2px solid var(--accent-cyan)' : '1px solid var(--border-color)',
                              padding: '14px',
                              borderRadius: '10px',
                              cursor: 'pointer',
                              position: 'relative'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <strong style={{ color: isSelected ? 'var(--accent-cyan)' : '#fff', fontSize: '0.9rem' }}>{net.name}</strong>
                              <span style={{ fontSize: '0.62rem', background: 'rgba(0, 229, 255, 0.1)', color: 'var(--accent-cyan)', padding: '2px 6px', borderRadius: '4px' }}>
                                {net.badge}
                              </span>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                              {net.desc}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Input configuration for selected network */}
                    <div style={{ background: '#090d16', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '18px' }}>
                      {adminAdSettings.network === 'admob' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ background: 'rgba(0, 230, 118, 0.08)', border: '1px solid rgba(0, 230, 118, 0.25)', padding: '12px 14px', borderRadius: '8px', fontSize: '0.82rem', color: '#00e676' }}>
                            <strong>✅ Official Approved Google AdMob Active:</strong> Dynamic IDs niche se manage karein.
                            <div style={{ marginTop: '6px', fontSize: '0.74rem', color: '#94a3b8', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                              <span>Active App ID: <code>{adConfig.appId || ADMOB_CONFIG.appId}</code></span>
                              <span>Rewarded ID: <code>{adConfig.rewardedAdUnitId || ADMOB_CONFIG.rewardedAdUnitId}</code></span>
                              <span>Interstitial ID: <code>{adConfig.interstitialAdUnitId || ADMOB_CONFIG.interstitialAdUnitId}</code></span>
                            </div>
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">AdMob App ID</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="ca-app-pub-8825065858193656~2430855580"
                              value={adminAdSettings.appId || ''}
                              onChange={e => setAdminAdSettings({ ...adminAdSettings, appId: e.target.value })}
                            />
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Rewarded Ad Unit ID (Quota Unlock +1 Signal)</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="ca-app-pub-8825065858193656~2572882851"
                              value={adminAdSettings.rewardedAdUnitId || ''}
                              onChange={e => setAdminAdSettings({ ...adminAdSettings, rewardedAdUnitId: e.target.value })}
                            />
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Interstitial Ad Unit ID (Full-Screen Interstitial)</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="ca-app-pub-8825065858193656~2381311165"
                              value={adminAdSettings.interstitialAdUnitId || adminAdSettings.appOpenAdUnitId || ''}
                              onChange={e =>
                                setAdminAdSettings({
                                  ...adminAdSettings,
                                  interstitialAdUnitId: e.target.value,
                                  appOpenAdUnitId: e.target.value
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                      {adminAdSettings.network === 'adsterra' && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Adsterra Direct Link URL</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="https://www.highcpmgate.com/..."
                            value={adminAdSettings.adsterraDirectLink}
                            onChange={e => setAdminAdSettings({ ...adminAdSettings, adsterraDirectLink: e.target.value })}
                          />
                        </div>
                      )}
                      {adminAdSettings.network === 'monetag' && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Monetag Zone ID / Tag Script URL</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. 7849102"
                            value={adminAdSettings.monetagZoneId}
                            onChange={e => setAdminAdSettings({ ...adminAdSettings, monetagZoneId: e.target.value })}
                          />
                        </div>
                      )}
                    </div>

                    {/* Save, Reset, Test Buttons */}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleSaveAdConfig}
                        style={{ padding: '10px 18px', fontSize: '0.85rem' }}
                      >
                        💾 Save AdMob Settings
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleWatchRewardedAd}
                        disabled={isAdLoading}
                        style={{ padding: '10px 18px', fontSize: '0.85rem' }}
                      >
                        <Play size={14} style={{ marginRight: '6px' }} />
                        {isAdLoading ? 'Loading Rewarded...' : 'Test Rewarded Ad'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleShowInterstitialAd}
                        disabled={isInterstitialLoading}
                        style={{ padding: '10px 18px', fontSize: '0.85rem' }}
                      >
                        <Film size={14} style={{ marginRight: '6px' }} />
                        {isInterstitialLoading ? 'Loading Interstitial...' : 'Test Interstitial Ad'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleResetAdConfig}
                        style={{ padding: '10px 18px', fontSize: '0.85rem', color: '#ff6b8b', borderColor: 'rgba(255,107,139,0.3)' }}
                      >
                        Reset Defaults
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* AUTHENTIC BOTTOM NAVIGATION BAR                           */}
      {/* ========================================================= */}
      <nav className="bottom-nav-bar">
        <button
          className={`bottom-nav-item ${activeTab === 'signals' ? 'active' : ''}`}
          onClick={() => setActiveTab('signals')}
        >
          <span className="bottom-nav-icon"><Zap size={20} /></span>
          <span>Signals</span>
        </button>

        <button
          className={`bottom-nav-item ${activeTab === 'progress' ? 'active' : ''}`}
          onClick={() => setActiveTab('progress')}
        >
          <span className="bottom-nav-icon">
            <TrendingUp size={20} />
            <span className="bottom-nav-badge">{stats.activeCount}</span>
          </span>
          <span>Progress</span>
        </button>

        <button
          className={`bottom-nav-item ${activeTab === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          <span className="bottom-nav-icon"><BarChart2 size={20} /></span>
          <span>Chart & Pairs</span>
        </button>

        <button
          className={`bottom-nav-item ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
        >
          <span className="bottom-nav-icon"><User size={20} /></span>
          <span>Account</span>
        </button>

        {isAdmin && (
          <button
            className={`bottom-nav-item ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            <span className="bottom-nav-icon"><ShieldCheck size={20} color={activeTab === 'admin' ? '#ff6b8b' : undefined} /></span>
            <span style={{ color: activeTab === 'admin' ? '#ff6b8b' : undefined }}>Admin</span>
          </button>
        )}
      </nav>

      {/* Floating WhatsApp Action Button */}
      <a
        href="https://wa.me/?text=Assalam-o-Alaikum%20CryptoWorld%20Support,%20mujhe%20crypto%20signals%20ke%20bare%20mein%20maloomat%20chahiye"
        target="_blank"
        rel="noopener noreferrer"
        className="floating-whatsapp"
        title="Chat on WhatsApp"
      >
        <svg viewBox="0 0 24 24">
          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm5.78 14.07c-.24.68-1.4 1.26-1.92 1.34-.52.08-1.18.11-3.41-.75-2.22-.85-3.64-3.11-3.75-3.26-.11-.15-.89-1.18-.89-2.25 0-1.07.56-1.6 76-1.82.2-.22.44-.28.59-.28.15 0 .3 0 .42.01.13.01.32-.05.5.38.19.45.65 1.58.71 1.7.06.12.1.26.02.42-.08.16-.12.26-.24.4-.12.14-.25.31-.36.42-.12.12-.25.25-.11.49.14.24.62 1.02 1.33 1.65.91.81 1.68 1.06 1.92 1.18.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.39.66 1.63.78.24.12.4.18.46.28.06.1.06.58-.18 1.26z" />
        </svg>
      </a>

      {/* Login & Register Modal (Direct Google Sheet Verification) */}
      {loginModalOpen && (
        <div className="modal-overlay active">
          <div className="modal-card material-card">
            <button className="modal-close-btn" onClick={() => setLoginModalOpen(false)}>×</button>
            <h2 className="card-title">🔑 {authMode === 'login' ? 'Google Sheet Login' : 'Google Sheet Registration'}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Data direct aapki Google Sheets Quota & Users tab se verify hota hai. Free quota: 1 signal/day.
            </p>

            {/* Mode Switcher Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#090d16', padding: '4px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
              <button
                type="button"
                className={authMode === 'login' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '8px', fontSize: '0.85rem', fontWeight: 700, borderRadius: '6px', border: authMode === 'login' ? 'none' : 'transparent' }}
                onClick={() => { setAuthMode('login'); setAuthError(''); }}
              >
                🔑 Login
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '8px', fontSize: '0.85rem', fontWeight: 700, borderRadius: '6px', border: authMode === 'register' ? 'none' : 'transparent' }}
                onClick={() => { setAuthMode('register'); setAuthError(''); }}
              >
                📝 Register
              </button>
            </div>

            <form onSubmit={handleAuth}>
              <div className="form-group">
                <label className="form-label">Username (Min 3 characters)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Apna username enter karein"
                  value={authUsername}
                  onChange={e => setAuthUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password (Min 6 characters)</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                />
              </div>

              {authMode === 'register' && (
                <div className="form-group">
                  <label className="form-label">Referral Code (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. ZULQ2026"
                    value={authRefCode}
                    onChange={e => setAuthRefCode(e.target.value)}
                  />
                </div>
              )}

              {authError && (
                <div style={{ color: 'var(--accent-red)', fontSize: '0.85rem', marginBottom: '12px' }}>
                  {authError}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontWeight: 800, borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem' }}
              >
                {authMode === 'login' ? '🚀 Login to Account' : '✨ Register New Account'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Premium Plans Modal (Direct Google Sheet Sync & Mobile Scrollable) */}
      {premiumModalOpen && (
        <div className="modal-overlay active">
          <div
            className="modal-card material-card vip-modal-card max-h-[90vh] overflow-y-auto"
            style={{
              maxWidth: '650px',
              maxHeight: '90vh',
              overflowY: 'auto',
              overflowX: 'hidden',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            <button className="modal-close-btn" onClick={() => setPremiumModalOpen(false)}>×</button>
            <h2 className="card-title" style={{ color: 'var(--accent-cyan)', paddingRight: '28px' }}>
              ⭐ Upgrade to VIP Signals (Google Sheet Sync)
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', marginBottom: '16px' }}>
              Rozana zyada signals, zero waiting, aur direct WhatsApp VIP group signals haasil karein.
            </p>

            <div className="plans-grid vip-plans-grid">
              <div className="plan-card">
                <div className="plan-name">BASIC</div>
                <div className="plan-signals">5 Signals/Day</div>
                <div className="plan-features">
                  • 5 signals daily quota<br />
                  • All benchmark pairs<br />
                  • Risk/Reward 1:1.85<br />
                  • Standard Support
                </div>
                <a href="https://wa.me/?text=Assalam-o-Alaikum,%20mujhe%20CryptoWorld%20BASIC%20plan%20chahiye" target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ width: '100%', fontSize: '0.8rem' }}>
                  Select Basic
                </a>
              </div>

              <div className="plan-card popular">
                <div className="popular-ribbon">POPULAR</div>
                <div className="plan-name" style={{ color: 'var(--accent-cyan)' }}>PRO</div>
                <div className="plan-signals" style={{ color: 'var(--accent-green)' }}>10 Signals/Day</div>
                <div className="plan-features">
                  • 10 signals daily quota<br />
                  • Multi-timeframe priority<br />
                  • Fast AI Groq & Gemini<br />
                  • Priority WhatsApp Desk
                </div>
                <a href="https://wa.me/?text=Assalam-o-Alaikum,%20mujhe%20CryptoWorld%20PRO%20plan%20chahiye" target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ width: '100%', fontSize: '0.8rem' }}>
                  Select Pro
                </a>
              </div>

              <div className="plan-card">
                <div className="plan-name" style={{ color: 'var(--accent-yellow)' }}>ELITE</div>
                <div className="plan-signals" style={{ color: 'var(--accent-yellow)' }}>20 Signals/Day</div>
                <div className="plan-features">
                  • 20 signals daily quota<br />
                  • VIP Whale Flow alerts<br />
                  • Instant Trade Setup<br />
                  • 24/7 Dedicated Support
                </div>
                <a href="https://wa.me/?text=Assalam-o-Alaikum,%20mujhe%20CryptoWorld%20ELITE%20plan%20chahiye" target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ width: '100%', fontSize: '0.8rem', borderColor: 'var(--accent-yellow)', color: 'var(--accent-yellow)' }}>
                  Select Elite
                </a>
              </div>
            </div>

            <div className="vip-redeem-box" style={{ background: '#111624', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', marginTop: '14px', marginBottom: '4px' }}>
              <label className="form-label" style={{ marginBottom: '8px', color: '#fff', fontWeight: 700 }}>
                🎟️ Redeem Premium License Code
              </label>
              <div className="vip-redeem-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1, minWidth: '180px', textTransform: 'uppercase' }}
                  placeholder="e.g. PRO-XXXXYYYY"
                  value={redeemCode}
                  onChange={e => setRedeemCode(e.target.value)}
                />
                <button type="button" className="btn-primary" onClick={handleRedeemCode}>
                  ✔ Redeem Code
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device Lock Alert Modal (Strict 1-Account Per Device Rule) */}
      {deviceLockAlert && deviceLockAlert.open && (
        <div className="modal-overlay active">
          <div className="modal-card material-card" style={{ maxWidth: '440px', border: '1px solid #ff4d4d', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', padding: '14px', borderRadius: '50%', background: 'rgba(255, 77, 77, 0.15)', color: '#ff4d4d', marginBottom: '12px' }}>
              <ShieldAlert size={36} />
            </div>
            <h3 style={{ color: '#ff4d4d', fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px' }}>
              DEVICE RESTRICTION ACTIVE
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '16px' }}>
              {deviceLockAlert.message}
            </p>
            {deviceLockAlert.existingUser && (
              <div style={{ background: '#0e1320', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 204, 0, 0.3)', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.78rem', color: '#ffcc00' }}>Is device par pehle se registered account:</span>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff', marginTop: '3px' }}>
                  {deviceLockAlert.existingUser.toUpperCase()}
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                className="btn-secondary"
                onClick={() => setDeviceLockAlert(null)}
              >
                Close
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  if (deviceLockAlert.existingUser) {
                    setAuthUsername(deviceLockAlert.existingUser);
                  }
                  setAuthMode('login');
                  setDeviceLockAlert(null);
                  setLoginModalOpen(true);
                }}
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ========================================================= */}
      {/* FEATURE 1: IN-APP UPDATE CHECKER POPUP MODAL               */}
      {/* ========================================================= */}
      {updateModalOpen && updateData && (
        <div className="modal-overlay active" style={{ zIndex: 1000000 }}>
          <div className="modal-card material-card" style={{ maxWidth: '440px', textAlign: 'center', border: '1px solid var(--accent-cyan)' }}>
            <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(0, 229, 255, 0.15)', color: 'var(--accent-cyan)', marginBottom: '14px' }}>
              <Download size={36} />
            </div>
            <h3 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 800, margin: '0 0 6px' }}>
              🚀 Naya Version Available!
            </h3>
            <div style={{ display: 'inline-block', background: 'rgba(0, 230, 118, 0.15)', color: '#00e676', border: '1px solid rgba(0, 230, 118, 0.3)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '12px' }}>
              v{updateData.latestVersion} (Aapka Version: v{CURRENT_APP_VERSION})
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 20px', lineHeight: 1.5 }}>
              {updateData.releaseNotes}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontWeight: 800, fontSize: '0.95rem' }}
                onClick={() => {
                  if (updateData.downloadUrl) {
                    window.open(updateData.downloadUrl, '_blank');
                  }
                  setUpdateModalOpen(false);
                }}
              >
                <Download size={16} style={{ marginRight: '6px' }} />
                Download Update
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }}
                onClick={() => setUpdateModalOpen(false)}
              >
                Baad Mein
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Login Modal (Triggered via Header or Sidebar) */}
      {adminLoginModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1000000 }}>
          <div className="modal-card material-card" style={{ maxWidth: '420px', border: '1px solid #ff6b8b' }}>
            <button className="modal-close-btn" onClick={() => setAdminLoginModalOpen(false)}>×</button>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', background: 'rgba(255, 107, 139, 0.15)', color: '#ff6b8b', marginBottom: '8px' }}>
                <ShieldCheck size={32} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff', fontWeight: 800 }}>Admin Login</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Master Passphrase ke zariye Admin dashboard unlock karein.
              </p>
            </div>
            <form onSubmit={handleAdminLogin}>
              <div className="form-group">
                <label className="form-label">Master Passphrase</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Master Passphrase enter karein"
                  value={adminInputKey}
                  onChange={e => setAdminInputKey(e.target.value)}
                  autoFocus
                />
              </div>
              {adminAuthError && (
                <div style={{ color: '#ff4d4d', fontSize: '0.82rem', background: 'rgba(255, 77, 77, 0.12)', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>
                  {adminAuthError}
                </div>
              )}
              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontWeight: 800, background: 'linear-gradient(135deg, #ff6b8b 0%, #d81b60 100%)', border: 'none' }}
                disabled={adminAuthLoading}
              >
                {adminAuthLoading ? 'Verifying...' : '🔓 Unlock Admin Panel'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Admin User Password Reset Modal */}
      {adminResetModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1000000 }}>
          <div className="modal-card material-card" style={{ maxWidth: '420px', border: '1px solid var(--accent-cyan)' }}>
            <button className="modal-close-btn" onClick={() => setAdminResetModalOpen(false)}>×</button>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', color: '#fff' }}>
              🔑 Reset Password for <span style={{ color: 'var(--accent-cyan)' }}>{adminResetTargetUser}</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Naya password enter karein ya automatic random generate karein. Password Google Sheet aur local DB dono mein update hoga.
            </p>
            <form onSubmit={handleAdminResetPassword}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    value={adminNewUserPassword}
                    onChange={e => setAdminNewUserPassword(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setAdminNewUserPassword('CW' + Math.floor(100000 + Math.random() * 900000) + '!')}
                    style={{ fontSize: '0.75rem', padding: '0 10px', whiteSpace: 'nowrap' }}
                  >
                    🎲 Random
                  </button>
                </div>
              </div>
              {adminResetModalMsg && (
                <div style={{ color: '#ff4d4d', fontSize: '0.82rem', marginBottom: '12px' }}>
                  {adminResetModalMsg}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, padding: '10px' }}>
                  Save & Update Password
                </button>
                <button type="button" className="btn-secondary" onClick={() => setAdminResetModalOpen(false)} style={{ padding: '10px 14px' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Price Alerts Manager Modal */}
      {alertsModalOpen && (
        <div className="modal-overlay active" style={{ zIndex: 1000000 }}>
          <div
            className="modal-card material-card max-h-[90vh] overflow-y-auto"
            style={{ maxWidth: '540px', width: '94%', border: '1px solid var(--accent-cyan)' }}
          >
            <button className="modal-close-btn" onClick={() => setAlertsModalOpen(false)}>×</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <BellRing size={22} color="#00e5ff" />
              <h2 className="card-title" style={{ margin: 0 }}>Price Alerts & Target Notifications</h2>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Kisi bhi pair par target price set karein. Price hit hote hi aapko live notification, sound tone aur alert banner milega.
            </p>

            {/* Browser Notification Permission Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                background: '#0b0f19',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '8px 12px',
                marginBottom: '14px',
                flexWrap: 'wrap'
              }}
            >
              <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                Push Notifications:{' '}
                <strong style={{ color: notifPermission === 'granted' ? '#00e676' : '#ffb300' }}>
                  {notifPermission === 'granted'
                    ? 'Enabled'
                    : notifPermission === 'denied'
                      ? 'Blocked (In-App + Audio Active)'
                      : notifPermission === 'unsupported'
                        ? 'In-App + Audio Active'
                        : 'Not Enabled Yet'}
                </strong>
              </span>
              {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRequestNotificationPermission}
                  style={{ fontSize: '0.72rem', padding: '4px 10px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }}
                >
                  Enable Notifications
                </button>
              )}
            </div>

            {/* Create New Alert Form */}
            <form onSubmit={handleCreatePriceAlert} style={{ background: 'rgba(255,255,255,0.03)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)', marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label className="form-label">Coin Pair</label>
                  <select
                    className="app-select"
                    value={alertSymbol}
                    onChange={e => {
                      const sym = e.target.value;
                      setAlertSymbol(sym);
                      const p = marketPrices[sym] || allCoins.find(c => c.symbol === sym)?.basePrice || 0;
                      if (p > 0) setAlertTargetInput(String(p));
                    }}
                  >
                    {allCoins.map(c => (
                      <option key={c.symbol} value={c.symbol}>
                        {c.isNewLaunch ? '🆕 ' : ''}{c.symbol}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Condition</label>
                  <select
                    className="app-select"
                    value={alertConditionMode}
                    onChange={e => setAlertConditionMode(e.target.value as AlertConditionMode)}
                  >
                    <option value="AUTO">Auto (Above / Below)</option>
                    <option value="ABOVE">Crosses Above (≥)</option>
                    <option value="BELOW">Drops Below (≤)</option>
                  </select>
                </div>
              </div>

              {(() => {
                const currentRefPrice = marketPrices[alertSymbol] || allCoins.find(c => c.symbol === alertSymbol)?.basePrice || 0;
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>Target Price ($)</label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                        Live: <strong>${formatCryptoPrice(currentRefPrice)}</strong>
                      </span>
                    </div>

                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="form-input"
                      placeholder="e.g. 90000"
                      value={alertTargetInput}
                      onChange={e => setAlertTargetInput(e.target.value)}
                      required
                      style={{ marginBottom: '8px' }}
                    />

                    {currentRefPrice > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        {[-5, -2, 2, 5].map(pct => {
                          const presetVal = currentRefPrice * (1 + pct / 100);
                          return (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setAlertTargetInput(String(Number(presetVal.toPrecision(6))))}
                              style={{
                                background: pct > 0 ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 77, 77, 0.12)',
                                color: pct > 0 ? '#00e676' : '#ff6b8b',
                                border: `1px solid ${pct > 0 ? 'rgba(0, 230, 118, 0.35)' : 'rgba(255, 77, 77, 0.35)'}`,
                                borderRadius: '6px',
                                padding: '3px 8px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              {pct > 0 ? `+${pct}%` : `${pct}%`}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}

              <div style={{ marginBottom: '10px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Optional note (e.g. Breakout level, Support bounce)"
                  value={alertNoteInput}
                  onChange={e => setAlertNoteInput(e.target.value)}
                  maxLength={80}
                  style={{ fontSize: '0.82rem' }}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Plus size={16} />
                <span>Create Price Alert</span>
              </button>
            </form>

            {/* Active Alerts List */}
            <div style={{ marginBottom: '14px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#fff' }}>
                🔔 Active Alerts ({priceAlerts.filter(a => !a.triggered).length})
              </h4>
              {priceAlerts.filter(a => !a.triggered).length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '12px', background: '#0b0f19', borderRadius: '8px', textAlign: 'center' }}>
                  Abhi koi active price alert nahi hai. Upar form se target set karein.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {priceAlerts.filter(a => !a.triggered).map(alert => {
                    const liveP = marketPrices[alert.symbol] || 0;
                    const diffPct = liveP > 0 ? ((alert.targetPrice - liveP) / liveP) * 100 : 0;
                    return (
                      <div
                        key={alert.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          background: '#0b0f19',
                          border: '1px solid rgba(0, 210, 255, 0.22)',
                          borderRadius: '8px',
                          padding: '10px 12px'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong style={{ color: '#fff', fontSize: '0.9rem' }}>{alert.symbol}</strong>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: alert.condition === 'ABOVE' ? 'rgba(0, 230, 118, 0.15)' : 'rgba(255, 77, 77, 0.15)',
                                color: alert.condition === 'ABOVE' ? '#00e676' : '#ff6b8b'
                              }}
                            >
                              {alert.condition === 'ABOVE' ? '▲ ABOVE' : '▼ BELOW'} ${formatCryptoPrice(alert.targetPrice)}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                            {liveP > 0 ? `Live: $${formatCryptoPrice(liveP)} (${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}% away)` : 'Waiting for live price...'}
                            {alert.note ? ` • ${alert.note}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeletePriceAlert(alert.id)}
                          style={{ background: 'rgba(255,77,77,0.12)', border: '1px solid rgba(255,77,77,0.3)', borderRadius: '6px', padding: '6px', color: '#ff6b8b', cursor: 'pointer' }}
                          title="Delete Alert"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Triggered Alerts History */}
            {priceAlerts.some(a => a.triggered) && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#00e676' }}>
                    ✅ Triggered Alerts ({priceAlerts.filter(a => a.triggered).length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleClearTriggeredAlerts}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Clear History
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {priceAlerts.filter(a => a.triggered).map(alert => (
                    <div
                      key={alert.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(0, 230, 118, 0.08)',
                        border: '1px solid rgba(0, 230, 118, 0.35)',
                        borderRadius: '8px',
                        padding: '10px 12px'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 800, color: '#00e676', fontSize: '0.86rem' }}>
                          {alert.symbol} — Target ${formatCryptoPrice(alert.targetPrice)} Hit!
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Triggered at ${formatCryptoPrice(alert.triggeredPrice || alert.targetPrice)}
                          {alert.triggeredAt ? ` • ${new Date(alert.triggeredAt).toLocaleTimeString()}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleRearmPriceAlert(alert.id)}
                          title="Re-arm Alert"
                          style={{ background: 'rgba(0,210,255,0.14)', border: '1px solid rgba(0,210,255,0.3)', borderRadius: '6px', padding: '5px 8px', color: '#00e5ff', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Re-arm
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePriceAlert(alert.id)}
                          title="Delete"
                          style={{ background: 'rgba(255,77,77,0.12)', border: '1px solid rgba(255,77,77,0.3)', borderRadius: '6px', padding: '5px', color: '#ff6b8b', cursor: 'pointer' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </>
  );
}
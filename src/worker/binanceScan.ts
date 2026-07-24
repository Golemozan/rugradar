import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  fetchUsdtSymbols,
  fetchListingInfo,
  fetchDailyCloses,
} from "../sources/binance.js";
import { sleep } from "../sources/http.js";

// Son 6 ay icinde listelenmis Binance USDT coinleri + fiyat performansi.
// Tek kaynak: Binance public API (key yok). Market cap yok (Binance vermez).

const CACHE_FILE = ".binance-listings-cache.json";
const MAX_AGE_MS = 183 * 24 * 60 * 60 * 1000; // ~6 ay
const KLINE_DAYS = 31; // 30g/7g/24s performans icin yeterli pencere

// symbol -> listeleme bilgisi. DEGISMEZ, o yuzden kalici cache.
type ListingCache = Record<string, { listedAt: number; firstPrice: number }>;

export interface BinanceListingRow {
  symbol: string;
  base: string;
  listedAt: number;      // ms
  firstPrice: number;
  currentPrice: number;
  sinceListingPct: number;      // listelemeden beri %
  d30Pct: number | null;        // 30 gun %
  d7Pct: number | null;         // 7 gun %
  d24Pct: number | null;        // 24 saat %
}

// Panelin okudugu bellek-ici sonuc. Binance'a her istekte gidilmez.
let rows: BinanceListingRow[] = [];
let updatedAt: number | null = null;
let refreshing = false;

export function getBinanceListings(): {
  rows: BinanceListingRow[];
  updatedAt: number | null;
  refreshing: boolean;
} {
  return { rows, updatedAt, refreshing };
}

function loadCache(): ListingCache {
  try {
    if (existsSync(CACHE_FILE)) return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    /* bozuksa sifirdan */
  }
  return {};
}
function saveCache(c: ListingCache): void {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(c), "utf8");
  } catch {
    /* yazamazsa bellekte devam */
  }
}

function pctChange(from: number, to: number): number {
  if (!Number.isFinite(from) || from <= 0) return 0;
  return round((to - from) / from * 100);
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Tek tur: bilinmeyen sembolleri tarihle (cache) -> son 6 ay olanlari fiyatla.
export async function refreshBinanceListings(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const cache = loadCache();
    const symbols = await fetchUsdtSymbols();
    if (symbols.length === 0) {
      console.log("[binance] sembol cekilemedi (rate limit / ag?)");
      return;
    }

    // 1) Bilinmeyen sembolleri tarihle. Ilk calismada cok olur; sonra sadece yeniler.
    let dated = 0;
    for (const s of symbols) {
      if (cache[s.symbol]) continue;
      const info = await fetchListingInfo(s.symbol);
      if (info) {
        cache[s.symbol] = info;
        dated++;
        if (dated % 25 === 0) saveCache(cache); // ara kayit (crash'e karsi)
      }
      await sleep(200); // rate-limit'e nazik
    }
    if (dated > 0) {
      saveCache(cache);
      console.log(`[binance] ${dated} yeni sembol tarihlendi`);
    }

    // 2) Son 6 ayda listelenmis olanlari sec.
    const cutoff = Date.now() - MAX_AGE_MS;
    const recent = symbols.filter((s) => (cache[s.symbol]?.listedAt ?? 0) >= cutoff);

    // 3) Her biri icin gunluk kapanislari cek, performansi hesapla.
    const out: BinanceListingRow[] = [];
    for (const s of recent) {
      const closes = await fetchDailyCloses(s.symbol, KLINE_DAYS);
      if (closes.length < 2) continue;
      const current = closes[closes.length - 1];
      const info = cache[s.symbol]!;
      out.push({
        symbol: s.symbol,
        base: s.base,
        listedAt: info.listedAt,
        firstPrice: info.firstPrice,
        currentPrice: current,
        sinceListingPct: pctChange(info.firstPrice, current),
        d30Pct: closes.length >= 31 ? pctChange(closes[0], current) : null,
        d7Pct: closes.length >= 8 ? pctChange(closes[closes.length - 8], current) : null,
        d24Pct: closes.length >= 2 ? pctChange(closes[closes.length - 2], current) : null,
      });
      await sleep(150);
    }

    // En cok dusenler ustte (dip avi).
    out.sort((a, b) => a.sinceListingPct - b.sinceListingPct);
    rows = out;
    updatedAt = Date.now();
    console.log(`[binance] ${out.length} yeni-listelenmis coin (son 6 ay)`);
  } catch (e) {
    console.error("[binance] refresh hatasi:", e);
  } finally {
    refreshing = false;
  }
}

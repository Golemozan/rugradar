import { readFileSync, writeFileSync, existsSync } from "node:fs";
import {
  fetchUsdtSymbols,
  fetchListingInfo,
  fetchDailyCloses,
  type UsdtSymbol,
} from "../sources/binance.js";

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

// Sinirli eszamanli map: N istegi paralel calistirir, sirayla degil.
// Boylece 463 sembolluk soguk tarama 4 dakika yerine ~30-60sn'de biter.
// Binance klines weight'i dusuk (2/istek, 6000/dk limit) — conc 6 cok guvenli,
// zaten getJson 429'da backoff yapiyor.
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return out;
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

    const cutoff = Date.now() - MAX_AGE_MS;

    // 1) Once ELIMIZDEKI cache'ten son-6-ay coinleri hemen fiyatla ve yayinla.
    //    Boylece soguk taramada bile panel bos "kalmaz" — bildigimiz coinler
    //    saniyeler icinde tabloya duser, tarihleme arka planda surer.
    await priceAndPublish(symbols, cache, cutoff);

    // 2) Bilinmeyen sembolleri PARALEL tarihle (seri + 200ms uyku yerine).
    //    Ilk calismada 463 sembol; conc 6 ile ~30-60sn, eskiden ~4dk.
    const unknown = symbols.filter((s) => !cache[s.symbol]);
    let dated = 0;
    await mapPool(unknown, 6, async (s) => {
      const info = await fetchListingInfo(s.symbol);
      if (info) {
        cache[s.symbol] = info;
        if (++dated % 25 === 0) saveCache(cache); // ara kayit (crash'e karsi)
      }
    });
    if (dated > 0) {
      saveCache(cache);
      console.log(`[binance] ${dated} yeni sembol tarihlendi`);
      // Yeni tarihlenenlerle listeyi tazele.
      await priceAndPublish(symbols, cache, cutoff);
    }
  } catch (e) {
    console.error("[binance] refresh hatasi:", e);
  } finally {
    refreshing = false;
  }
}

// Cache'te son 6 ayda listelenmis coinleri PARALEL fiyatla, hesapla, YAYINLA.
// rows/updatedAt'i gunceller — panel bir sonraki poll'de gorur.
async function priceAndPublish(
  symbols: UsdtSymbol[],
  cache: ListingCache,
  cutoff: number
): Promise<void> {
  const recent = symbols.filter((s) => (cache[s.symbol]?.listedAt ?? 0) >= cutoff);
  if (recent.length === 0) return;

  const priced = await mapPool(recent, 6, async (s): Promise<BinanceListingRow | null> => {
    const closes = await fetchDailyCloses(s.symbol, KLINE_DAYS);
    if (closes.length < 2) return null;
    const current = closes[closes.length - 1];
    const info = cache[s.symbol]!;
    return {
      symbol: s.symbol,
      base: s.base,
      listedAt: info.listedAt,
      firstPrice: info.firstPrice,
      currentPrice: current,
      sinceListingPct: pctChange(info.firstPrice, current),
      d30Pct: closes.length >= 31 ? pctChange(closes[0], current) : null,
      d7Pct: closes.length >= 8 ? pctChange(closes[closes.length - 8], current) : null,
      d24Pct: closes.length >= 2 ? pctChange(closes[closes.length - 2], current) : null,
    };
  });

  const out = priced.filter((r): r is BinanceListingRow => r !== null);
  // En cok dusenler ustte (dip avi).
  out.sort((a, b) => a.sinceListingPct - b.sinceListingPct);
  rows = out;
  updatedAt = Date.now();
  console.log(`[binance] ${out.length} yeni-listelenmis coin (son 6 ay)`);
}

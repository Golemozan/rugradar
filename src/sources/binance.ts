import { getJson } from "./http.js";

// Binance public REST API — key gerektirmez, tamamen ucretsiz.
// Market cap YOK (Binance dolasim arzi vermez); burada sadece listeleme tarihi
// + fiyat performansi cekiyoruz, hepsi public endpoint'lerden.
const BASE = "https://api.binance.com";

interface ExchangeInfo {
  symbols: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    status: string;
  }[];
}

// Base asset olarak sayarsak anlamsiz olan stablecoin/fiat'lar (buyuk, trendsiz).
const EXCLUDE_BASE = new Set([
  "USDT", "USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "PAX",
  "EUR", "EURI", "AEUR", "GBP", "TRY", "BRL", "ARS", "JPY",
]);

export interface UsdtSymbol {
  symbol: string; // "FOOUSDT"
  base: string;   // "FOO"
}

// Islem goren tum USDT paritelerini dondur (stablecoin base'leri haric).
export async function fetchUsdtSymbols(): Promise<UsdtSymbol[]> {
  const info = await getJson<ExchangeInfo>(`${BASE}/api/v3/exchangeInfo`);
  if (!info) return [];
  return info.symbols
    .filter(
      (s) =>
        s.status === "TRADING" &&
        s.quoteAsset === "USDT" &&
        !EXCLUDE_BASE.has(s.baseAsset)
    )
    .map((s) => ({ symbol: s.symbol, base: s.baseAsset }));
}

// Kline dizisi: [openTime, open, high, low, close, volume, closeTime, ...]
type Kline = [number, string, string, string, string, string, number, ...unknown[]];

// En eski gunluk mum = coin'in ilk islem gunu ≈ listeleme tarihi + ilk fiyat.
// startTime=0 -> borsanin verdigi en eski mumu getirir. Bu deger DEGISMEZ,
// bir kez cekilip kalici cache'lenir.
export async function fetchListingInfo(
  symbol: string
): Promise<{ listedAt: number; firstPrice: number } | null> {
  const k = await getJson<Kline[]>(
    `${BASE}/api/v3/klines?symbol=${symbol}&interval=1d&startTime=0&limit=1`
  );
  if (!k || k.length === 0) return null;
  const first = k[0];
  const firstPrice = Number(first[1]); // open
  if (!Number.isFinite(firstPrice) || firstPrice <= 0) return null;
  return { listedAt: first[0], firstPrice };
}

// Son N gunluk kapanis fiyatlari (performans hesabi icin). Eskiden -> yeniye sirali.
export async function fetchDailyCloses(
  symbol: string,
  days: number
): Promise<number[]> {
  const k = await getJson<Kline[]>(
    `${BASE}/api/v3/klines?symbol=${symbol}&interval=1d&limit=${days}`
  );
  if (!k) return [];
  return k
    .map((c) => Number(c[4])) // close
    .filter((n) => Number.isFinite(n) && n > 0);
}

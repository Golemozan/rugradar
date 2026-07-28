export interface PoolRow {
  id: number;
  chain: string;
  symbol: string;
  pairAddress: string;
  dex: string;
  lastCheckedAt: string;
  score: number | null;
  breakdown: Record<string, number> | null;
  // v2 sinyalleri
  confidence: number | null;
  hardFail: boolean | null;
  reasons: string[];
  liquidityUsd: number | null;
  topHolderPct: number | null;
  top10HolderPct: number | null;
  holderCount: number | null;
  honeypotResult: string | null; // pass | fail | unknown
  sellPriceImpact: number | null;
  buys1h: number | null;
  sells1h: number | null;
  fdvUsd: number | null;
  pairCreatedAt: string | null;
}

export interface AlertRow {
  id: number;
  sentAt: string;
  channel: string;
  pool: { baseTokenSymbol: string; chain: string; pairAddress: string };
  score: { score: number };
}

export interface BinanceListingRow {
  symbol: string;
  base: string;
  listedAt: number;
  firstPrice: number;
  currentPrice: number;
  sinceListingPct: number;
  d30Pct: number | null;
  d7Pct: number | null;
  d24Pct: number | null;
}

export interface BinanceListingsResponse {
  rows: BinanceListingRow[];
  updatedAt: number | null;
  refreshing: boolean;
}

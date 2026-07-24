export interface PoolRow {
  id: number;
  chain: string;
  symbol: string;
  pairAddress: string;
  dex: string;
  lastCheckedAt: string;
  score: number | null;
  breakdown: Record<string, number> | null;
}

export interface AlertRow {
  id: number;
  sentAt: string;
  channel: string;
  pool: { baseTokenSymbol: string; chain: string; pairAddress: string };
  score: { score: number };
}

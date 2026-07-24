import { getJson } from "./http.js";

// DexScreener'in temiz "yeni pair" endpoint'i public degil. Kesif icin
// token-profiles/latest (yeni tanitilan token'lar) kullaniyoruz, sonra her
// token'in pair detayini cekiyoruz. Ucretsiz, key gerektirmez.
const PROFILES_URL = "https://api.dexscreener.com/token-profiles/latest/v1";
const TOKENS_URL = (chain: string, addr: string) =>
  `https://api.dexscreener.com/tokens/v1/${chain}/${addr}`;

interface TokenProfile {
  chainId: string;
  tokenAddress: string;
}

interface TxnBucket {
  buys?: number;
  sells?: number;
}

// DexScreener pair objesi (ihtiyac duydugumuz alanlar).
export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns?: { m5?: TxnBucket; h1?: TxnBucket; h6?: TxnBucket; h24?: TxnBucket };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
}

// DexScreener slug'lari zaten "solana"/"ethereum"/"bsc"; birkac takma adi esitle.
function normalizeChain(slug: string): string {
  const s = slug.toLowerCase();
  if (s === "eth") return "ethereum";
  if (s === "sol") return "solana";
  if (s === "binance" || s === "bnb") return "bsc";
  return s;
}

// Bir DexScreener linkinden (veya cip lak adresten) chain + adres cikar.
// Ornek: https://dexscreener.com/solana/GqSn...  ->  { chain:"solana", address:"GqSn..." }
export function parseDexScreenerUrl(input: string): { chain: string; address: string } | null {
  const s = input.trim();
  const m = s.match(/dexscreener\.com\/([a-zA-Z0-9-]+)\/([A-Za-z0-9]+)/);
  if (m) return { chain: normalizeChain(m[1]), address: m[2] };
  // link degil, cip lak adres -> solana varsay
  const bare = s.match(/^([A-Za-z0-9]{25,})$/);
  if (bare) return { chain: "solana", address: bare[1] };
  return null;
}

// Bir chain'de yeni tanitilan token adreslerini dondur.
export async function fetchNewTokenAddresses(chain: string): Promise<string[]> {
  const profiles = await getJson<TokenProfile[]>(PROFILES_URL);
  if (!profiles) return [];
  return profiles
    .filter((p) => p.chainId === chain)
    .map((p) => p.tokenAddress);
}

// Bir token adresinin en likit pair'ini dondur (yoksa null).
export async function fetchTopPair(chain: string, tokenAddress: string): Promise<DexPair | null> {
  const pairs = await getJson<DexPair[]>(TOKENS_URL(chain, tokenAddress));
  if (!pairs || pairs.length === 0) return null;
  return mostLiquid(pairs);
}

// Pair adresi VEYA token adresiyle pair'i getir (manuel lookup icin).
// Once pair endpoint'i, bos donerse token endpoint'ine dus.
export async function fetchPairByAddress(chain: string, address: string): Promise<DexPair | null> {
  const byPair = await getJson<{ pair?: DexPair; pairs?: DexPair[] }>(
    `https://api.dexscreener.com/latest/dex/pairs/${chain}/${address}`
  );
  const fromPair = byPair?.pairs?.length ? mostLiquid(byPair.pairs) : byPair?.pair ?? null;
  if (fromPair) return fromPair;
  // adres pair degil token olabilir -> token endpoint'i
  return fetchTopPair(chain, address);
}

function mostLiquid(pairs: DexPair[]): DexPair {
  return pairs.reduce((best, p) =>
    (p.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0) ? p : best
  );
}

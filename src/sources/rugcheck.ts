import { getJson } from "./http.js";
import type { SafetySignals } from "../scoring/types.js";
import type { DexPair } from "./dexscreener.js";

// RugCheck.xyz public report (key gerektirmez). Solana token mint adresi ister.
const REPORT_URL = (mint: string) =>
  `https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`;

// Ihtiyac duydugumuz alanlar (RugCheck cevabi genis, gerisini rawResponse'a atariz).
interface RugcheckSummary {
  score?: number;
  score_normalised?: number;
  risks?: { name: string; level: string; description?: string }[];
  // bazi alanlar full report'ta; summary'de risks + score var.
}

// Full report daha zengin (mint/freeze authority, topHolders, LP locked).
const FULL_URL = (mint: string) => `https://api.rugcheck.xyz/v1/tokens/${mint}/report`;

interface RugcheckFull {
  mintAuthority?: string | null;   // null => renounce/kapali
  freezeAuthority?: string | null;
  topHolders?: { pct?: number; owner?: string; address?: string; insider?: boolean }[];
  markets?: {
    pubkey?: string;
    liquidityA?: string;
    liquidityB?: string;
    lp?: { lpLockedPct?: number };
  }[];
  totalMarketLiquidity?: number;
  totalHolders?: number;
  token?: { decimals?: number };
  risks?: { name: string; level: string }[];
}

export interface RugcheckResult {
  signals: SafetySignals;
  raw: unknown;
  decimals: number | null; // Jupiter satis simulasyonunun tutari icin gerekli
}

// Solana token'ini tarayip ortak SafetySignals'e normalize et.
export async function checkSolanaToken(pair: DexPair): Promise<RugcheckResult> {
  const mint = pair.baseToken.address;
  const full = await getJson<RugcheckFull>(FULL_URL(mint));

  const signals: SafetySignals = {
    chain: "solana",
    liquidityLocked: null,
    liquidityLockPct: null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    ownershipRenounced: null, // Solana'da owner kavrami yerine mint/freeze authority
    mintAuthorityActive: null,
    freezeAuthorityActive: null,
    topHolderPct: null,
    top10HolderPct: null,
    holderCount: null,
    honeypot: "unknown", // Jupiter satis testi scan.ts'te doldurur
    sellPriceImpactPct: null,
    // DexScreener'dan gelen pazar/davranis sinyalleri
    volumeUsd5m: pair.volume?.m5 ?? null,
    volumeUsd1h: pair.volume?.h1 ?? null,
    buys1h: pair.txns?.h1?.buys ?? null,
    sells1h: pair.txns?.h1?.sells ?? null,
    pairCreatedAt: pair.pairCreatedAt ?? null,
    fdvUsd: pair.fdv ?? pair.marketCap ?? null,
  };

  if (full) {
    signals.mintAuthorityActive = full.mintAuthority != null;
    signals.freezeAuthorityActive = full.freezeAuthority != null;

    // LP locked pct: birden fazla market olabilir, en yukseki al
    const lpPcts = (full.markets ?? [])
      .map((m) => m.lp?.lpLockedPct)
      .filter((n): n is number => typeof n === "number");
    if (lpPcts.length) {
      const maxLp = Math.max(...lpPcts) / 100; // RugCheck 0..100 verir
      signals.liquidityLockPct = maxLp;
      signals.liquidityLocked = maxLp >= 0.5;
    }

    // top holder: LP/market/insider hesaplarini disla.
    // (En buyuk "holder" cogu zaman havuzun kendisi -> bunu holder sayarsak
    //  her token asiri konsantre gorunur ve skor hep tavana kapanir.)
    const marketAddrs = new Set<string>();
    for (const m of full.markets ?? []) {
      for (const a of [m.pubkey, m.liquidityA, m.liquidityB]) {
        if (a) marketAddrs.add(a);
      }
    }
    const holders = (full.topHolders ?? []).filter(
      (h) =>
        !h.insider &&
        !(h.owner && marketAddrs.has(h.owner)) &&
        !(h.address && marketAddrs.has(h.address))
    );
    if (holders.length) {
      const pcts = holders.map((h) => h.pct ?? 0).sort((a, b) => b - a);
      signals.topHolderPct = pcts[0] / 100; // 0..100 -> 0..1
      // Ilk 10'un TOPLAMI: tek cuzdan dusuk gorunup supply 10 cuzdana
      // dagitilmis olabilir (bundle/sniper kalibi). top-1 bunu kacirir.
      const sum10 = pcts.slice(0, 10).reduce((a, b) => a + b, 0);
      signals.top10HolderPct = Math.min(1, sum10 / 100);
    }

    if (typeof full.totalHolders === "number") {
      signals.holderCount = full.totalHolders;
    }

    // RugCheck "danger" seviyesinde honeypot benzeri risk isaretlerse fail say
    const danger = (full.risks ?? []).some(
      (r) => r.level === "danger" && /honeypot|cannot sell|transfer/i.test(r.name)
    );
    if (danger) signals.honeypot = "fail";
  }

  return { signals, raw: full, decimals: full?.token?.decimals ?? null };
}

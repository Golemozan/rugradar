import { prisma } from "../db/client.js";
import { fetchNewTokenAddresses, fetchTopPair, type DexPair } from "../sources/dexscreener.js";
import { checkSolanaToken } from "../sources/rugcheck.js";
import { simulateSell } from "../sources/jupiter.js";
import { scorePool } from "../scoring/score.js";
import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "../scoring/types.js";
import { sendAlert } from "../notify/telegram.js";
import { sleep } from "../sources/http.js";

const THRESHOLD = Number(process.env.ALERT_SCORE_THRESHOLD ?? 70);

// Esikler env'den ayarlanabilir — kalibrasyon icin kodu degistirmeye gerek yok.
const SCORING: ScoringConfig = {
  ...DEFAULT_SCORING_CONFIG,
  minLiquidityUsd: num(process.env.MIN_LIQUIDITY_USD, DEFAULT_SCORING_CONFIG.minLiquidityUsd),
  maxFdvLiqRatio: num(process.env.MAX_FDV_LIQ_RATIO, DEFAULT_SCORING_CONFIG.maxFdvLiqRatio),
  minConfidence: num(process.env.MIN_CONFIDENCE, DEFAULT_SCORING_CONFIG.minConfidence),
};

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? n : fallback;
}

// Ayni pool'u kisa surede tekrar taramamak icin bellek cache'i.
const recentlyChecked = new Map<string, number>();
const RECHECK_COOLDOWN_MS = 10 * 60 * 1000; // 10 dk

// Solana icin tam bir tarama turu: kesfet -> tara -> skorla -> kaydet -> alert.
export async function scanSolanaOnce(): Promise<void> {
  const addresses = await fetchNewTokenAddresses("solana");
  if (addresses.length === 0) {
    console.log("[scan] solana: yeni token yok");
    return;
  }

  let scanned = 0;
  for (const addr of addresses) {
    const now = Date.now();
    const last = recentlyChecked.get(addr);
    if (last && now - last < RECHECK_COOLDOWN_MS) continue;
    recentlyChecked.set(addr, now);

    const pair = await fetchTopPair("solana", addr);
    if (!pair) continue;

    await processPair(pair);
    scanned++;

    // rate-limit'e nazik ol
    await sleep(250);
  }
  console.log(`[scan] solana: ${scanned} pool tarandi (esik ${THRESHOLD})`);
  pruneCache();
}

// Tek bir pair'i uctan uca isle.
async function processPair(pair: DexPair): Promise<void> {
  const { signals, raw, decimals } = await checkSolanaToken(pair);

  // Satis testi PAHALI (1-2 ag istegi). Nasil olsa hard gate'e takilacak
  // coinler icin harcamayiz: likidite esigin altindaysa veya RugCheck zaten
  // "satilamaz" dediyse Jupiter'i hic cagirmayiz.
  const alreadyDoomed =
    signals.honeypot === "fail" ||
    (signals.liquidityUsd != null && signals.liquidityUsd < SCORING.minLiquidityUsd);

  if (!alreadyDoomed) {
    const sim = await simulateSell(
      pair.baseToken.address,
      decimals,
      pair.priceUsd ? Number(pair.priceUsd) : null
    );
    signals.honeypot = sim.result;
    signals.sellPriceImpactPct = sim.priceImpactPct;
  }

  const result = scorePool(signals, SCORING);

  // pool upsert
  const pool = await prisma.pool.upsert({
    where: { pairAddress: pair.pairAddress },
    create: {
      chain: "solana",
      pairAddress: pair.pairAddress,
      baseTokenAddress: pair.baseToken.address,
      baseTokenSymbol: pair.baseToken.symbol,
      quoteTokenSymbol: pair.quoteToken.symbol,
      dex: pair.dexId,
    },
    update: { lastCheckedAt: new Date() },
  });

  // check + score (her tarama kaydedilir — threshold tuning icin)
  const check = await prisma.check.create({
    data: {
      poolId: pool.id,
      liquidityLocked: signals.liquidityLocked,
      liquidityLockPct: signals.liquidityLockPct,
      liquidityUsd: signals.liquidityUsd,
      ownershipRenounced: signals.ownershipRenounced,
      mintAuthorityActive: signals.mintAuthorityActive,
      freezeAuthorityActive: signals.freezeAuthorityActive,
      topHolderPct: signals.topHolderPct,
      top10HolderPct: signals.top10HolderPct,
      holderCount: signals.holderCount,
      honeypotResult: signals.honeypot,
      sellPriceImpact: signals.sellPriceImpactPct,
      volumeLiquidityRatio:
        signals.volumeUsd5m != null && signals.liquidityUsd
          ? signals.volumeUsd5m / signals.liquidityUsd
          : null,
      buys1h: signals.buys1h,
      sells1h: signals.sells1h,
      fdvUsd: signals.fdvUsd,
      pairCreatedAt: signals.pairCreatedAt != null ? new Date(signals.pairCreatedAt) : null,
      confidence: result.confidence,
      hardFail: result.hardFail,
      rawResponse: raw != null ? JSON.stringify(raw) : null,
      score: {
        create: {
          score: result.score,
          breakdown: JSON.stringify(result.breakdown),
        },
      },
    },
    include: { score: true },
  });

  // esik gecti + hard-fail degil -> alert (ayni pool'a tekrar alert atma)
  if (!result.hardFail && result.score >= THRESHOLD && check.score) {
    const already = await prisma.alert.findFirst({ where: { poolId: pool.id } });
    if (!already) {
      const msgId = await sendAlert(pair, result);
      await prisma.alert.create({
        data: {
          poolId: pool.id,
          scoreId: check.score.id,
          telegramMessageId: msgId,
          channel: "telegram",
        },
      });
      console.log(`[alert] ${pair.baseToken.symbol} skor ${result.score} -> gonderildi`);
    }
  }
}

function pruneCache(): void {
  const now = Date.now();
  for (const [k, t] of recentlyChecked) {
    if (now - t > RECHECK_COOLDOWN_MS) recentlyChecked.delete(k);
  }
}

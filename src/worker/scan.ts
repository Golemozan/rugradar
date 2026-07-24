import { prisma } from "../db/client.js";
import { fetchNewTokenAddresses, fetchTopPair, type DexPair } from "../sources/dexscreener.js";
import { checkSolanaToken } from "../sources/rugcheck.js";
import { scorePool } from "../scoring/score.js";
import { sendAlert } from "../notify/telegram.js";
import { sleep } from "../sources/http.js";

const THRESHOLD = Number(process.env.ALERT_SCORE_THRESHOLD ?? 70);

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
  const { signals, raw } = await checkSolanaToken(pair);
  const result = scorePool(signals);

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
      ownershipRenounced: signals.ownershipRenounced,
      topHolderPct: signals.topHolderPct,
      honeypotResult: signals.honeypot,
      volumeLiquidityRatio:
        signals.volumeUsd5m != null && signals.liquidityUsd
          ? signals.volumeUsd5m / signals.liquidityUsd
          : null,
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

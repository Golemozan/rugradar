// Tek seferlik canli dogrulama — v2 elegi gercek veride ne yapiyor?
// Calistir: npx tsx verify-scoring.ts   (sonra silinir)
import "dotenv/config";
import { fetchNewTokenAddresses, fetchTopPair } from "../src/sources/dexscreener.js";
import { checkSolanaToken } from "../src/sources/rugcheck.js";
import { simulateSell } from "../src/sources/jupiter.js";
import { scorePool } from "../src/scoring/score.js";
import { sleep } from "../src/sources/http.js";

const LIMIT = Number(process.argv[2] ?? 12);

async function main() {
  const addrs = await fetchNewTokenAddresses("solana");
  console.log(`kesfedilen token: ${addrs.length}, ilk ${LIMIT} taraniyor\n`);

  let gated = 0;
  let passed = 0;
  const scores: number[] = [];

  for (const addr of addrs.slice(0, LIMIT)) {
    const pair = await fetchTopPair("solana", addr);
    if (!pair) continue;

    const { signals, decimals } = await checkSolanaToken(pair);

    const doomed =
      signals.honeypot === "fail" ||
      (signals.liquidityUsd != null && signals.liquidityUsd < 5000);

    let simNote = "atlandi (zaten elenecek)";
    if (!doomed) {
      const sim = await simulateSell(
        pair.baseToken.address,
        decimals,
        pair.priceUsd ? Number(pair.priceUsd) : null
      );
      signals.honeypot = sim.result;
      signals.sellPriceImpactPct = sim.priceImpactPct;
      simNote = `${sim.result} — ${sim.reason}`;
    }

    const r = scorePool(signals);
    scores.push(r.score);
    if (r.hardFail) gated++;
    else if (r.score >= 70) passed++;

    const tag = r.hardFail ? "⛔ ELENDI" : r.score >= 70 ? "🟢 GECTI" : "🟡 dusuk";
    console.log(
      `${tag}  ${pair.baseToken.symbol.padEnd(12)} skor ${String(r.score).padStart(5)}  ` +
        `guven %${Math.round(r.confidence * 100)}  ` +
        `likidite $${Math.round(signals.liquidityUsd ?? 0).toLocaleString("en-US")}`
    );
    console.log(`    satis testi: ${simNote}`);
    console.log(
      `    top1 ${fmtPct(signals.topHolderPct)} · top10 ${fmtPct(signals.top10HolderPct)} · ` +
        `mint ${signals.mintAuthorityActive} · freeze ${signals.freezeAuthorityActive} · ` +
        `1sa ${signals.buys1h ?? "?"}/${signals.sells1h ?? "?"}`
    );
    console.log(`    ${r.reasons[0] ?? ""}`);
    console.log();

    await sleep(300);
  }

  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  console.log("─".repeat(60));
  console.log(
    `toplam ${scores.length} · elendi ${gated} · esigi gecti ${passed} · ort. skor ${avg.toFixed(1)}`
  );
}

function fmtPct(n: number | null): string {
  return n == null ? "?" : `%${Math.round(n * 100)}`;
}

main().catch((e) => {
  console.error("hata:", e);
  process.exit(1);
});

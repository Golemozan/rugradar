import { parseDexScreenerUrl, fetchPairByAddress, type DexPair } from "../sources/dexscreener.js";
import { checkSolanaToken } from "../sources/rugcheck.js";
import { simulateSell } from "../sources/jupiter.js";
import { scorePool } from "../scoring/score.js";

// Kullanicinin yapistirdigi DexScreener linkini analiz et -> HTML rapor (Telegram).
export async function analyzeUrl(input: string): Promise<string> {
  const parsed = parseDexScreenerUrl(input);
  if (!parsed) {
    return "❌ Gecerli bir DexScreener linki bulamadim. Ornek:\nhttps://dexscreener.com/solana/&lt;pair&gt;";
  }

  const pair = await fetchPairByAddress(parsed.chain, parsed.address);
  if (!pair) {
    return `❌ Bu adres icin pair bulunamadi (${escapeHtml(parsed.chain)}). Link dogru mu?`;
  }

  const market = marketBlock(pair);

  // Guvenlik + skor SADECE Solana (Phase 1). EVM Phase 2'de.
  if (pair.chainId === "solana") {
    const { signals, decimals } = await checkSolanaToken(pair);

    // Manuel sorguda satis testini HER ZAMAN yap — Ozan bu raporu karar vermek
    // icin okuyor, "satabiliyor muyuz" sorusunun tahmini degil olcumu lazim.
    if (signals.honeypot !== "fail") {
      const sim = await simulateSell(
        pair.baseToken.address,
        decimals,
        pair.priceUsd ? Number(pair.priceUsd) : null
      );
      signals.honeypot = sim.result;
      signals.sellPriceImpactPct = sim.priceImpactPct;
    }

    const r = scorePool(signals);
    const head = r.hardFail
      ? `🔴 <b>${escapeHtml(pair.baseToken.symbol)}</b> — ⛔ ELENDI (skor ${r.score})`
      : `${scoreEmoji(r.score)} <b>${escapeHtml(pair.baseToken.symbol)}</b> — skor <b>${r.score}</b>/100`;
    const conf = `<i>veri guveni: %${Math.round(r.confidence * 100)}</i>`;
    const reasons = r.reasons.map((x) => `• ${escapeHtml(x)}`).join("\n");
    return `${head}\n${market}\n\n<b>Analiz</b> ${conf}\n${reasons}\n\n${link(pair)}`;
  }

  return (
    `ℹ️ <b>${escapeHtml(pair.baseToken.symbol)}</b> (${escapeHtml(pair.chainId)})\n` +
    `${market}\n\n` +
    `<i>Guvenlik skoru simdilik sadece Solana. ${escapeHtml(pair.chainId.toUpperCase())} Phase 2'de.</i>\n\n` +
    `${link(pair)}`
  );
}

function marketBlock(p: DexPair): string {
  const price = p.priceUsd ? `$${p.priceUsd}` : "?";
  const liq = p.liquidity?.usd ? `$${fmt(p.liquidity.usd)}` : "?";
  const mc = p.marketCap ?? p.fdv;
  const vol24 = p.volume?.h24 != null ? `$${fmt(p.volume.h24)}` : "?";

  // Alis/satis — honeypot kokusu: cok alis, sifir satis suphelidir.
  const t5 = p.txns?.m5;
  const t1 = p.txns?.h1;
  const buysSells = (b: { buys?: number; sells?: number } | undefined) =>
    b ? `${b.buys ?? 0} alis / ${b.sells ?? 0} satis` : "?";

  const sellFlag =
    t1 && (t1.buys ?? 0) >= 10 && (t1.sells ?? 0) === 0
      ? "\n⚠️ <b>1 saatte hic satis yok</b> — honeypot suphesi"
      : "";

  return (
    `fiyat: ${price} | likidite: ${liq} | mcap: ${mc ? "$" + fmt(mc) : "?"}\n` +
    `hacim 24s: ${vol24} | dex: ${escapeHtml(p.dexId)}\n` +
    `islem 5dk: ${buysSells(t5)} | 1s: ${buysSells(t1)}${sellFlag}`
  );
}

function link(p: DexPair): string {
  const url = `https://dexscreener.com/${p.chainId}/${p.pairAddress}`;
  return `<a href="${url}">DexScreener'da ac</a>`;
}

function scoreEmoji(s: number): string {
  if (s >= 80) return "🟢";
  if (s >= 60) return "🟡";
  return "🔴";
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

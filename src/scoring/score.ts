import type { SafetySignals, ScoreResult, ScoreBreakdown } from "./types.js";

// v1 agirliklar (toplam 100).
const WEIGHTS = {
  liquidity: 25,
  authority: 20,
  distribution: 20,
  honeypot: 20,
  organic: 15,
} as const;

// Bir cuzdan bunun uzerinde tutuyorsa skor tavani uygulanir.
const TOP_HOLDER_HARD_CAP_PCT = 0.2; // %20
const TOP_HOLDER_CAP_SCORE = 30;

// Saf fonksiyon: I/O yok, sadece SafetySignals -> ScoreResult.
// Test edilebilir cekirdek. Poller/DB/Telegram bunu cagirir.
export function scorePool(s: SafetySignals): ScoreResult {
  const reasons: string[] = [];

  // --- Hard gate: honeypot satamiyorsan her sey anlamsiz ---
  if (s.honeypot === "fail") {
    return {
      score: 0,
      breakdown: { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0 },
      hardFail: true,
      reasons: ["HONEYPOT: satis simulasyonu basarisiz — alert atilmaz"],
    };
  }

  const b: ScoreBreakdown = { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0 };

  // --- Likidite kilidi (0..1 * agirlik) ---
  {
    let f = 0;
    if (s.liquidityLocked === true) {
      f = s.liquidityLockPct != null ? clamp01(s.liquidityLockPct) : 0.8;
      reasons.push(`Likidite kilitli (${pct(s.liquidityLockPct ?? 0.8)})`);
    } else if (s.liquidityLocked === false) {
      f = 0;
      reasons.push("Likidite KILITSIZ");
    } else {
      f = 0; // bilinmiyor -> guvenli tarafta sifir
      reasons.push("Likidite kilidi bilinmiyor");
    }
    b.liquidity = round(f * WEIGHTS.liquidity);
  }

  // --- Yetki: renounce (EVM) + mint/freeze authority (Solana) ---
  {
    let f = 1;
    const parts: string[] = [];
    if (s.ownershipRenounced === false) { f -= 0.6; parts.push("owner renounce DEGIL"); }
    else if (s.ownershipRenounced === true) { parts.push("owner renounce"); }
    if (s.mintAuthorityActive === true) { f -= 0.5; parts.push("mint authority ACIK"); }
    if (s.freezeAuthorityActive === true) { f -= 0.5; parts.push("freeze authority ACIK"); }
    if (s.ownershipRenounced == null && s.mintAuthorityActive == null && s.freezeAuthorityActive == null) {
      f = 0; parts.push("yetki bilgisi yok");
    }
    f = clamp01(f);
    if (parts.length) reasons.push("Yetki: " + parts.join(", "));
    b.authority = round(f * WEIGHTS.authority);
  }

  // --- Dagilim: top holder yogunlugu ---
  {
    let f: number;
    if (s.topHolderPct == null) {
      f = 0;
      reasons.push("Top holder bilinmiyor");
    } else {
      // 0% -> 1.0, %50+ -> 0. Lineer.
      f = clamp01(1 - s.topHolderPct / 0.5);
      reasons.push(`Top holder ${pct(s.topHolderPct)}`);
    }
    b.distribution = round(f * WEIGHTS.distribution);
  }

  // --- Honeypot: pass tam puan, unknown yari puan ---
  {
    const f = s.honeypot === "pass" ? 1 : 0.5;
    if (s.honeypot === "pass") reasons.push("Satis testi PASS");
    else reasons.push("Satis testi bilinmiyor");
    b.honeypot = round(f * WEIGHTS.honeypot);
  }

  // --- Organik hacim/likidite orani (wash-trading kokusu) ---
  {
    let f = 0.5; // veri yoksa notr
    if (s.volumeUsd5m != null && s.liquidityUsd != null && s.liquidityUsd > 0) {
      const ratio = s.volumeUsd5m / s.liquidityUsd;
      // saglikli bant ~0.05..2. Cok dusuk = olu, cok yuksek = wash.
      if (ratio < 0.02) { f = 0.3; reasons.push("Hacim cok dusuk (olu)"); }
      else if (ratio > 5) { f = 0.1; reasons.push(`Hacim/likidite asiri yuksek (${ratio.toFixed(1)}x) — wash suphesi`); }
      else if (ratio > 2) { f = 0.6; reasons.push(`Hacim/likidite yuksek (${ratio.toFixed(1)}x)`); }
      else { f = 1; reasons.push(`Hacim/likidite saglikli (${ratio.toFixed(2)}x)`); }
    } else {
      reasons.push("Hacim/likidite verisi eksik");
    }
    b.organic = round(f * WEIGHTS.organic);
  }

  let score = round(b.liquidity + b.authority + b.distribution + b.honeypot + b.organic);

  // --- Hard cap: tek cuzdan cok tutuyorsa tavan uygula ---
  if (s.topHolderPct != null && s.topHolderPct > TOP_HOLDER_HARD_CAP_PCT && score > TOP_HOLDER_CAP_SCORE) {
    reasons.push(`Top holder >%${TOP_HOLDER_HARD_CAP_PCT * 100} — skor ${TOP_HOLDER_CAP_SCORE}'a kapatildi`);
    score = TOP_HOLDER_CAP_SCORE;
  }

  return { score, breakdown: b, hardFail: false, reasons };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function pct(n: number): string {
  return `%${Math.round(n * 100)}`;
}

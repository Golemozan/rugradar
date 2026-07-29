import type {
  SafetySignals,
  ScoreResult,
  ScoreBreakdown,
  ScoringConfig,
} from "./types.js";
import { DEFAULT_SCORING_CONFIG } from "./types.js";

// v2 agirliklar (toplam 100).
// v1'e gore: likidite BUYUKLUGU puanlanir, dagilim top-10'u da sayar,
// organiklik alis/satis dengesini icerir, olgunluk yeni faktor.
const WEIGHTS = {
  liquidity: 22,   // kilit (%60) + derinlik (%40)
  authority: 15,
  distribution: 20, // top-1 (%60) + top-10 (%40)
  honeypot: 22,     // gercek satis rotasi testi
  organic: 13,      // hacim/likidite (%50) + alis-satis dengesi (%50)
  maturity: 8,      // havuz yasi (%60) + FDV/likidite makullugu (%40)
} as const;

// Likidite derinligi log olcekte puanlanir: $2k taban, $500k tavan.
// Memecoin'de $5k ile $50k arasindaki fark, $500k ile $5M arasindakinden onemli.
const LIQ_FLOOR_USD = 2_000;
const LIQ_CEIL_USD = 500_000;

// Likidite rakami olmayan (pumpfun) coinlerde wash esigi: 1sa hacim / FDV.
// ILK KALIBRASYON — kucuk ornekten turetildi (saglikli pumpswap ornegi 0.3x,
// supheli pumpfun'lar 8-18x). Canli veri biriktikce gozden gecirilmeli.
const WASH_FDV_RATIO = 15;

// Saf fonksiyon: I/O yok, sadece SafetySignals -> ScoreResult.
// Test edilebilir cekirdek. Poller/DB/Telegram bunu cagirir.
export function scorePool(
  s: SafetySignals,
  cfg: ScoringConfig = DEFAULT_SCORING_CONFIG
): ScoreResult {
  const reasons: string[] = [];
  const confidence = computeConfidence(s);

  // ================= HARD GATE'LER =================
  // Bunlardan biri tetiklenirse skor 0 ve alert ATILMAZ. Elegin ilk katmani:
  // "bu coin degerlendirmeye bile deger mi".
  const gate = hardGate(s, cfg);
  if (gate) {
    return {
      score: 0,
      breakdown: zeroBreakdown(),
      hardFail: true,
      confidence,
      reasons: [gate],
    };
  }

  const b = zeroBreakdown();

  // --- Likidite: kilit (%60) + derinlik (%40) ---
  {
    let lockF = 0;
    if (s.liquidityLocked === true) {
      lockF = s.liquidityLockPct != null ? clamp01(s.liquidityLockPct) : 0.8;
      reasons.push(`Likidite kilitli (${pct(s.liquidityLockPct ?? 0.8)})`);
    } else if (s.liquidityLocked === false) {
      lockF = 0;
      reasons.push("Likidite KILITSIZ — cekilebilir");
    } else {
      lockF = 0; // bilinmiyor -> guvenli tarafta sifir
      reasons.push("Likidite kilidi bilinmiyor");
    }

    let depthF = 0;
    if (s.liquidityUsd != null && s.liquidityUsd > 0) {
      depthF = logScale(s.liquidityUsd, LIQ_FLOOR_USD, LIQ_CEIL_USD);
      reasons.push(`Likidite ${usd(s.liquidityUsd)} (derinlik ${pct(depthF)})`);
    } else if (s.sellPriceImpactPct != null) {
      // Likidite rakami yok (pumpfun bonding curve). Ama $100'luk satisin fiyat
      // etkisi derinligin DOGRUDAN olcumu — bildirilmis bir rakamdan daha durust.
      depthF = clamp01(1 - s.sellPriceImpactPct / 0.15);
      reasons.push(
        `Likidite rakami yok — satis etkisinden olculdu (${pct(s.sellPriceImpactPct)} etki)`
      );
    } else {
      reasons.push("Likidite olculemedi");
    }

    b.liquidity = round((lockF * 0.6 + depthF * 0.4) * WEIGHTS.liquidity);
  }

  // --- Yetki: renounce (EVM) + mint/freeze authority (Solana) ---
  {
    let f = 1;
    const parts: string[] = [];
    if (s.ownershipRenounced === false) { f -= 0.6; parts.push("owner renounce DEGIL"); }
    else if (s.ownershipRenounced === true) { parts.push("owner renounce"); }
    if (s.mintAuthorityActive === true) { f -= 0.5; parts.push("mint authority ACIK — sinirsiz basim"); }
    if (s.freezeAuthorityActive === true) { f -= 0.5; parts.push("freeze authority ACIK — cuzdan dondurulabilir"); }
    if (
      s.ownershipRenounced == null &&
      s.mintAuthorityActive == null &&
      s.freezeAuthorityActive == null
    ) {
      f = 0; parts.push("yetki bilgisi yok");
    }
    f = clamp01(f);
    if (parts.length) reasons.push("Yetki: " + parts.join(", "));
    b.authority = round(f * WEIGHTS.authority);
  }

  // --- Dagilim: top-1 (%60) + top-10 (%40) ---
  // v1 sadece top-1'e bakiyordu: 10 cuzdan %8'er tutunca (toplam %80)
  // dagilim tam puan aliyordu. Bundle/sniper kalibi tam olarak buydu.
  {
    let topF = 0;
    if (s.topHolderPct == null) {
      reasons.push("Top holder bilinmiyor");
    } else {
      topF = clamp01(1 - s.topHolderPct / 0.5); // %0 -> 1.0, %50+ -> 0
      reasons.push(`En buyuk cuzdan ${pct(s.topHolderPct)}`);
    }

    let top10F = 0;
    if (s.top10HolderPct == null) {
      reasons.push("Ilk 10 cuzdan bilinmiyor");
    } else {
      // %20 toplam -> 1.0, %80+ -> 0. Aradaki bant lineer.
      top10F = clamp01((0.8 - s.top10HolderPct) / 0.6);
      reasons.push(`Ilk 10 cuzdan toplam ${pct(s.top10HolderPct)}`);
    }

    if (s.holderCount != null) {
      reasons.push(`${s.holderCount} holder`);
    }

    b.distribution = round((topF * 0.6 + top10F * 0.4) * WEIGHTS.distribution);
  }

  // --- Satis testi: gercek Jupiter rota simulasyonu ---
  // v1'de bu deger HER ZAMAN "unknown" idi ve 0.5 katsayi aliyordu -> her coine
  // bedava 10 puan. Artik unknown 0.3'e dusuruldu: bilmemek odul degil.
  {
    let f: number;
    if (s.honeypot === "pass") {
      f = 1;
      const imp = s.sellPriceImpactPct;
      if (imp != null && imp > 0.15) {
        f = 0.7; // rota var ama cikis pahali
        reasons.push(`Satis rotasi var ama fiyat etkisi yuksek (${pct(imp)}) — cikis pahali`);
      } else if (imp != null) {
        reasons.push(`Satis testi PASS (fiyat etkisi ${pct(imp)})`);
      } else {
        reasons.push("Satis testi PASS");
      }
    } else {
      f = 0.3;
      reasons.push("Satis testi dogrulanamadi — rota bulunamadi");
    }
    b.honeypot = round(f * WEIGHTS.honeypot);
  }

  // --- Organiklik: hacim/likidite (%50) + alis-satis dengesi (%50) ---
  {
    let volF = 0.5; // olcemedigimizde notr
    if (s.volumeUsd5m != null && s.liquidityUsd != null && s.liquidityUsd > 0) {
      const ratio = s.volumeUsd5m / s.liquidityUsd;
      // saglikli bant ~0.02..2. Cok dusuk = olu, cok yuksek = wash.
      if (ratio < 0.02) { volF = 0.3; reasons.push("Hacim cok dusuk (olu havuz)"); }
      else if (ratio > 5) { volF = 0.1; reasons.push(`Hacim/likidite asiri (${ratio.toFixed(1)}x) — wash suphesi`); }
      else if (ratio > 2) { volF = 0.6; reasons.push(`Hacim/likidite yuksek (${ratio.toFixed(1)}x)`); }
      else { volF = 1; reasons.push(`Hacim/likidite saglikli (${ratio.toFixed(2)}x)`); }
    } else if (s.volumeUsd1h != null && s.fdvUsd != null && s.fdvUsd > 0) {
      // Likidite rakami yok (pumpfun) ama hacim ve FDV VAR. Eskiden burada
      // notr 0.5 veriliyordu — yani wash kontrolu pumpfun'da hic calismiyordu.
      // FDV'yi payda olarak kullaniyoruz: bonding curve'de egri derinligi
      // degerlemeyle birlikte buyur, oran churn'un makul bir vekili.
      // 5dk yerine 1sa: bonding curve'de 5dk penceresi cok gurultulu.
      const ratio = s.volumeUsd1h / s.fdvUsd;
      if (ratio < 0.05) { volF = 0.3; reasons.push(`Hacim/FDV ${ratio.toFixed(2)}x — olu`); }
      else if (ratio > WASH_FDV_RATIO) { volF = 0.15; reasons.push(`Hacim/FDV ${ratio.toFixed(1)}x — wash/churn suphesi`); }
      else if (ratio > 5) { volF = 0.5; reasons.push(`Hacim/FDV ${ratio.toFixed(1)}x — yuksek`); }
      else { volF = 1; reasons.push(`Hacim/FDV ${ratio.toFixed(2)}x — makul`); }
    } else if (s.liquidityUsd == null) {
      reasons.push("Likidite rakami yok — hacim orani hesaplanamadi");
    } else {
      reasons.push("Hacim verisi yok");
    }

    let txF = 0.5;
    const buys = s.buys1h;
    const sells = s.sells1h;
    if (buys != null && sells != null && buys + sells > 0) {
      const sellShare = sells / (buys + sells);
      if (sellShare >= 0.3 && sellShare <= 0.7) {
        txF = 1;
        reasons.push(`Alis/satis dengeli (${buys}/${sells}, 1sa)`);
      } else if (sellShare >= 0.15 && sellShare <= 0.85) {
        txF = 0.6;
        reasons.push(`Alis/satis dengesiz (${buys}/${sells}, 1sa)`);
      } else {
        txF = 0.25;
        reasons.push(`Alis/satis cok dengesiz (${buys}/${sells}, 1sa)`);
      }
    } else {
      reasons.push("Alis/satis verisi yok");
    }

    b.organic = round((volF * 0.5 + txF * 0.5) * WEIGHTS.organic);
  }

  // --- Olgunluk: havuz yasi (%60) + FDV/likidite makullugu (%40) ---
  {
    let ageF = 0.5;
    if (s.pairCreatedAt != null && s.pairCreatedAt > 0) {
      const ageMin = (Date.now() - s.pairCreatedAt) / 60_000;
      if (ageMin < 15) { ageF = 0.2; reasons.push(`Havuz ${Math.max(0, Math.round(ageMin))} dk — cok taze, veri oturmamis`); }
      else if (ageMin < 60) { ageF = 0.5; reasons.push(`Havuz ${Math.round(ageMin)} dk`); }
      else if (ageMin < 360) { ageF = 0.8; reasons.push(`Havuz ${(ageMin / 60).toFixed(1)} saat`); }
      else { ageF = 1; reasons.push(`Havuz ${(ageMin / 60 / 24).toFixed(1)} gun`); }
    } else {
      reasons.push("Havuz yasi bilinmiyor");
    }

    let fdvF = 0.5;
    if (s.fdvUsd != null && s.liquidityUsd != null && s.liquidityUsd > 0) {
      const r = s.fdvUsd / s.liquidityUsd;
      if (r <= 50) { fdvF = 1; reasons.push(`FDV/likidite ${r.toFixed(0)}x — makul`); }
      else if (r <= 150) { fdvF = 0.6; reasons.push(`FDV/likidite ${r.toFixed(0)}x — yuksek`); }
      else { fdvF = 0.2; reasons.push(`FDV/likidite ${r.toFixed(0)}x — sisirilmis degerleme`); }
    }

    b.maturity = round((ageF * 0.6 + fdvF * 0.4) * WEIGHTS.maturity);
  }

  let score = round(
    b.liquidity + b.authority + b.distribution + b.honeypot + b.organic + b.maturity
  );

  // ================= TAVANLAR =================
  // Puan toplandiktan sonra uygulanir: tek bir agir kirmizi bayrak,
  // diger faktorlerin yuksek puanini gecersiz kilar.

  // "Rug dugmeleri" — her biri projeyi tek hamlede oldurebilir. $150k likidite ve
  // 1200 holder, mint authority ACIK oldugu gercegini telafi etmez.
  if (s.freezeAuthorityActive === true && score > cfg.freezeAuthorityCapScore) {
    reasons.push(`Freeze authority acik — skor ${toScore(cfg.freezeAuthorityCapScore)} kapatildi`);
    score = cfg.freezeAuthorityCapScore;
  }
  if (s.mintAuthorityActive === true && score > cfg.mintAuthorityCapScore) {
    reasons.push(`Mint authority acik — skor ${toScore(cfg.mintAuthorityCapScore)} kapatildi`);
    score = cfg.mintAuthorityCapScore;
  }
  if (s.liquidityLocked === false && score > cfg.unlockedLpCapScore) {
    reasons.push(`Likidite kilitsiz — skor ${toScore(cfg.unlockedLpCapScore)} kapatildi`);
    score = cfg.unlockedLpCapScore;
  }

  // Likidite rakami dogrulanamadi (pumpfun bonding curve): satis testi gecse bile
  // tam puan verilmez — olculen sey rota, havuzun kalinligi degil.
  if (s.liquidityUsd == null && score > cfg.unverifiedLiquidityCapScore) {
    reasons.push(
      `Likidite dogrulanamadi — skor ${toScore(cfg.unverifiedLiquidityCapScore)} kapatildi`
    );
    score = cfg.unverifiedLiquidityCapScore;
  }

  if (s.topHolderPct != null && s.topHolderPct > cfg.topHolderCapPct && score > cfg.topHolderCapScore) {
    reasons.push(`Tek cuzdan >${pct(cfg.topHolderCapPct)} — skor ${toScore(cfg.topHolderCapScore)} kapatildi`);
    score = cfg.topHolderCapScore;
  }
  if (s.top10HolderPct != null && s.top10HolderPct > cfg.top10CapPct && score > cfg.top10CapScore) {
    reasons.push(`Ilk 10 cuzdan >${pct(cfg.top10CapPct)} — skor ${toScore(cfg.top10CapScore)} kapatildi`);
    score = cfg.top10CapScore;
  }
  // Bilmemek temiz olmak degildir: veri cogunlukla cozulemediyse skor tavanlanir.
  if (confidence < cfg.minConfidence && score > cfg.lowConfidenceCapScore) {
    reasons.push(
      `Veri guveni dusuk (${pct(confidence)}) — skor ${toScore(cfg.lowConfidenceCapScore)} kapatildi`
    );
    score = cfg.lowConfidenceCapScore;
  }

  return { score, breakdown: b, hardFail: false, confidence, reasons };
}

// Hard gate: tetiklenirse skor 0, alert yok. Sebep metni doner, temizse null.
function hardGate(s: SafetySignals, cfg: ScoringConfig): string | null {
  if (s.honeypot === "fail") {
    return "HONEYPOT: satis rotasi yok ama alis var — alert atilmaz";
  }
  // Likidite esigi: cikamayacagin havuza girmenin anlami yok.
  if (s.liquidityUsd != null && s.liquidityUsd < cfg.minLiquidityUsd) {
    return `Likidite ${usd(s.liquidityUsd)} < ${usd(cfg.minLiquidityUsd)} esigi — cikis yok`;
  }
  // Likidite rakami YOK ve satis testi de gecmedi -> cikis konusunda elimizde
  // hicbir kanit yok. Ikisinden en az biri olmali.
  if (s.liquidityUsd == null && s.honeypot !== "pass") {
    return "Ne likidite rakami ne gecerli satis rotasi var — cikis dogrulanamadi";
  }
  // Sisirilmis degerleme: FDV likiditenin bu kadar ustundeyse satis fiyati cokertir.
  if (
    s.fdvUsd != null &&
    s.liquidityUsd != null &&
    s.liquidityUsd > 0 &&
    s.fdvUsd / s.liquidityUsd > cfg.maxFdvLiqRatio
  ) {
    return `FDV/likidite ${(s.fdvUsd / s.liquidityUsd).toFixed(0)}x — cikis likiditesi yok`;
  }
  // Cok alis, sifir satis: honeypot'un en durust davranissal imzasi.
  if (s.buys1h != null && s.sells1h === 0 && s.buys1h >= cfg.noSellMinBuys) {
    return `1 saatte ${s.buys1h} alis, 0 satis — honeypot supheli`;
  }
  return null;
}

// Kritik sinyallerin kaci gercekten cozuldu? 0..1.
// Amac: API 404 verdiginde "bilmiyoruz"un "temiz"le ayni puani almasini engellemek.
function computeConfidence(s: SafetySignals): number {
  const checks: boolean[] = [
    s.liquidityLocked != null,
    s.liquidityUsd != null,
    s.mintAuthorityActive != null || s.ownershipRenounced != null,
    s.topHolderPct != null,
    s.top10HolderPct != null,
    s.honeypot !== "unknown",
    s.buys1h != null && s.sells1h != null,
    s.pairCreatedAt != null,
  ];
  const resolved = checks.filter(Boolean).length;
  return round(resolved / checks.length);
}

function zeroBreakdown(): ScoreBreakdown {
  return { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0, maturity: 0 };
}

// x'i [lo, hi] arasinda logaritmik olarak 0..1'e esler.
function logScale(x: number, lo: number, hi: number): number {
  if (x <= lo) return 0;
  if (x >= hi) return 1;
  return clamp01((Math.log10(x) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)));
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

// Turkce yonelme eki (-a/-e/-ya/-ye) sayinin OKUNUSUNA gore degisir:
// 30'a ama 35'e, 50'ye ama 45'e. Sabit 'a yazmak metni bozuyordu.
// "35" -> "35'e", "50" -> "50'ye", "30" -> "30'a"
function toScore(n: number): string {
  const last = n % 10;
  // Tam onluklar okunusuna gore: yuz'e on'a yirmi'ye otuz'a kirk'a elli'ye
  //                              altmis'a yetmis'e seksen'e doksan'a
  const tens = ["e", "a", "ye", "a", "a", "ye", "a", "e", "e", "a"];
  // Birler: bir'e iki'ye uc'e dort'e bes'e alti'ya yedi'ye sekiz'e dokuz'a
  const ones = ["", "e", "ye", "e", "e", "e", "ya", "ye", "e", "a"];
  const suffix = last === 0 ? tens[(n / 10) % 10] : ones[last];
  return `${n}'${suffix}`;
}
function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

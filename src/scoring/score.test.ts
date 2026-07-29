import { test } from "node:test";
import assert from "node:assert/strict";
import { scorePool } from "./score.js";
import type { SafetySignals } from "./types.js";

const base: SafetySignals = {
  chain: "solana",
  liquidityLocked: null,
  liquidityLockPct: null,
  liquidityUsd: null,
  ownershipRenounced: null,
  mintAuthorityActive: null,
  freezeAuthorityActive: null,
  topHolderPct: null,
  top10HolderPct: null,
  holderCount: null,
  honeypot: "unknown",
  sellPriceImpactPct: null,
  volumeUsd5m: null,
  volumeUsd1h: null,
  buys1h: null,
  sells1h: null,
  pairCreatedAt: null,
  fdvUsd: null,
};

// Her sinyali cozulmus, saglam bir coin. Tum faktorler yesil.
const good: SafetySignals = {
  ...base,
  liquidityLocked: true,
  liquidityLockPct: 1,
  liquidityUsd: 150_000,
  mintAuthorityActive: false,
  freezeAuthorityActive: false,
  ownershipRenounced: true,
  topHolderPct: 0.04,
  top10HolderPct: 0.18,
  holderCount: 1200,
  honeypot: "pass",
  sellPriceImpactPct: 0.01,
  volumeUsd5m: 20_000,
  volumeUsd1h: 90_000,
  buys1h: 120,
  sells1h: 95,
  pairCreatedAt: Date.now() - 8 * 60 * 60 * 1000, // 8 saat
  fdvUsd: 3_000_000,
};

test("saglam coin yuksek skor alir", () => {
  const r = scorePool(good);
  assert.equal(r.hardFail, false);
  assert.ok(r.score >= 85, `beklenen >=85, gelen ${r.score}`);
  assert.ok(r.confidence >= 0.9, `guven yuksek olmali, gelen ${r.confidence}`);
});

test("honeypot hard-fail eder", () => {
  const r = scorePool({ ...good, honeypot: "fail" });
  assert.equal(r.score, 0);
  assert.equal(r.hardFail, true);
});

// v1'in en buyuk deligi: likidite BUYUKLUGU puanlanmiyordu.
test("esik alti likidite hard-fail eder", () => {
  const r = scorePool({ ...good, liquidityUsd: 900 });
  assert.equal(r.score, 0);
  assert.equal(r.hardFail, true);
  assert.match(r.reasons.join(" "), /Likidite/);
});

test("likidite derinligi skoru ayristirir", () => {
  const shallow = scorePool({ ...good, liquidityUsd: 6_000, fdvUsd: 60_000 });
  const deep = scorePool({ ...good, liquidityUsd: 400_000, fdvUsd: 4_000_000 });
  assert.ok(
    deep.score > shallow.score,
    `derin havuz daha yuksek olmali: ${deep.score} vs ${shallow.score}`
  );
});

test("sisirilmis FDV/likidite hard-fail eder", () => {
  const r = scorePool({ ...good, liquidityUsd: 8_000, fdvUsd: 20_000_000 });
  assert.equal(r.hardFail, true);
  assert.match(r.reasons.join(" "), /FDV/);
});

// Davranissal honeypot imzasi: cok alis, sifir satis.
test("cok alis sifir satis hard-fail eder", () => {
  const r = scorePool({ ...good, buys1h: 40, sells1h: 0 });
  assert.equal(r.hardFail, true);
  assert.match(r.reasons.join(" "), /honeypot supheli/);
});

test("tek cuzdan >%20 skoru kapatir", () => {
  const r = scorePool({ ...good, topHolderPct: 0.45, top10HolderPct: 0.5 });
  assert.ok(r.score <= 30, `tavan 30 beklenir, gelen ${r.score}`);
});

// v1 bunu KACIRIYORDU: 10 cuzdan %7'ser tutunca top-1 dusuk kalip tam puan aliyordu.
test("dagilmis bundle (top-1 dusuk, top-10 yuksek) yakalanir", () => {
  const bundled = scorePool({ ...good, topHolderPct: 0.07, top10HolderPct: 0.68 });
  assert.ok(
    bundled.score <= 35,
    `top-10 tavani 35 beklenir, gelen ${bundled.score}`
  );
  assert.ok(bundled.score < scorePool(good).score);
});

// "Rug dugmesi" tavanlari: geri kalan her sey mukemmel olsa bile tek bayrak yeter.
test("tek basina mint authority skoru tavanlar", () => {
  const r = scorePool({ ...good, mintAuthorityActive: true });
  assert.ok(r.score <= 45, `mint tavani 45, gelen ${r.score}`);
  assert.match(r.reasons.join(" "), /Mint authority acik/);
});

test("freeze authority en agir tavani uygular", () => {
  const r = scorePool({ ...good, freezeAuthorityActive: true });
  assert.ok(r.score <= 35, `freeze tavani 35, gelen ${r.score}`);
});

test("kilitsiz likidite skoru tavanlar", () => {
  const r = scorePool({ ...good, liquidityLocked: false, liquidityLockPct: null });
  assert.ok(r.score <= 50, `kilitsiz LP tavani 50, gelen ${r.score}`);
});

// pumpfun bonding curve: DexScreener likidite alanini VERMEZ.
// Satis testi gecse bile tam puan alamamali; hic kanit yoksa elenmeli.
test("dogrulanmamis likidite (pumpfun) tavanlanir", () => {
  const r = scorePool({ ...good, liquidityUsd: null, fdvUsd: null });
  assert.equal(r.hardFail, false, "satis testi gectigi icin elenmemeli");
  assert.ok(r.score <= 75, `dogrulanmamis likidite tavani 75, gelen ${r.score}`);
  assert.ok(r.score < scorePool(good).score, "dogrulanmis likiditeden dusuk kalmali");
  assert.match(r.reasons.join(" "), /Likidite dogrulanamadi/);
});

test("likidite yok + satis testi gecmedi -> elenir", () => {
  const r = scorePool({
    ...good,
    liquidityUsd: null,
    fdvUsd: null,
    honeypot: "unknown",
    sellPriceImpactPct: null,
  });
  assert.equal(r.hardFail, true);
  assert.match(r.reasons.join(" "), /cikis dogrulanamadi/);
});

test("likidite yoksa derinlik satis etkisinden olculur", () => {
  const thin = scorePool({ ...good, liquidityUsd: null, fdvUsd: null, sellPriceImpactPct: 0.12 });
  const deep = scorePool({ ...good, liquidityUsd: null, fdvUsd: null, sellPriceImpactPct: 0.005 });
  // Nihai skor ikisinde de 65 tavanina vurur; olculen mekanizma likidite kirilimi.
  assert.ok(
    deep.breakdown.liquidity > thin.breakdown.liquidity,
    `dusuk fiyat etkisi daha derin sayilmali: ${deep.breakdown.liquidity} vs ${thin.breakdown.liquidity}`
  );
});

// Likidite rakami olmayan pumpfun coinlerinde wash kontrolu eskiden HIC
// calismiyordu (notr 0.5). Artik FDV payda olarak kullaniliyor.
test("likidite yokken wash kontrolu FDV uzerinden calisir", () => {
  const pumpfun = { ...good, liquidityUsd: null, volumeUsd5m: null };
  const saglikli = scorePool({ ...pumpfun, volumeUsd1h: 15_000, fdvUsd: 50_000 }); // 0.3x
  const wash = scorePool({ ...pumpfun, volumeUsd1h: 49_000, fdvUsd: 2_700 }); // 18x
  assert.ok(
    wash.breakdown.organic < saglikli.breakdown.organic,
    `wash daha dusuk organik almali: ${wash.breakdown.organic} vs ${saglikli.breakdown.organic}`
  );
  assert.match(wash.reasons.join(" "), /wash\/churn suphesi/);
  assert.match(saglikli.reasons.join(" "), /Hacim\/FDV .* makul/);
});

// Yaniltici mesaj: hacim VARDI, eksik olan likiditeydi.
test("eksik veri mesaji hangi alanin eksik oldugunu soyler", () => {
  const r = scorePool({ ...good, liquidityUsd: null, volumeUsd5m: null, volumeUsd1h: null, fdvUsd: null });
  assert.match(r.reasons.join(" "), /Likidite rakami yok — hacim orani hesaplanamadi/);
});

test("supheli coin dusuk skor alir", () => {
  const bad: SafetySignals = {
    ...good,
    liquidityLocked: false,
    liquidityLockPct: null,
    mintAuthorityActive: true,
    freezeAuthorityActive: true,
    honeypot: "unknown",
    sellPriceImpactPct: null,
  };
  const r = scorePool(bad);
  assert.ok(r.score < 40, `beklenen <40, gelen ${r.score}`);
});

// Bilmemek odul degildir.
test("bos sinyalde cokmez ve dusuk guvenle tavanlanir", () => {
  const r = scorePool(base);
  assert.equal(typeof r.score, "number");
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(r.confidence < 0.5, `guven dusuk olmali, gelen ${r.confidence}`);
  assert.ok(r.score <= 45, `dusuk guven tavani 45, gelen ${r.score}`);
});

test("unknown satis testi, pass'ten az puan alir", () => {
  const unknown = scorePool({ ...good, honeypot: "unknown", sellPriceImpactPct: null });
  assert.ok(
    unknown.score < scorePool(good).score,
    "dogrulanmamis satis testi daha az puan almali"
  );
});

test("pahali cikis (yuksek fiyat etkisi) puani dusurur", () => {
  const costly = scorePool({ ...good, sellPriceImpactPct: 0.4 });
  assert.ok(costly.score < scorePool(good).score);
  assert.match(costly.reasons.join(" "), /cikis pahali/);
});

// Cok taze havuz: veri henuz oturmamis, olgunluk puani dusuk.
test("cok taze havuz olgunluk puanini dusurur", () => {
  const fresh = scorePool({ ...good, pairCreatedAt: Date.now() - 3 * 60 * 1000 });
  assert.ok(fresh.breakdown.maturity < scorePool(good).breakdown.maturity);
});

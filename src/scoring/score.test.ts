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
  honeypot: "unknown",
  volumeUsd5m: null,
};

// Iyi coin: kilitli likidite, mint/freeze kapali, dagilim saglikli, satis pass.
test("saglam coin yuksek skor alir", () => {
  const good: SafetySignals = {
    ...base,
    liquidityLocked: true,
    liquidityLockPct: 1,
    liquidityUsd: 100_000,
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    ownershipRenounced: true,
    topHolderPct: 0.05,
    honeypot: "pass",
    volumeUsd5m: 20_000,
  };
  const r = scorePool(good);
  assert.equal(r.hardFail, false);
  assert.ok(r.score >= 85, `beklenen >=85, gelen ${r.score}`);
});

// Honeypot: satamiyorsan skor 0 + hardFail.
test("honeypot hard-fail eder", () => {
  const r = scorePool({ ...base, honeypot: "fail", liquidityLocked: true, liquidityLockPct: 1 });
  assert.equal(r.score, 0);
  assert.equal(r.hardFail, true);
});

// Tek cuzdan cok tutuyor -> skor tavana kapanir.
test("top holder >%20 skoru kapatir", () => {
  const r = scorePool({
    ...base,
    liquidityLocked: true,
    liquidityLockPct: 1,
    mintAuthorityActive: false,
    freezeAuthorityActive: false,
    honeypot: "pass",
    liquidityUsd: 50_000,
    volumeUsd5m: 10_000,
    topHolderPct: 0.45,
  });
  assert.ok(r.score <= 30, `tavan 30 beklenir, gelen ${r.score}`);
});

// Kilitsiz + mint acik + bilinmeyen dagilim -> dusuk skor.
test("supheli coin dusuk skor alir", () => {
  const bad: SafetySignals = {
    ...base,
    liquidityLocked: false,
    mintAuthorityActive: true,
    freezeAuthorityActive: true,
    honeypot: "unknown",
  };
  const r = scorePool(bad);
  assert.ok(r.score < 40, `beklenen <40, gelen ${r.score}`);
});

// Hicbir veri yoksa cokmemeli, dusuk-orta skor.
test("bos sinyalde cokmez", () => {
  const r = scorePool(base);
  assert.equal(typeof r.score, "number");
  assert.ok(r.score >= 0 && r.score <= 100);
});

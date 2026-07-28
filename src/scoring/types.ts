// Tum chain'lerin guvenlik API'leri bu ortak sekle normalize edilir.
// RugCheck (Solana) ve GoPlus (EVM) ciktilari buraya map'lenir -> skorlayici
// chain'den habersiz calisir.
export interface SafetySignals {
  chain: "solana" | "ethereum" | "bsc";

  // --- Likidite ---
  liquidityLocked: boolean | null;   // LP kilitli/burn mu
  liquidityLockPct: number | null;   // kilitli LP orani 0..1
  liquidityUsd: number | null;       // toplam likidite $ (BUYUKLUK — v2'de puanlanir)

  // --- Kontrol/yetki ---
  ownershipRenounced: boolean | null;    // owner renounce mu (EVM)
  mintAuthorityActive: boolean | null;   // Solana: mint authority hala acik mi
  freezeAuthorityActive: boolean | null; // Solana: freeze authority acik mi

  // --- Dagilim ---
  topHolderPct: number | null;   // en buyuk LP-disi holder orani 0..1
  top10HolderPct: number | null; // ilk 10 LP-disi holder TOPLAMI 0..1
  holderCount: number | null;    // toplam holder sayisi

  // --- Satis testi ---
  honeypot: "pass" | "fail" | "unknown"; // satabiliyor muyuz (Jupiter rota testi)
  sellPriceImpactPct: number | null;     // $100 satista fiyat etkisi 0..1

  // --- Organiklik ---
  volumeUsd5m: number | null;
  volumeUsd1h: number | null;
  buys1h: number | null;
  sells1h: number | null;

  // --- Olgunluk / degerleme ---
  pairCreatedAt: number | null; // ms epoch — havuz ne zaman acildi
  fdvUsd: number | null;        // tam seyreltilmis degerleme $
}

export interface ScoreBreakdown {
  liquidity: number;
  authority: number;
  distribution: number;
  honeypot: number;
  organic: number;
  maturity: number;
}

export interface ScoreResult {
  score: number;              // 0..100
  breakdown: ScoreBreakdown;  // faktor bazli katki
  hardFail: boolean;          // honeypot/likidite gate — alert ATILMAZ
  confidence: number;         // 0..1 — kritik sinyallerin kaci gercekten cozuldu
  reasons: string[];          // insan-okur aciklama (Telegram/dashboard)
}

// Esikler tek yerde ve ayarlanabilir. scan.ts env'den override eder,
// testler sabit deger gecer -> skorlama saf ve deterministik kalir.
export interface ScoringConfig {
  minLiquidityUsd: number;    // bunun altinda hard gate (cikis yok)
  maxFdvLiqRatio: number;     // FDV/likidite bunun ustunde hard gate
  topHolderCapPct: number;    // tek cuzdan bu orani gecerse skor tavani
  topHolderCapScore: number;
  top10CapPct: number;        // ilk 10 toplami bu orani gecerse skor tavani
  top10CapScore: number;
  noSellMinBuys: number;      // bu kadar alista 0 satis varsa honeypot supheli
  minConfidence: number;      // bunun altinda skor tavani (bilmiyoruz != temiz)
  lowConfidenceCapScore: number;

  // "Rug dugmesi" tavanlari: her biri tek basina projeyi bir anda oldurebilir,
  // o yuzden puani sifirlamak yetmez — diger faktorlerin yuksek puani bunlari
  // ortmesin diye TAVAN uygulanir.
  mintAuthorityCapScore: number;   // dev sinirsiz basim yapabilir
  freezeAuthorityCapScore: number; // dev cuzdanini dondurabilir = satisi kapatabilir
  unlockedLpCapScore: number;      // likidite her an cekilebilir

  // DexScreener pumpfun (bonding curve) pair'lerinde liquidity alanini VERMEZ.
  // Bu coinler olculemez degil — satis simulasyonu calisir — ama bildirilmis bir
  // likidite rakami olmadan tam puan almamalilar.
  unverifiedLiquidityCapScore: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  minLiquidityUsd: 5_000,
  maxFdvLiqRatio: 500,
  topHolderCapPct: 0.2,
  topHolderCapScore: 30,
  top10CapPct: 0.6,
  top10CapScore: 35,
  noSellMinBuys: 15,
  minConfidence: 0.5,
  lowConfidenceCapScore: 45,
  mintAuthorityCapScore: 45,
  freezeAuthorityCapScore: 35, // en agiri: freeze aciksa satis her an kapatilabilir
  unlockedLpCapScore: 50,
  // 75: varsayilan esik 70'in USTUNDE — yani mezun olmamis pump.fun token'lari
  // alert ATABILIR. Ozan'in bilincli risk istahi karari (2026-07-28): bonding
  // curve'deki coinler avlanacak. Muhafazakar mod icin 65'e cek, alert kesilir.
  unverifiedLiquidityCapScore: 75,
};

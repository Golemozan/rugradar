// Tum chain'lerin guvenlik API'leri bu ortak sekle normalize edilir.
// RugCheck (Solana) ve GoPlus (EVM) ciktilari buraya map'lenir -> skorlayici
// chain'den habersiz calisir.
export interface SafetySignals {
  chain: "solana" | "ethereum" | "bsc";

  // Likidite
  liquidityLocked: boolean | null;   // LP kilitli/burn mu
  liquidityLockPct: number | null;   // kilitli LP orani 0..1
  liquidityUsd: number | null;       // toplam likidite $

  // Kontrol/yetki
  ownershipRenounced: boolean | null; // owner renounce mu (EVM)
  mintAuthorityActive: boolean | null; // Solana: mint authority hala acik mi
  freezeAuthorityActive: boolean | null; // Solana: freeze authority acik mi

  // Dagilim
  topHolderPct: number | null;       // en buyuk LP-disi holder orani 0..1

  // Satis testi
  honeypot: "pass" | "fail" | "unknown"; // satabiliyor muyuz

  // Organiklik
  volumeUsd5m: number | null;        // son 5dk hacim $
}

export interface ScoreBreakdown {
  liquidity: number;
  authority: number;
  distribution: number;
  honeypot: number;
  organic: number;
}

export interface ScoreResult {
  score: number;              // 0..100
  breakdown: ScoreBreakdown;  // faktor bazli katki
  hardFail: boolean;          // honeypot vb. -> alert atma
  reasons: string[];          // insan-okur aciklama (Telegram/dashboard)
}

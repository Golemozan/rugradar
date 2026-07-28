import { getJsonStatus } from "./http.js";

// Jupiter Lite API — key GEREKTIRMEZ (canli dogrulandi 2026-07-28).
// Solana'nin en buyuk DEX aggregator'u; bir token'i satabiliyor muyuz sorusunun
// pratikteki tek durust cevabi "Jupiter bize satis rotasi veriyor mu"dur.
const QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";

const WSOL = "So11111111111111111111111111111111111111112";

// Simulasyonun buyuklugu. Cok kucuk tutarsak toz rotalar bile gecer,
// cok buyuk tutarsak saglam ama kucuk token'lar fiyat etkisinden kalir.
const SIM_NOTIONAL_USD = 100;
const SIM_SLIPPAGE_BPS = 500; // %5

export interface SellSimulation {
  result: "pass" | "fail" | "unknown";
  priceImpactPct: number | null; // 0..1 (Jupiter string doner)
  reason: string;
}

interface JupQuote {
  outAmount?: string;
  priceImpactPct?: string;
}

// Token'in kac base-unit'i ~$100 eder?
// decimals veya fiyat yoksa makul bir varsayilana duseriz (rota VAR MI sorusu
// icin tutar zaten kritik degil; kritik olan rotanin varligi).
function simAmount(decimals: number | null, priceUsd: number | null): string {
  if (decimals == null || priceUsd == null || priceUsd <= 0) {
    return "1000000"; // ~1 token @ 6 decimals — sadece rota var mi diye bakariz
  }
  const tokens = SIM_NOTIONAL_USD / priceUsd;
  const raw = tokens * Math.pow(10, decimals);
  // 1 ile 2^53 arasina sikistir (Jupiter tam sayi ister)
  const safe = Math.max(1, Math.min(raw, 9_000_000_000_000_000));
  return Math.floor(safe).toString();
}

async function quote(inputMint: string, outputMint: string, amount: string) {
  const url =
    `${QUOTE_URL}?inputMint=${inputMint}&outputMint=${outputMint}` +
    `&amount=${amount}&slippageBps=${SIM_SLIPPAGE_BPS}`;
  return getJsonStatus<JupQuote>(url, { timeoutMs: 10000, retries: 1 });
}

// "Rota bulunamadi" hatasi mi, baska bir sey mi?
function isNoRoute(errorText: string | null): boolean {
  if (!errorText) return false;
  return /route|not found|no.*liquidity|cannot be parsed/i.test(errorText);
}

// Bu token'i SATABILIYOR muyuz?
//
// Neden cift yonlu: tek basina "satis rotasi yok" honeypot demek DEGILDIR —
// Jupiter token'i henuz indekslememis de olabilir. Ayrimi ancak alis rotasina
// bakarak yapariz:
//   satis VAR                      -> pass
//   satis YOK  + alis VAR          -> FAIL  (klasik honeypot: aliyorsun, satamiyorsun)
//   satis YOK  + alis YOK          -> unknown (Jupiter bilmiyor, biz de bilmiyoruz)
export async function simulateSell(
  mint: string,
  decimals: number | null,
  priceUsd: number | null
): Promise<SellSimulation> {
  if (mint === WSOL) {
    return { result: "pass", priceImpactPct: 0, reason: "SOL — satis testi gereksiz" };
  }

  const amount = simAmount(decimals, priceUsd);
  const sell = await quote(mint, WSOL, amount);

  if (sell.data?.outAmount && Number(sell.data.outAmount) > 0) {
    const impact = sell.data.priceImpactPct != null ? Number(sell.data.priceImpactPct) : null;
    const impactOk = impact == null || Number.isNaN(impact) ? null : impact;
    return {
      result: "pass",
      priceImpactPct: impactOk,
      reason:
        impactOk != null
          ? `Satis rotasi var (fiyat etkisi %${(impactOk * 100).toFixed(2)})`
          : "Satis rotasi var",
    };
  }

  // Satis rotasi yok. Alis deneyerek honeypot mu, indekssiz mi ayir.
  if (sell.status === 400 && isNoRoute(sell.errorText)) {
    const buy = await quote(WSOL, mint, "100000000"); // 0.1 SOL
    if (buy.data?.outAmount && Number(buy.data.outAmount) > 0) {
      return {
        result: "fail",
        priceImpactPct: null,
        reason: "HONEYPOT: alis rotasi var ama SATIS rotasi YOK",
      };
    }
    return {
      result: "unknown",
      priceImpactPct: null,
      reason: "Jupiter bu token'i indekslememis (alis da satis da yok)",
    };
  }

  return {
    result: "unknown",
    priceImpactPct: null,
    reason: `Satis testi yapilamadi (${sell.errorText ?? "HTTP " + sell.status})`,
  };
}

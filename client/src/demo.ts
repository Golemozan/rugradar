import type { PoolRow, AlertRow, BinanceListingsResponse } from "./types.ts";

// DEMO MODU — portfolyo vitrini icin.
//
// Panel normalde worker'in Express API'sini tuketir; o da Postgres + Redis +
// surekli calisan bir tarayici ister. Vitrinde bunlarin hicbiri yok, o yuzden
// build sirasinda VITE_DEMO=1 verilirse fetch yerine buradaki sabit veri doner.
//
// Veri TEMSILIDIR, canli tarama degildir — panel bunu ustteki bantta acikca
// yazar. Uydurma sayiyi gercekmis gibi gostermek portfolyonun kendi kuralina
// aykiri olurdu ("yazilan her cumle savunulabilmeli").
export const DEMO = import.meta.env.VITE_DEMO === "1";

// Zamanlar yukleme anina gore uretilir; sabit tarih yazsak panel birkac gun
// sonra "3 ay once tarandi" diyip olu gorunurdu.
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

type Seed = {
  sym: string;
  score: number | null;
  hardFail: boolean;
  liq: number | null;
  conf: number;
  top1: number | null;
  top10: number | null;
  holders: number | null;
  sell: "pass" | "fail" | "unknown";
  impact: number | null;
  buys: number | null;
  sells: number | null;
  fdv: number | null;
  ageMin: number;
  checkedMin: number;
  dex: string;
  reasons: string[];
  bd: Record<string, number>;
};

// Dagilim bilincli: cogu eleniyor. Gercek taramada da oyle — elek ise yarasin
// diye kurulmus, "hepsi guvenli" gosteren bir demo yalan olurdu.
const SEEDS: Seed[] = [
  {
    sym: "POPCAT", score: 84, hardFail: false, liq: 412_000, conf: 0.92,
    top1: 0.041, top10: 0.183, holders: 14820, sell: "pass", impact: 0.008,
    buys: 1240, sells: 1108, fdv: 18_400_000, ageMin: 4320, checkedMin: 2,
    dex: "raydium",
    reasons: [
      "Likidite kilitli (%100)",
      "Likidite $412.0K (derinlik %88)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %4.1",
      "Ilk 10 cuzdan toplam %18.3",
      "14820 holder",
      "Satis testi PASS (fiyat etkisi %0.8)",
      "Hacim/likidite saglikli (1.42x)",
      "Alis/satis dengeli (1240/1108, 1sa)",
      "Havuz 3.0 gun",
      "FDV/likidite 45x — makul",
    ],
    bd: { liquidity: 22, authority: 20, distribution: 16, honeypot: 15, organic: 6, maturity: 5 },
  },
  {
    sym: "MOODENG", score: 79, hardFail: false, liq: 268_500, conf: 0.88,
    top1: 0.052, top10: 0.221, holders: 9340, sell: "pass", impact: 0.014,
    buys: 880, sells: 812, fdv: 12_100_000, ageMin: 2880, checkedMin: 3,
    dex: "raydium",
    reasons: [
      "Likidite kilitli (%100)",
      "Likidite $268.5K (derinlik %79)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %5.2",
      "Ilk 10 cuzdan toplam %22.1",
      "9340 holder",
      "Satis testi PASS (fiyat etkisi %1.4)",
      "Hacim/likidite saglikli (1.18x)",
      "Alis/satis dengeli (880/812, 1sa)",
      "Havuz 2.0 gun",
      "FDV/likidite 45x — makul",
    ],
    bd: { liquidity: 20, authority: 20, distribution: 14, honeypot: 15, organic: 6, maturity: 4 },
  },
  {
    sym: "FWOG", score: 76, hardFail: false, liq: 194_200, conf: 0.85,
    top1: 0.061, top10: 0.248, holders: 6710, sell: "pass", impact: 0.019,
    buys: 640, sells: 705, fdv: 9_800_000, ageMin: 1980, checkedMin: 4,
    dex: "raydium",
    reasons: [
      "Likidite kilitli (%100)",
      "Likidite $194.2K (derinlik %71)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %6.1",
      "Ilk 10 cuzdan toplam %24.8",
      "6710 holder",
      "Satis testi PASS (fiyat etkisi %1.9)",
      "Hacim/likidite saglikli (1.66x)",
      "Alis/satis dengeli (640/705, 1sa)",
      "Havuz 1.4 gun",
      "FDV/likidite 50x — makul",
    ],
    bd: { liquidity: 18, authority: 20, distribution: 13, honeypot: 15, organic: 6, maturity: 4 },
  },
  {
    sym: "GIGA", score: 74, hardFail: false, liq: 158_900, conf: 0.81,
    top1: 0.068, top10: 0.269, holders: 5240, sell: "pass", impact: 0.023,
    buys: 512, sells: 588, fdv: 8_200_000, ageMin: 1440, checkedMin: 5,
    dex: "orca",
    reasons: [
      "Likidite kilitli (%98)",
      "Likidite $158.9K (derinlik %66)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %6.8",
      "Ilk 10 cuzdan toplam %26.9",
      "5240 holder",
      "Satis testi PASS (fiyat etkisi %2.3)",
      "Hacim/likidite saglikli (1.91x)",
      "Alis/satis dengeli (512/588, 1sa)",
      "Havuz 1.0 gun",
      "FDV/likidite 52x — makul",
    ],
    bd: { liquidity: 17, authority: 20, distribution: 12, honeypot: 15, organic: 6, maturity: 4 },
  },
  {
    sym: "PNUT", score: 72, hardFail: false, liq: 141_300, conf: 0.78,
    top1: 0.074, top10: 0.288, holders: 4180, sell: "pass", impact: 0.028,
    buys: 466, sells: 402, fdv: 7_600_000, ageMin: 900, checkedMin: 6,
    dex: "raydium",
    reasons: [
      "Likidite kilitli (%96)",
      "Likidite $141.3K (derinlik %62)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %7.4",
      "Ilk 10 cuzdan toplam %28.8",
      "4180 holder",
      "Satis testi PASS (fiyat etkisi %2.8)",
      "Hacim/likidite yuksek (2.34x)",
      "Alis/satis dengeli (466/402, 1sa)",
      "Havuz 15.0 saat",
      "FDV/likidite 54x — makul",
    ],
    bd: { liquidity: 16, authority: 20, distribution: 11, honeypot: 15, organic: 5, maturity: 5 },
  },
  {
    sym: "CHILLGUY", score: 71, hardFail: false, liq: 128_700, conf: 0.76,
    top1: 0.079, top10: 0.301, holders: 3620, sell: "pass", impact: 0.031,
    buys: 388, sells: 351, fdv: 7_100_000, ageMin: 720, checkedMin: 7,
    dex: "raydium",
    reasons: [
      "Likidite kilitli (%94)",
      "Likidite $128.7K (derinlik %59)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %7.9",
      "Ilk 10 cuzdan toplam %30.1",
      "3620 holder",
      "Satis testi PASS (fiyat etkisi %3.1)",
      "Hacim/likidite yuksek (2.11x)",
      "Alis/satis dengeli (388/351, 1sa)",
      "Havuz 12.0 saat",
      "FDV/likidite 55x — makul",
    ],
    bd: { liquidity: 15, authority: 20, distribution: 10, honeypot: 15, organic: 6, maturity: 5 },
  },
  {
    sym: "SPX", score: 70, hardFail: false, liq: 116_400, conf: 0.74,
    top1: 0.083, top10: 0.312, holders: 3110, sell: "pass", impact: 0.036,
    buys: 322, sells: 344, fdv: 6_400_000, ageMin: 600, checkedMin: 8,
    dex: "orca",
    reasons: [
      "Likidite kilitli (%92)",
      "Likidite $116.4K (derinlik %56)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %8.3",
      "Ilk 10 cuzdan toplam %31.2",
      "3110 holder",
      "Satis testi PASS (fiyat etkisi %3.6)",
      "Hacim/likidite saglikli (1.87x)",
      "Alis/satis dengeli (322/344, 1sa)",
      "Havuz 10.0 saat",
      "FDV/likidite 55x — makul",
    ],
    bd: { liquidity: 14, authority: 20, distribution: 10, honeypot: 15, organic: 6, maturity: 5 },
  },
  {
    sym: "RETARDIO", score: 68, hardFail: false, liq: 98_200, conf: 0.71,
    top1: 0.091, top10: 0.334, holders: 2480, sell: "pass", impact: 0.042,
    buys: 268, sells: 291, fdv: 5_900_000, ageMin: 480, checkedMin: 9,
    dex: "raydium",
    reasons: [
      "Likidite kilitli (%88)",
      "Likidite $98.2K (derinlik %48)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %9.1",
      "Ilk 10 cuzdan toplam %33.4",
      "2480 holder",
      "Satis testi PASS (fiyat etkisi %4.2)",
      "Hacim/likidite saglikli (1.64x)",
      "Alis/satis dengeli (268/291, 1sa)",
      "Havuz 8.0 saat",
      "FDV/likidite 60x — makul",
    ],
    bd: { liquidity: 12, authority: 20, distribution: 9, honeypot: 15, organic: 6, maturity: 6 },
  },
  {
    sym: "MEW", score: 64, hardFail: false, liq: 82_600, conf: 0.68,
    top1: 0.104, top10: 0.362, holders: 1940, sell: "pass", impact: 0.051,
    buys: 214, sells: 268, fdv: 5_100_000, ageMin: 360, checkedMin: 11,
    dex: "raydium",
    reasons: [
      "Likidite kilitli (%82)",
      "Likidite $82.6K (derinlik %41)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %10.4",
      "Ilk 10 cuzdan toplam %36.2",
      "1940 holder",
      "Satis testi PASS (fiyat etkisi %5.1)",
      "Hacim/likidite saglikli (1.38x)",
      "Alis/satis dengesiz (214/268, 1sa)",
      "Havuz 6.0 saat",
      "FDV/likidite 62x — makul",
    ],
    bd: { liquidity: 11, authority: 20, distribution: 7, honeypot: 15, organic: 4, maturity: 7 },
  },
  {
    sym: "WEN", score: 61, hardFail: false, liq: 71_400, conf: 0.64,
    top1: 0.118, top10: 0.391, holders: 1520, sell: "pass", impact: 0.062,
    buys: 168, sells: 224, fdv: 4_600_000, ageMin: 300, checkedMin: 12,
    dex: "orca",
    reasons: [
      "Likidite kilitli (%76)",
      "Likidite $71.4K (derinlik %36)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %11.8",
      "Ilk 10 cuzdan toplam %39.1",
      "1520 holder",
      "Satis testi PASS (fiyat etkisi %6.2)",
      "Hacim/likidite saglikli (1.22x)",
      "Alis/satis dengesiz (168/224, 1sa)",
      "Havuz 5.0 saat",
      "FDV/likidite 64x — makul",
    ],
    bd: { liquidity: 10, authority: 20, distribution: 6, honeypot: 14, organic: 4, maturity: 7 },
  },
  {
    sym: "SLERF", score: 58, hardFail: false, liq: 62_100, conf: 0.61,
    top1: 0.132, top10: 0.418, holders: 1180, sell: "pass", impact: 0.074,
    buys: 142, sells: 198, fdv: 4_200_000, ageMin: 240, checkedMin: 14,
    dex: "raydium",
    reasons: [
      "Likidite kilitli (%71)",
      "Likidite $62.1K (derinlik %31)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %13.2",
      "Ilk 10 cuzdan toplam %41.8",
      "1180 holder",
      "Satis testi PASS (fiyat etkisi %7.4)",
      "Hacim/likidite yuksek (2.28x)",
      "Alis/satis dengesiz (142/198, 1sa)",
      "Havuz 4.0 saat",
      "FDV/likidite 68x — makul",
    ],
    bd: { liquidity: 9, authority: 20, distribution: 5, honeypot: 13, organic: 3, maturity: 8 },
  },
  {
    sym: "MYRO", score: 54, hardFail: false, liq: 48_900, conf: 0.57,
    top1: 0.148, top10: 0.446, holders: 860, sell: "pass", impact: 0.089,
    buys: 98, sells: 164, fdv: 3_800_000, ageMin: 180, checkedMin: 16,
    dex: "raydium",
    reasons: [
      "Likidite kilitli (%64)",
      "Likidite $48.9K (derinlik %24)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %14.8",
      "Ilk 10 cuzdan toplam %44.6",
      "860 holder",
      "Satis testi PASS (fiyat etkisi %8.9)",
      "Hacim/likidite yuksek (2.64x)",
      "Alis/satis dengesiz (98/164, 1sa)",
      "Havuz 3.0 saat",
      "FDV/likidite 78x — yuksek",
    ],
    bd: { liquidity: 7, authority: 20, distribution: 4, honeypot: 12, organic: 3, maturity: 8 },
  },
  {
    sym: "BOME", score: 49, hardFail: false, liq: 38_200, conf: 0.52,
    top1: 0.169, top10: 0.482, holders: 610, sell: "pass", impact: 0.112,
    buys: 74, sells: 141, fdv: 3_400_000, ageMin: 120, checkedMin: 18,
    dex: "orca",
    reasons: [
      "Likidite kilitli (%55)",
      "Likidite $38.2K (derinlik %19)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %16.9",
      "Ilk 10 cuzdan toplam %48.2",
      "610 holder",
      "Satis rotasi var ama fiyat etkisi yuksek (%11.2) — cikis pahali",
      "Hacim/likidite yuksek (2.92x)",
      "Alis/satis cok dengesiz (74/141, 1sa)",
      "Havuz 2.0 saat",
      "FDV/likidite 89x — yuksek",
    ],
    bd: { liquidity: 6, authority: 20, distribution: 3, honeypot: 8, organic: 2, maturity: 10 },
  },
  {
    sym: "GOAT", score: 44, hardFail: false, liq: 29_600, conf: 0.47,
    top1: 0.194, top10: 0.521, holders: 412, sell: "unknown", impact: null,
    buys: 52, sells: 118, fdv: 3_100_000, ageMin: 75, checkedMin: 21,
    dex: "raydium",
    reasons: [
      "Likidite kilitli (%48)",
      "Likidite $29.6K (derinlik %14)",
      "Yetki: mint kapali, freeze kapali",
      "En buyuk cuzdan %19.4",
      "Ilk 10 cuzdan toplam %52.1",
      "412 holder",
      "Satis testi dogrulanamadi — rota bulunamadi",
      "Hacim/likidite yuksek (2.41x)",
      "Alis/satis cok dengesiz (52/118, 1sa)",
      "Havuz 75 dk",
      "FDV/likidite 105x — yuksek",
    ],
    bd: { liquidity: 5, authority: 20, distribution: 2, honeypot: 5, organic: 2, maturity: 10 },
  },
  {
    sym: "ACT", score: 38, hardFail: false, liq: 21_400, conf: 0.41,
    top1: 0.228, top10: 0.574, holders: 268, sell: "unknown", impact: null,
    buys: 38, sells: 96, fdv: 2_900_000, ageMin: 48, checkedMin: 24,
    dex: "orca",
    reasons: [
      "Likidite kilitli (%39)",
      "Likidite $21.4K (derinlik %10)",
      "Yetki: mint kapali, freeze acik",
      "En buyuk cuzdan %22.8",
      "Ilk 10 cuzdan toplam %57.4",
      "268 holder",
      "Satis testi dogrulanamadi — rota bulunamadi",
      "Hacim/likidite yuksek (2.18x)",
      "Alis/satis cok dengesiz (38/96, 1sa)",
      "Havuz 48 dk",
      "FDV/likidite 135x — yuksek",
    ],
    bd: { liquidity: 4, authority: 12, distribution: 1, honeypot: 5, organic: 2, maturity: 14 },
  },
  // ——— Buradan asagisi hardFail: elek bunlari puanlamadan once eliyor ———
  {
    sym: "SAFEMOON2", score: 0, hardFail: true, liq: 14_200, conf: 0.94,
    top1: 0.412, top10: 0.781, holders: 96, sell: "fail", impact: null,
    buys: 214, sells: 3, fdv: 2_600_000, ageMin: 32, checkedMin: 1,
    dex: "raydium",
    reasons: [
      "HARD FAIL — satis testi basarisiz: token satilamiyor (honeypot)",
      "Likidite KILITSIZ — cekilebilir",
      "En buyuk cuzdan %41.2",
      "Ilk 10 cuzdan toplam %78.1",
      "Alis/satis cok dengesiz (214/3, 1sa)",
    ],
    bd: { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0, maturity: 0 },
  },
  {
    sym: "MOONINU", score: 0, hardFail: true, liq: 8_900, conf: 0.91,
    top1: 0.538, top10: 0.864, holders: 41, sell: "fail", impact: null,
    buys: 168, sells: 1, fdv: 4_100_000, ageMin: 18, checkedMin: 2,
    dex: "raydium",
    reasons: [
      "HARD FAIL — satis testi basarisiz: token satilamiyor (honeypot)",
      "Likidite KILITSIZ — cekilebilir",
      "En buyuk cuzdan %53.8",
      "Ilk 10 cuzdan toplam %86.4",
      "Havuz 18 dk — cok taze, veri oturmamis",
    ],
    bd: { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0, maturity: 0 },
  },
  {
    sym: "ELONX100", score: 0, hardFail: true, liq: 6_400, conf: 0.89,
    top1: 0.612, top10: 0.902, holders: 28, sell: "unknown", impact: null,
    buys: 141, sells: 2, fdv: 6_800_000, ageMin: 11, checkedMin: 3,
    dex: "raydium",
    reasons: [
      "HARD FAIL — mint yetkisi ACIK: sahibi sinirsiz token basabilir",
      "Likidite KILITSIZ — cekilebilir",
      "En buyuk cuzdan %61.2",
      "Havuz 11 dk — cok taze, veri oturmamis",
      "FDV/likidite 1062x — sisirilmis degerleme",
    ],
    bd: { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0, maturity: 0 },
  },
  {
    sym: "PEPE3", score: 0, hardFail: true, liq: 11_800, conf: 0.86,
    top1: 0.384, top10: 0.742, holders: 63, sell: "unknown", impact: null,
    buys: 96, sells: 4, fdv: 1_900_000, ageMin: 26, checkedMin: 4,
    dex: "orca",
    reasons: [
      "HARD FAIL — freeze yetkisi ACIK: sahibi cuzdanlari dondurabilir",
      "Likidite kilidi bilinmiyor",
      "En buyuk cuzdan %38.4",
      "Ilk 10 cuzdan toplam %74.2",
      "Alis/satis cok dengesiz (96/4, 1sa)",
    ],
    bd: { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0, maturity: 0 },
  },
  {
    sym: "AIDOGE2", score: 0, hardFail: true, liq: 4_100, conf: 0.83,
    top1: 0.694, top10: 0.951, holders: 17, sell: "fail", impact: null,
    buys: 88, sells: 0, fdv: 3_200_000, ageMin: 7, checkedMin: 5,
    dex: "raydium",
    reasons: [
      "HARD FAIL — satis testi basarisiz: token satilamiyor (honeypot)",
      "HARD FAIL — mint yetkisi ACIK: sahibi sinirsiz token basabilir",
      "En buyuk cuzdan %69.4",
      "Havuz 7 dk — cok taze, veri oturmamis",
    ],
    bd: { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0, maturity: 0 },
  },
  {
    sym: "SOLKING", score: 0, hardFail: true, liq: 19_600, conf: 0.79,
    top1: 0.341, top10: 0.688, holders: 118, sell: "unknown", impact: null,
    buys: 62, sells: 8, fdv: 2_400_000, ageMin: 41, checkedMin: 7,
    dex: "raydium",
    reasons: [
      "HARD FAIL — likidite kilitsiz ve tek cuzdanda toplanmis",
      "Likidite KILITSIZ — cekilebilir",
      "En buyuk cuzdan %34.1",
      "Ilk 10 cuzdan toplam %68.8",
      "Hacim/likidite asiri (7.2x) — wash suphesi",
    ],
    bd: { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0, maturity: 0 },
  },
  {
    sym: "GEMHUNT", score: 0, hardFail: true, liq: 2_800, conf: 0.77,
    top1: 0.821, top10: 0.983, holders: 9, sell: "fail", impact: null,
    buys: 44, sells: 0, fdv: 1_600_000, ageMin: 4, checkedMin: 9,
    dex: "orca",
    reasons: [
      "HARD FAIL — satis testi basarisiz: token satilamiyor (honeypot)",
      "En buyuk cuzdan %82.1",
      "Ilk 10 cuzdan toplam %98.3",
      "Havuz 4 dk — cok taze, veri oturmamis",
      "FDV/likidite 571x — sisirilmis degerleme",
    ],
    bd: { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0, maturity: 0 },
  },
  {
    sym: "TURBOSOL", score: 0, hardFail: true, liq: 7_200, conf: 0.72,
    top1: 0.448, top10: 0.812, holders: 34, sell: "unknown", impact: null,
    buys: 71, sells: 5, fdv: 2_100_000, ageMin: 14, checkedMin: 12,
    dex: "raydium",
    reasons: [
      "HARD FAIL — mint yetkisi ACIK: sahibi sinirsiz token basabilir",
      "Likidite KILITSIZ — cekilebilir",
      "En buyuk cuzdan %44.8",
      "Havuz 14 dk — cok taze, veri oturmamis",
    ],
    bd: { liquidity: 0, authority: 0, distribution: 0, honeypot: 0, organic: 0, maturity: 0 },
  },
  // Skorlanmamis (tarama surerken veri toplanamamis) — panelde "—" gorunur
  {
    sym: "NEWPOOL1", score: null, hardFail: false, liq: null, conf: 0.12,
    top1: null, top10: null, holders: null, sell: "unknown", impact: null,
    buys: null, sells: null, fdv: null, ageMin: 2, checkedMin: 0,
    dex: "raydium", reasons: [], bd: {},
  },
  {
    sym: "NEWPOOL2", score: null, hardFail: false, liq: null, conf: 0.09,
    top1: null, top10: null, holders: null, sell: "unknown", impact: null,
    buys: null, sells: null, fdv: null, ageMin: 1, checkedMin: 0,
    dex: "orca", reasons: [], bd: {},
  },
];

// Sahte ama bicimsel olarak gecerli base58 adres — DexScreener linki demo
// veride bir yere gitmez, gercek adres uydurmak daha yaniltici olurdu.
const fakeAddr = (i: number) =>
  `Demo${String(i).padStart(2, "0")}${"RugRadarDemoPairAddress".slice(0, 32)}`;

function demoPools(): PoolRow[] {
  return SEEDS.map((s, i) => ({
    id: i + 1,
    chain: "solana",
    symbol: s.sym,
    pairAddress: fakeAddr(i + 1),
    dex: s.dex,
    lastCheckedAt: minsAgo(s.checkedMin),
    score: s.score,
    breakdown: Object.keys(s.bd).length ? s.bd : null,
    confidence: s.conf,
    hardFail: s.hardFail,
    reasons: s.reasons,
    liquidityUsd: s.liq,
    topHolderPct: s.top1,
    top10HolderPct: s.top10,
    holderCount: s.holders,
    honeypotResult: s.sell,
    sellPriceImpact: s.impact,
    buys1h: s.buys,
    sells1h: s.sells,
    fdvUsd: s.fdv,
    pairCreatedAt: minsAgo(s.ageMin),
  }));
}

// Alert yalnizca esigi (70) gecenlere gider — demo veri de bu kurala uymali,
// yoksa panel kendi kendiyle celisir.
function demoAlerts(): AlertRow[] {
  const passing = SEEDS.filter((s) => !s.hardFail && (s.score ?? 0) >= 70);
  return passing.map((s, i) => ({
    id: i + 1,
    sentAt: minsAgo(s.checkedMin + 1),
    channel: "telegram",
    pool: { baseTokenSymbol: s.sym, chain: "solana", pairAddress: fakeAddr(i + 1) },
    score: { score: s.score ?? 0 },
  }));
}

const BINANCE: Array<[string, number, number, number, number | null, number | null, number | null]> = [
  // [base, gun once listelendi, sinceListing%, d30%, d7%, d24%, — currentPrice hesaplanir]
  ["PENGU", 128, -62.4, -18.2, -6.4, -2.1, null],
  ["MOVE", 141, -71.8, -22.6, -9.1, -3.4, null],
  ["ME", 134, -58.3, -14.9, -4.2, 1.8, null],
  ["USUAL", 122, -66.1, -19.4, -7.8, -1.2, null],
  ["VANA", 118, -74.2, -25.1, -11.3, -4.6, null],
  ["ANIME", 96, -48.7, -11.2, -3.1, 2.4, null],
  ["BERA", 88, -55.9, -16.8, -5.7, -0.8, null],
  ["TRUMP", 84, -81.3, -28.4, -12.6, -5.1, null],
  ["SOLV", 79, -69.4, -21.7, -8.9, -2.8, null],
  ["S", 71, -42.1, -9.6, -2.4, 3.1, null],
  ["PNUT", 64, -76.8, -24.3, -10.2, -3.9, null],
  ["ACT", 58, -83.6, -31.2, -14.1, -6.2, null],
  ["KAITO", 46, -37.4, -8.1, -1.9, 4.2, null],
  ["IP", 38, -29.8, -6.4, 1.2, 2.8, null],
  ["WCT", 24, -51.2, -13.7, -4.8, -1.4, null],
  ["SIGN", 16, -44.6, -10.9, -3.6, 0.9, null],
];

function demoBinance(): BinanceListingsResponse {
  const rows = BINANCE.map(([base, days, since, d30, d7, d24]) => {
    const firstPrice = 1;
    return {
      symbol: `${base}USDT`,
      base: base as string,
      listedAt: Date.now() - (days as number) * 86_400_000,
      firstPrice,
      currentPrice: firstPrice * (1 + (since as number) / 100),
      sinceListingPct: since as number,
      d30Pct: d30 as number | null,
      d7Pct: d7 as number | null,
      d24Pct: d24 as number | null,
    };
  }).sort((a, b) => a.sinceListingPct - b.sinceListingPct);

  return { rows, updatedAt: Date.now() - 4 * 60_000, refreshing: false };
}

// Tek giris noktasi: demo modda sabit veri, normalde gercek fetch.
// Panelin geri kalani hangi modda oldugunu bilmek zorunda kalmasin diye
// fetch imzasi degil, dogrudan cozulmus JSON donuyor.
export async function apiGet<T>(path: string): Promise<T> {
  if (DEMO) {
    if (path.startsWith("/api/pools")) return demoPools() as T;
    if (path.startsWith("/api/alerts")) return demoAlerts() as T;
    if (path.startsWith("/api/binance-listings")) return demoBinance() as T;
    throw new Error(`demo veride karsiligi yok: ${path}`);
  }
  const res = await fetch(path);
  if (!res.ok) throw new Error(`worker ${res.status} döndü`);
  return (await res.json()) as T;
}

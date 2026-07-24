import "dotenv/config";
import { createApi } from "../api/server.js";
import { scanSolanaOnce } from "./scan.js";
import { refreshBinanceListings } from "./binanceScan.js";
import { telegramConfigured, startBot, currentChatId } from "../notify/telegram.js";

const PORT = Number(process.env.PORT ?? 3000);
const SOLANA_INTERVAL = Number(process.env.SOLANA_POLL_INTERVAL_MS ?? 30000);
const BINANCE_INTERVAL = Number(process.env.BINANCE_REFRESH_MS ?? 600000); // 10 dk

async function main() {
  console.log("=== RugRadar worker ===");
  if (telegramConfigured()) {
    startBot(); // link-lookup + chat id yakalama
    const cid = currentChatId();
    console.log(`telegram: aktif${cid ? ` (chat ${cid})` : " — chat id yok, bota mesaj at"}`);
  } else {
    console.log("telegram: KAPALI (token yok, alert loglanir)");
  }
  console.log(`solana poll: her ${SOLANA_INTERVAL / 1000}sn | esik: ${process.env.ALERT_SCORE_THRESHOLD ?? 70}`);

  // Ic API (dashboard icin)
  const app = createApi();
  app.listen(PORT, () => console.log(`[api] http://localhost:${PORT}`));

  // Poll dongusu — tur bitince bir sonrakini planla (ust uste binmesin).
  const loop = async () => {
    try {
      await scanSolanaOnce();
    } catch (e) {
      console.error("[scan] hata:", e);
    } finally {
      setTimeout(loop, SOLANA_INTERVAL);
    }
  };
  loop();

  // Binance yeni-listeleme taramasi (ayri dongu). Ilk tur arka planda baslar;
  // ilk calismada tum sembolleri tarihlemek uzun surer, sonrasi cache'ten hizli.
  const binanceLoop = async () => {
    try {
      await refreshBinanceListings();
    } catch (e) {
      console.error("[binance] hata:", e);
    } finally {
      setTimeout(binanceLoop, BINANCE_INTERVAL);
    }
  };
  binanceLoop();
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});

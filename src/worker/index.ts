import "dotenv/config";
import { createApi } from "../api/server.js";
import { scanSolanaOnce, discoverFreshAddresses } from "./scan.js";
import { refreshBinanceListings } from "./binanceScan.js";
import { telegramConfigured, startBot, currentChatId } from "../notify/telegram.js";
import { cacheMode } from "../cache/index.js";
import { queueEnabled, startWorker, enqueueAddresses, closeQueue } from "../queue/index.js";

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
  console.log(`cache: ${cacheMode()} | tarama: ${queueEnabled() ? "kuyruk" : "seri"}`);

  // Ic API (dashboard icin)
  const app = createApi();
  app.listen(PORT, () => console.log(`[api] http://localhost:${PORT}`));

  if (queueEnabled()) {
    // Kuyruk modu: poll dongusu sadece KESFEDER ve kuyruga birakir; taramayi
    // es zamanli worker'lar yapar. Kesif ucuz (tek istek), tarama pahali —
    // ikisini ayirmak yavas taramanin kesfi bloklamasini onluyor.
    startWorker();

    const discoverLoop = async () => {
      try {
        const fresh = await discoverFreshAddresses("solana");
        const queued = await enqueueAddresses(fresh, "solana");
        if (queued > 0) console.log(`[scan] ${queued} adres kuyruga eklendi`);
        else console.log("[scan] solana: yeni token yok");
      } catch (e) {
        console.error("[scan] kesif hatasi:", e);
      } finally {
        setTimeout(discoverLoop, SOLANA_INTERVAL);
      }
    };
    discoverLoop();
  } else {
    // Seri mod (REDIS_URL yok): bugunku davranis, tur bitince bir sonrakini
    // planla (ust uste binmesin).
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
  }

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

// Kuyrugu duzgun kapat — yarim kalan isler 'active'te asili kalmasin.
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`\n${sig} alindi, kapaniyor...`);
    await closeQueue().catch(() => {});
    process.exit(0);
  });
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});

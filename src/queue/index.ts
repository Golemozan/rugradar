import { Queue, Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { scanAddress } from "../worker/scan.js";
import { recordScan, recordScanError } from "../metrics.js";

/*
 * Tarama kuyrugu.
 *
 * Seri dongude her adres sirayla isleniyordu ve aralarda `sleep(250)` vardi.
 * O sleep aslinda kaba bir hiz siniriydi: dis API'lere (DexScreener, RugCheck,
 * Jupiter) 429 yedirmemek icin. Sorun su ki ayni sleep, es zamanlilik da
 * kaldiriyordu — 40 adres ≈ 40 × (ag suresi + 250ms).
 *
 * Onemli olan: sadece worker sayisini artirmak ise yaramaz. sleep'i kaldirip
 * 4 worker acarsan darbogaz yer degistirir, bu sefer 429 yemeye baslarsin.
 * Dogru cozum ikisini AYIRMAK:
 *   - es zamanlilik  -> Worker `concurrency`
 *   - hiz siniri     -> BullMQ `limiter` (kuyruk genelinde, worker sayisindan bagimsiz)
 *
 * Ustelik kuyruk bedavaya iki sey daha getiriyor: basarisiz is yeniden denenir
 * (`attempts` + exponential backoff) ve kuyruk derinligi olculebilir hale gelir.
 * Seri dongude bir hata sessizce isi dusuruyordu.
 */

export const SCAN_QUEUE = "scan";

const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY ?? 4);
const RATE_PER_SEC = Number(process.env.SCAN_RATE_PER_SEC ?? 8);

export type ScanJobData = { address: string; chain: string };

let queue: Queue<ScanJobData> | null = null;
let worker: Worker<ScanJobData> | null = null;
let connection: Redis | null = null;

function redisConnection(): Redis {
  if (!connection) {
    // BullMQ bu iki ayari sart kosuyor; aksi halde blocking komutlarda patliyor.
    connection = new Redis(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

export function queueEnabled(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

export function getQueue(): Queue<ScanJobData> {
  if (!queue) {
    queue = new Queue<ScanJobData>(SCAN_QUEUE, { connection: redisConnection() });
  }
  return queue;
}

/** Adresleri kuyruga ekler. Ayni adres tekrar gelirse jobId sayesinde yutulur. */
export async function enqueueAddresses(addresses: string[], chain = "solana"): Promise<number> {
  if (addresses.length === 0) return 0;
  const q = getQueue();
  await q.addBulk(
    addresses.map((address) => ({
      name: "scan-address",
      data: { address, chain },
      opts: {
        // Ikinci bir savunma hatti: cache atlatilsa bile ayni is iki kez girmez.
        jobId: `${chain}:${address}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 500, // son 500 is dursun (panel/metrics icin), gerisi silinsin
        removeOnFail: 200,
      },
    }))
  );
  return addresses.length;
}

/** Isleyiciyi baslatir. Her is tek bir adresi uctan uca tarar. */
export function startWorker(): Worker<ScanJobData> {
  if (worker) return worker;

  worker = new Worker<ScanJobData>(
    SCAN_QUEUE,
    async (job: Job<ScanJobData>) => {
      const started = Date.now();
      const scanned = await scanAddress(job.data.address, job.data.chain);
      recordScan(Date.now() - started, scanned);
      return { scanned };
    },
    {
      connection: redisConnection(),
      concurrency: CONCURRENCY,
      // Kuyruk genelinde hiz siniri: worker sayisi degisse de dis API'ye
      // saniyede RATE_PER_SEC'ten fazla istek gitmez.
      limiter: { max: RATE_PER_SEC, duration: 1000 },
    }
  );

  worker.on("failed", (job, err) => {
    recordScanError();
    console.error(`[queue] is basarisiz ${job?.data.address ?? "?"}: ${err.message}`);
  });

  console.log(`[queue] worker acildi — es zamanlilik ${CONCURRENCY}, hiz ${RATE_PER_SEC}/sn`);
  return worker;
}

/** Panel/metrics icin kuyruk derinligi. */
export async function queueDepth(): Promise<{ waiting: number; active: number; failed: number }> {
  if (!queueEnabled()) return { waiting: 0, active: 0, failed: 0 };
  const q = getQueue();
  const [waiting, active, failed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getFailedCount(),
  ]);
  return { waiting, active, failed };
}

export async function closeQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
  await connection?.quit();
  worker = null;
  queue = null;
  connection = null;
}

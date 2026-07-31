import http from "node:http";
import type { AddressInfo } from "node:net";
import { sleep } from "../src/sources/http.js";

/*
 * Seri boru hatti vs es zamanli boru hatti — kontrollu olcum.
 *
 * NEDEN GERCEK API'LERE VURMUYORUZ:
 *   DexScreener/RugCheck gercek gecikmeleri dakikadan dakikaya degisiyor, ustelik
 *   olcum icin onlari dovmek kabalik. Bu yuzden yukari akis, sabit gecikmeli
 *   lokal bir HTTP sunucusuyla taklit ediliyor. Olculen sey AGIN hizi degil,
 *   BORU HATTININ SEKLI: ayni is, iki farkli sirayla.
 *
 * KARSILASTIRILAN IKI MOD:
 *   seri   — eski davranis: tek tek, her adres arasinda sleep(250)
 *   kuyruk — yeni davranis: CONCURRENCY kadar es zamanli + saniyede RATE token
 *
 * Kuyruk modu BullMQ'yu degil, onun ayarlarini (concurrency + limiter) birebir
 * taklit eden bir havuz kullaniyor; boylece bench Redis olmadan da kosuyor.
 * Olculen kazanim planlama kazancidir, BullMQ'nun kendi ek yuku dahil degildir.
 *
 * Kosum: npx tsx scripts/bench.ts
 */

const ADDRESSES = Number(process.env.BENCH_ADDRESSES ?? 40);
const UPSTREAM_LATENCY_MS = Number(process.env.BENCH_LATENCY_MS ?? 120);
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY ?? 4);
const RATE_PER_SEC = Number(process.env.SCAN_RATE_PER_SEC ?? 8);
const SERIAL_SLEEP_MS = 250; // eski scan.ts'teki sabit

// Her adres ucar istek yapiyor: dexscreener + rugcheck + jupiter.
const REQUESTS_PER_ADDRESS = 3;

async function main() {
  const { base, close, counter } = await startUpstream(UPSTREAM_LATENCY_MS);

  console.log("RugRadar boru hatti karsilastirmasi");
  console.log("-".repeat(56));
  console.log(`adres sayisi        : ${ADDRESSES}`);
  console.log(`adres basina istek  : ${REQUESTS_PER_ADDRESS}`);
  console.log(`yukari akis gecikme : ${UPSTREAM_LATENCY_MS}ms`);
  console.log(`es zamanlilik       : ${CONCURRENCY}`);
  console.log(`hiz siniri          : ${RATE_PER_SEC}/sn`);
  console.log("-".repeat(56));

  counter.reset();
  const serialMs = await time(() => runSerial(base));
  const serialReqs = counter.total;

  counter.reset();
  const queueMs = await time(() => runQueued(base));
  const queueReqs = counter.total;

  await close();

  const speedup = serialMs / queueMs;
  console.log(`seri   : ${fmt(serialMs)}  (${serialReqs} istek)`);
  console.log(`kuyruk : ${fmt(queueMs)}  (${queueReqs} istek)`);
  console.log("-".repeat(56));
  console.log(`hizlanma: ${speedup.toFixed(2)}x`);
  console.log(`adres basina: ${fmt(serialMs / ADDRESSES)} -> ${fmt(queueMs / ADDRESSES)}`);

  if (serialReqs !== queueReqs) {
    console.warn(`\nUYARI: istek sayilari farkli (${serialReqs} vs ${queueReqs}) — ayni is yapilmamis.`);
    process.exitCode = 1;
  } else {
    console.log(`\nIki mod da ayni isi yapti: ${serialReqs} istek.`);
  }
}

/** Eski yol: sirayla, her adresten sonra sabit bekleme. */
async function runSerial(base: string): Promise<void> {
  for (let i = 0; i < ADDRESSES; i++) {
    await processAddress(base, i);
    await sleep(SERIAL_SLEEP_MS);
  }
}

/** Yeni yol: N es zamanli isci + saniyede RATE token'lik ortak hiz siniri. */
async function runQueued(base: string): Promise<void> {
  const limiter = new RateLimiter(RATE_PER_SEC);
  let next = 0;

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const i = next++;
      if (i >= ADDRESSES) return;
      await limiter.take();
      await processAddress(base, i);
    }
  });

  await Promise.all(workers);
}

/** Tek adresin yaptigi is: uc yukari akis cagrisi. */
async function processAddress(base: string, i: number): Promise<void> {
  await fetch(`${base}/dexscreener/${i}`).then((r) => r.json());
  await fetch(`${base}/rugcheck/${i}`).then((r) => r.json());
  await fetch(`${base}/jupiter/${i}`).then((r) => r.json());
}

/** Token bucket — BullMQ limiter'inin { max, duration: 1000 } davranisi. */
class RateLimiter {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(private readonly perSecond: number) {
    this.tokens = perSecond;
  }

  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const elapsed = now - this.lastRefill;
      if (elapsed >= 1000) {
        this.tokens = this.perSecond;
        this.lastRefill = now;
      }
      if (this.tokens > 0) {
        this.tokens--;
        return;
      }
      await sleep(1000 - elapsed);
    }
  }
}

/** Sabit gecikmeli sahte yukari akis + istek sayaci. */
async function startUpstream(latencyMs: number) {
  let total = 0;

  const server = http.createServer(async (_req, res) => {
    total++;
    await sleep(latencyMs);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
  });
  // Es zamanlilik olculuyor; Node'un varsayilan soket limiti olcumu bozmasin.
  server.keepAliveTimeout = 5000;

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    base: `http://127.0.0.1:${port}`,
    counter: {
      get total() {
        return total;
      },
      reset() {
        total = 0;
      },
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function time(fn: () => Promise<void>): Promise<number> {
  const t = Date.now();
  await fn();
  return Date.now() - t;
}

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

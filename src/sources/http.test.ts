import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { getJson, getJsonStatus, sleep } from "./http.js";

/*
 * Mock kutuphanesi yerine gercek bir HTTP sunucusu.
 *
 * Sebep: test edilen sey fetch'in KENDISI degil, http.ts'in fetch cevresindeki
 * davranisi — 429'da geri cekilip tekrar deneme, timeout'ta abort, hata
 * metnini koruma. global fetch'i stub'lamak bu davranisin yarisini atlar
 * (AbortController gercekten tetiklenmez). Ephemeral portta ufak bir sunucu
 * hem gercek davranisi olcer hem yeni bagimlilik getirmez.
 */

let server: http.Server;
let base = "";

/** Her yol icin cagri sayaci — retry gercekten oldu mu, buradan gorulur. */
const hits = new Map<string, number>();

function hit(path: string): number {
  const n = (hits.get(path) ?? 0) + 1;
  hits.set(path, n);
  return n;
}

before(async () => {
  server = http.createServer(async (req, res) => {
    const path = req.url ?? "/";
    const n = hit(path);

    // Ilk iki istekte 429, ucuncude basarili -> retry + backoff kanitlanir.
    if (path.startsWith("/rate-limited")) {
      if (n < 3) {
        res.writeHead(429).end("slow down");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, attempt: n }));
      return;
    }

    if (path.startsWith("/always-429")) {
      res.writeHead(429).end("slow down");
      return;
    }

    if (path.startsWith("/bad-request")) {
      res.writeHead(400, { "content-type": "application/json" }).end(
        JSON.stringify({ error: "route yok" })
      );
      return;
    }

    if (path.startsWith("/broken-json")) {
      res.writeHead(200, { "content-type": "application/json" }).end("{ bu json degil");
      return;
    }

    // Cevabi geciktir -> istemci timeout'u tetiklensin.
    if (path.startsWith("/slow")) {
      await sleep(300);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/* ---------- getJson ---------- */

test("basarili cevabi cozer", async () => {
  const data = await getJson<{ ok: boolean }>(`${base}/ok`);
  assert.deepEqual(data, { ok: true });
});

test("429 gorunce geri cekilip tekrar dener", async () => {
  hits.delete("/rate-limited");
  const data = await getJson<{ ok: boolean; attempt: number }>(`${base}/rate-limited`, {
    retries: 3,
  });
  assert.equal(data?.ok, true);
  assert.equal(data?.attempt, 3, "ucuncu denemede basarili olmali");
  assert.equal(hits.get("/rate-limited"), 3, "sunucuya tam 3 istek gitmeli");
});

test("429 backoff'u ustel artar (denemeler arasi bekleme uzar)", async () => {
  hits.delete("/always-429");
  const started = Date.now();
  const data = await getJson(`${base}/always-429`, { retries: 2 });
  const elapsed = Date.now() - started;

  assert.equal(data, null, "surekli 429'da null donmeli");
  // 500*2^0 + 500*2^1 = 1500ms; zamanlama toleransi icin 1200 esigi.
  assert.ok(elapsed >= 1200, `ustel backoff beklenir, gecen sure ${elapsed}ms`);
});

test("HTTP hatasinda null doner", async () => {
  const data = await getJson(`${base}/bad-request`);
  assert.equal(data, null);
});

test("timeout'ta null doner, asili kalmaz", async () => {
  const started = Date.now();
  const data = await getJson(`${base}/slow`, { timeoutMs: 60, retries: 0 });
  assert.equal(data, null);
  assert.ok(Date.now() - started < 1000, "timeout gercekten abort etmeli");
});

/* ---------- getJsonStatus ---------- */

// Bu fonksiyonun varlik sebebi: Jupiter'de "400 + route yok" (satilamiyor) ile
// "ag hatasi" (bilmiyoruz) farkli seyler. getJson ikisini de null'a ceviriyor,
// o yuzden honeypot karari verilemiyor. Durum kodu KAYBOLMAMALI.
test("400 durumunu ve govdesini korur", async () => {
  const r = await getJsonStatus(`${base}/bad-request`);
  assert.equal(r.status, 400, "durum kodu korunmali");
  assert.equal(r.data, null);
  assert.match(r.errorText ?? "", /route yok/, "hata govdesi korunmali");
});

test("ag hatasini 400'den ayirir", async () => {
  const r = await getJsonStatus(`${base}/slow`, { timeoutMs: 60, retries: 0 });
  assert.equal(r.status, 0, "ag hatasi status 0 ile isaretlenmeli");
  assert.match(r.errorText ?? "", /ag hatasi|timeout/);
});

test("bozuk JSON'da cokmez", async () => {
  const r = await getJsonStatus(`${base}/broken-json`);
  assert.equal(r.status, 200);
  assert.equal(r.data, null);
  assert.match(r.errorText ?? "", /gecersiz JSON/);
});

test("basarili cevapta veriyi ve 200'u dondurur", async () => {
  const r = await getJsonStatus<{ ok: boolean }>(`${base}/ok`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true });
  assert.equal(r.errorText, null);
});

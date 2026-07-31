import { test } from "node:test";
import assert from "node:assert/strict";
import { markSeen, cacheMode, resetCache } from "./index.js";
import { sleep } from "../sources/http.js";

// Bu dosya REDIS_URL yokken bellek modunu test eder. CI'da ayrica REDIS_URL
// set edilerek ayni testler redis modunda da kosuyor (bkz. .github/workflows/ci.yml)
// — zarif dusus gercekten calisiyor mu, kanit bu.

test("cache modu REDIS_URL'e gore secilir", () => {
  const expected = process.env.REDIS_URL?.trim() ? "redis" : "memory";
  assert.equal(cacheMode(), expected);
});

test("ayni anahtar ikinci cagride false doner", async () => {
  resetCache();
  const key = `test:dupe:${Date.now()}`;
  assert.equal(await markSeen(key, 60_000), true, "ilk isaretleme true olmali");
  assert.equal(await markSeen(key, 60_000), false, "TTL icinde tekrar false olmali");
});

test("farkli anahtarlar birbirini etkilemez", async () => {
  resetCache();
  const a = `test:a:${Date.now()}`;
  const b = `test:b:${Date.now()}`;
  assert.equal(await markSeen(a, 60_000), true);
  assert.equal(await markSeen(b, 60_000), true, "ayri anahtar bagimsiz olmali");
});

test("TTL dolunca anahtar yeniden isaretlenebilir", async () => {
  resetCache();
  const key = `test:ttl:${Date.now()}`;
  assert.equal(await markSeen(key, 50), true);
  assert.equal(await markSeen(key, 50), false, "TTL icinde hala kilitli");
  await sleep(80);
  assert.equal(await markSeen(key, 50), true, "TTL dolunca tekrar acilmali");
});

// Asil kazanim: es zamanli iki is ayni adresi ayni anda gecemez.
// Eski `Map` kodunda oku-ve-yaz iki adimdi, bu test orada patlardi.
test("es zamanli cagrilarda sadece biri gecer", async () => {
  resetCache();
  const key = `test:race:${Date.now()}`;
  const results = await Promise.all(
    Array.from({ length: 10 }, () => markSeen(key, 60_000))
  );
  const passed = results.filter(Boolean).length;
  assert.equal(passed, 1, `tam olarak 1 gecmeli, gecen: ${passed}`);
});

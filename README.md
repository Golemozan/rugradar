# RugRadar 📡

> Real-time DEX memecoin scanner + safety scorer with instant Telegram alerts.
> Gerçek zamanlı DEX memecoin tarayıcı + güvenlik skorlayıcı, anında Telegram uyarısı.

**No wallet. No private keys. No auto-trading.** RugRadar only *watches and scores* — the decision is always yours.
**Cüzdan yok. Private key yok. Otomatik trade yok.** RugRadar sadece *tarar ve skorlar* — karar her zaman sende.

---

## 🇬🇧 English

### What it does
RugRadar continuously discovers new Solana DEX pools, runs them through a set of "solid coin" safety checks (liquidity lock, mint/freeze authority, holder concentration, honeypot signals, organic volume), scores each 0–100, and pushes anything above your threshold **straight to Telegram**. You can also paste any DexScreener link or token address into the bot to get an instant report.

### Scoring (0–100)
| Factor | Weight | Notes |
|---|---|---|
| Liquidity lock | 25 | Locked/burned LP ratio |
| Authority (renounce / mint-freeze) | 20 | Solana mint & freeze authority |
| Top-holder distribution | 20 | >20% single holder → score hard-capped at 30 |
| Honeypot / sell test | 20 | Fail → hard-gate, score 0, no alert |
| Organic volume/liquidity | 15 | Wash-trading smell |

Honeypot failure is a **hard gate**: score drops to 0 and no alert is sent.

### Tech stack
- **Worker:** Node.js 20+ · TypeScript (poller + scorer + Telegram bot + internal API)
- **Queue:** BullMQ over Redis — concurrent scanning with a queue-wide rate limit
- **Cache:** Redis (`SET NX PX`) with an in-process fallback
- **DB:** SQLite locally (no daemon), Postgres-ready for deploy (Prisma)
- **Telegram:** grammy · **API:** Express · **Dashboard:** React + Vite
- **Ops:** multi-stage Docker · Docker Compose · GitHub Actions CI
- **Data sources (all free, no API key):** DexScreener, RugCheck.xyz

### Architecture
```
                  ┌──────────── discovery loop (cheap, 1 request) ────────────┐
                  │  DexScreener /token-profiles                              │
                  └───────────────────────────┬──────────────────────────────┘
                                              │ addresses
                                    ┌─────────▼─────────┐
                                    │  dedup cache      │  Redis SET NX PX
                                    │  (10 min TTL)     │  └ fallback: in-process Map
                                    └─────────┬─────────┘
                                              │ unseen only
                                    ┌─────────▼─────────┐
                                    │   scan queue      │  BullMQ
                                    │  concurrency 4    │  retries 3 (exp. backoff)
                                    │  rate 8 req/s     │
                                    └─────────┬─────────┘
                                              │ one job per address
   ┌──────────────────────────────────────────▼──────────────────────────────┐
   │  DexScreener (pair) → RugCheck (safety) → Jupiter (sell test)           │
   │                              ↓                                          │
   │                        scorePool()  ──► SQLite / Postgres               │
   │                              └─ score ≥ threshold ──► Telegram alert     │
   └─────────────────────────────────────────────────────────────────────────┘
```

**Without `REDIS_URL` the whole middle section collapses to the original serial
loop** — same results, same alerts, just slower. Nothing else has to change.

### Engineering notes

Three decisions worth explaining, because each one exists for a reason in the code
rather than for its own sake.

**1. Why Redis for the dedup cache**
This used to be a `Map` inside `scan.ts`. It had three problems: it vanished on
restart (so the same pool was re-scanned), a second worker process couldn't see the
first one's marks, and "read then write" were two separate steps — two concurrent
jobs could pass the same address at the same time. `SET key NX PX ttl` is one atomic
command that fixes all three. See `src/cache/index.ts`.

**2. Concurrency alone would have made things worse**
The old loop slept 250 ms between addresses. That sleep was really a crude global
rate limit — it kept DexScreener/RugCheck from returning 429. Removing it and
starting 4 workers would just move the bottleneck into the 429 handler. So the two
concerns are separated: **concurrency** is the worker's `concurrency`, **rate** is
BullMQ's queue-wide `limiter`. Tuning one no longer breaks the other.

**3. Concurrency vs SQLite**
SQLite allows a single writer. Four jobs writing at once raise `SQLITE_BUSY`. Rather
than switching databases, the Prisma pool is pinned to `connection_limit=1` for
`file:` URLs: network work (the real bottleneck) stays concurrent, database writes
queue up in the pool. On Postgres the limit isn't applied. See `src/db/client.ts`.

### Benchmark

`npx tsx scripts/bench.ts` — the same workload run through both pipelines.

Upstream is a local HTTP server with a fixed delay, **not** the real APIs: their
latency drifts minute to minute and hammering them for a benchmark would be rude.
What is being measured is the shape of the pipeline, not network speed. The script
asserts both modes issued the identical number of requests, so the comparison is
like-for-like.

```
40 addresses · 3 upstream calls each · 120 ms simulated latency · concurrency 4 · 8 req/s

serial   26.89s   (120 requests)      672 ms per address
queue     4.86s   (120 requests)      122 ms per address
                                      ─────────────────
                                      5.53x
```

Reproduce with different parameters:
```bash
BENCH_ADDRESSES=100 BENCH_LATENCY_MS=200 SCAN_CONCURRENCY=8 npx tsx scripts/bench.ts
```

Live counters are exposed at `GET /metrics` (scanned, skipped, errors, alerts,
p50/p95 duration, queue depth, active mode).

### Tests

```bash
npm test        # 35 tests
```

- `src/scoring/score.test.ts` — 20 tests over the scoring engine, including
  regressions that v1 got wrong (distributed bundles where top-1 looks fine but
  top-10 holds 68%; pump.fun pools that report no liquidity figure at all).
- `src/sources/http.test.ts` — retry, exponential backoff, timeout/abort, and
  keeping the HTTP status intact. Uses a real `node:http` server on an ephemeral
  port rather than a fetch stub, because the abort path never fires against a stub.
- `src/cache/cache.test.ts` — TTL behaviour and the concurrency guarantee: ten
  simultaneous calls, exactly one passes.

CI runs the whole suite twice — once in memory mode, once against Redis — so the
fallback path can't silently rot.

### Quick start
```bash
git clone https://github.com/Golemozan/rugradar.git
cd rugradar
npm install
cp .env.example .env        # fill in TELEGRAM_BOT_TOKEN (optional)
npx prisma generate
npx prisma migrate deploy
npm run start:local         # worker: scanner + Telegram bot + API :3000
```

**With the web panel:**
```bash
cd client && npm install && npm run dev   # http://localhost:5173
```

On Windows, just double-click **`RugRadar.cmd`** (worker only) or **`RugRadar-Panel.cmd`** (worker + panel).

**With Docker (Redis + queue mode, one command):**
```bash
docker compose up
curl localhost:3000/health
curl localhost:3000/metrics    # mode: "queue"
```
Compose brings up Redis alongside the worker, so queue mode switches on by itself —
no extra configuration. Data and the dedup cache live in named volumes and survive
a rebuild.

### Telegram bot
- Paste a **DexScreener link or token address** → instant report: score, price, market cap, volume, buy/sell counts (m5 + h1), mint/freeze authority, top holder, honeypot flag.
- 10+ buys / 0 sells in 1h → honeypot warning.
- **/start** → help + auto-captures your chat ID (saved to `.chatid`).
- No token configured? Alerts are logged to the console instead.

### Configuration (`.env`)
| Key | Description |
|---|---|
| `DATABASE_URL` | SQLite file locally, Postgres URL on deploy |
| `TELEGRAM_BOT_TOKEN` | From @BotFather. Empty → alerts logged, not sent |
| `TELEGRAM_CHAT_ID` | Leave empty → auto-resolved from first message |
| `ALERT_SCORE_THRESHOLD` | Score that triggers an alert (0–100, default 70) |
| `SOLANA_POLL_INTERVAL_MS` | Poll interval (default 30000) |
| `PORT` | Internal API port (default 3000) |
| `REDIS_URL` | **Optional.** Empty → memory cache + serial scanning. Set → shared cache + queue mode |
| `SCAN_CONCURRENCY` | Jobs processed at once in queue mode (default 4) |
| `SCAN_RATE_PER_SEC` | Queue-wide rate limit toward upstream APIs (default 8) |

### Roadmap
- [x] Score calibration (weigh absolute liquidity, not just lock %)
- [x] Redis-backed dedup cache with graceful fallback
- [x] Queue-based concurrent scanning with rate limiting
- [x] Docker Compose + CI on both cache backends
- [ ] Phase 2: Ethereum + BSC (GoPlus + Honeypot.is)
- [ ] Railway deploy

### ⚠️ Disclaimer
This tool is for **research and educational purposes only**. It is **not financial advice**. Memecoin trading is extremely high-risk; you can lose everything. A high score is not a safety guarantee. Always do your own research.

---

## 🇹🇷 Türkçe

### Ne yapar
RugRadar yeni Solana DEX pool'larını sürekli keşfeder, bir dizi "sağlam coin" güvenlik kontrolünden geçirir (likidite kilidi, mint/freeze authority, holder yoğunluğu, honeypot sinyalleri, organik hacim), her birini 0–100 arası skorlar ve eşiğini geçeni **doğrudan Telegram'a** atar. Ayrıca bota herhangi bir DexScreener linki veya token adresi yapıştırıp anında rapor alabilirsin.

### Skorlama (0–100)
| Faktör | Ağırlık | Not |
|---|---|---|
| Likidite kilidi | 25 | Kilitli/yakılmış LP oranı |
| Yetki (renounce / mint-freeze) | 20 | Solana mint & freeze authority |
| Top holder dağılımı | 20 | Tek cüzdan >%20 → skor 30'a kapanır |
| Honeypot / satış testi | 20 | Fail → hard-gate, skor 0, alert yok |
| Organik hacim/likidite | 15 | Wash-trading kokusu |

Honeypot başarısızlığı bir **hard gate**'tir: skor 0'a düşer ve alert gönderilmez.

### Tech stack
- **Worker:** Node.js 20+ · TypeScript (poller + skorlayıcı + Telegram bot + iç API)
- **Kuyruk:** Redis üstünde BullMQ — eş zamanlı tarama + kuyruk geneli hız sınırı
- **Cache:** Redis (`SET NX PX`), Redis yoksa süreç içi yedek
- **DB:** Lokalde SQLite (daemon yok), deploy'da Postgres'e hazır (Prisma)
- **Telegram:** grammy · **API:** Express · **Dashboard:** React + Vite
- **Ops:** çok aşamalı Docker · Docker Compose · GitHub Actions CI
- **Veri kaynakları (hepsi ücretsiz, API key gerektirmez):** DexScreener, RugCheck.xyz

### Mimari
```
                  ┌────────── keşif döngüsü (ucuz, tek istek) ────────────────┐
                  │  DexScreener /token-profiles                              │
                  └───────────────────────────┬──────────────────────────────┘
                                              │ adresler
                                    ┌─────────▼─────────┐
                                    │  dedup cache      │  Redis SET NX PX
                                    │  (10 dk TTL)      │  └ yedek: süreç içi Map
                                    └─────────┬─────────┘
                                              │ yalnızca görülmemişler
                                    ┌─────────▼─────────┐
                                    │  tarama kuyruğu   │  BullMQ
                                    │  eş zamanlılık 4  │  3 deneme (üstel backoff)
                                    │  hız 8 istek/sn   │
                                    └─────────┬─────────┘
                                              │ adres başına bir iş
   ┌──────────────────────────────────────────▼──────────────────────────────┐
   │  DexScreener (pair) → RugCheck (güvenlik) → Jupiter (satış testi)       │
   │                              ↓                                          │
   │                        scorePool()  ──► SQLite / Postgres               │
   │                              └─ skor ≥ eşik ──► Telegram alert          │
   └─────────────────────────────────────────────────────────────────────────┘
```

**`REDIS_URL` yoksa ortadaki katman komple devre dışı kalır** ve sistem eski seri
döngüye düşer — aynı sonuçlar, aynı alertler, sadece daha yavaş. Başka hiçbir şey
değişmiyor.

### Mühendislik notları

Üç karar, açıklamaya değer — çünkü her biri kendi hatırı için değil, koddaki gerçek
bir sorun yüzünden var.

**1. Dedup cache neden Redis'e taşındı**
Önceden `scan.ts` içinde bir `Map`'ti. Üç sorunu vardı: process yeniden başlayınca
uçuyordu (aynı pool baştan taranıyordu), ikinci bir worker açılınca iki süreç
birbirinin işaretini görmüyordu, ve "oku, sonra yaz" iki ayrı adımdı — eş zamanlı
iki iş aynı adresi aynı anda geçebiliyordu. `SET key NX PX ttl` tek atomik komutla
üçünü de kapatıyor. Bkz. `src/cache/index.ts`.

**2. Tek başına eş zamanlılık işi kötüleştirirdi**
Eski döngü adresler arasında 250 ms uyuyordu. O uyku aslında kaba bir hız sınırıydı:
DexScreener/RugCheck 429 döndürmesin diye. Onu kaldırıp 4 worker açmak darboğazı
sadece 429 işleyicisine taşırdı. Bu yüzden iki kaygı ayrıldı: **eş zamanlılık**
worker'ın `concurrency`'si, **hız** ise BullMQ'nun kuyruk geneli `limiter`'ı. Artık
birini ayarlamak diğerini bozmuyor.

**3. Eş zamanlılığa karşı SQLite**
SQLite tek yazara izin verir; dört iş aynı anda yazmaya kalkınca `SQLITE_BUSY` gelir.
Veritabanını değiştirmek yerine Prisma havuzu `file:` URL'lerinde
`connection_limit=1`'e sabitlendi: asıl darboğaz olan ağ işi eş zamanlı kalıyor,
veritabanı yazımları havuzda sıraya giriyor. Postgres'te bu sınır uygulanmıyor.
Bkz. `src/db/client.ts`.

### Ölçüm

`npx tsx scripts/bench.ts` — aynı iş, iki farklı boru hattından geçiriliyor.

Yukarı akış, gerçek API'ler **değil**, sabit gecikmeli lokal bir HTTP sunucusu:
gerçeklerin gecikmesi dakikadan dakikaya değişiyor ve ölçüm için onları dövmek
kabalık olurdu. Ölçülen şey ağın hızı değil, **boru hattının şekli**. Script iki
modun da birebir aynı sayıda istek attığını doğruluyor, yani karşılaştırma dürüst.

```
40 adres · adres başına 3 istek · 120 ms taklit gecikme · eş zamanlılık 4 · 8 istek/sn

seri     26.89s   (120 istek)      adres başına 672 ms
kuyruk    4.86s   (120 istek)      adres başına 122 ms
                                   ───────────────────
                                   5.53x
```

Farklı parametrelerle tekrar üret:
```bash
BENCH_ADDRESSES=100 BENCH_LATENCY_MS=200 SCAN_CONCURRENCY=8 npx tsx scripts/bench.ts
```

Canlı sayaçlar `GET /metrics` altında: taranan, atlanan, hata, alert, p50/p95 süre,
kuyruk derinliği, aktif mod.

### Testler

```bash
npm test        # 35 test
```

- `src/scoring/score.test.ts` — skorlama motorunda 20 test; v1'in kaçırdığı
  regresyonlar dahil (top-1 masum görünürken top-10'un %68 tuttuğu dağılmış
  bundle'lar; likidite rakamını hiç vermeyen pump.fun havuzları).
- `src/sources/http.test.ts` — retry, üstel backoff, timeout/abort ve HTTP durumunu
  koruma. fetch stub'ı yerine ephemeral portta gerçek `node:http` sunucusu, çünkü
  stub'a karşı abort yolu hiç tetiklenmiyor.
- `src/cache/cache.test.ts` — TTL davranışı ve eş zamanlılık garantisi: on eş zamanlı
  çağrı, tam olarak biri geçiyor.

CI paketi iki kez koşuyor — bir kez bellek modunda, bir kez Redis'e karşı — ki yedek
yol sessizce çürümesin.

### Hızlı başlangıç
```bash
git clone https://github.com/Golemozan/rugradar.git
cd rugradar
npm install
cp .env.example .env        # TELEGRAM_BOT_TOKEN'ı doldur (opsiyonel)
npx prisma generate
npx prisma migrate deploy
npm run start:local         # worker: tarayıcı + Telegram bot + API :3000
```

**Web paneliyle:**
```bash
cd client && npm install && npm run dev   # http://localhost:5173
```

Windows'ta sadece **`RugRadar.cmd`** (yalnızca worker) ya da **`RugRadar-Panel.cmd`** (worker + panel) dosyasına çift tıkla.

**Docker ile (Redis + kuyruk modu, tek komut):**
```bash
docker compose up
curl localhost:3000/health
curl localhost:3000/metrics    # mode: "queue"
```
Compose, worker'ın yanında Redis'i de ayağa kaldırdığı için kuyruk modu kendiliğinden
devreye giriyor — ek ayar yok. Veri ve dedup cache named volume'lerde duruyor,
yeniden kurulumda kaybolmuyor.

### Telegram botu
- **DexScreener linki veya token adresi** yapıştır → anında rapor: skor, fiyat, market cap, hacim, alış/satış sayısı (m5 + h1), mint/freeze authority, top holder, honeypot bayrağı.
- 1 saatte 10+ alış / 0 satış → honeypot uyarısı.
- **/start** → yardım + chat ID'ni otomatik yakalar (`.chatid` dosyasına kaydeder).
- Token tanımlı değilse alertler konsola loglanır.

### Yapılandırma (`.env`)
| Anahtar | Açıklama |
|---|---|
| `DATABASE_URL` | Lokalde SQLite dosyası, deploy'da Postgres URL'i |
| `TELEGRAM_BOT_TOKEN` | @BotFather'dan. Boş → alertler loglanır, gönderilmez |
| `TELEGRAM_CHAT_ID` | Boş bırak → ilk mesajdan otomatik çözülür |
| `ALERT_SCORE_THRESHOLD` | Alert tetikleyen skor (0–100, varsayılan 70) |
| `SOLANA_POLL_INTERVAL_MS` | Poll aralığı (varsayılan 30000) |
| `PORT` | İç API portu (varsayılan 3000) |
| `REDIS_URL` | **Opsiyonel.** Boş → bellek cache + seri tarama. Dolu → paylaşımlı cache + kuyruk modu |
| `SCAN_CONCURRENCY` | Kuyruk modunda eş zamanlı iş sayısı (varsayılan 4) |
| `SCAN_RATE_PER_SEC` | Dış API'lere kuyruk geneli hız sınırı (varsayılan 8) |

### Yol haritası
- [x] Skor kalibrasyonu (sadece kilit % değil, mutlak likiditeyi de ağırlığa kat)
- [x] Redis destekli dedup cache, zarif düşüşle
- [x] Kuyruk tabanlı eş zamanlı tarama + hız sınırı
- [x] Docker Compose + iki cache modunda CI
- [ ] Phase 2: Ethereum + BSC (GoPlus + Honeypot.is)
- [ ] Railway deploy

### ⚠️ Sorumluluk reddi
Bu araç **yalnızca araştırma ve eğitim amaçlıdır**. **Yatırım tavsiyesi değildir.** Memecoin ticareti aşırı yüksek risklidir; her şeyini kaybedebilirsin. Yüksek skor güvenlik garantisi vermez. Her zaman kendi araştırmanı yap.

---

MIT License

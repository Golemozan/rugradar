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
- **Worker:** Node.js 20+ · TypeScript (single process: poller + scorer + Telegram bot + internal API)
- **DB:** SQLite locally (no daemon), Postgres-ready for deploy (Prisma)
- **Telegram:** grammy
- **API:** Express · **Dashboard:** React + Vite + Tailwind-style CSS
- **Data sources (all free, no API key):** DexScreener, RugCheck.xyz

### Architecture
```
DexScreener (discovery) → RugCheck (safety) → scorePool() → SQLite/Postgres
                                                   └→ over threshold → Telegram
```

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

### Roadmap
- [ ] Score calibration (weigh absolute liquidity, not just lock %)
- [ ] Phase 2: Ethereum + BSC (GoPlus + Honeypot.is)
- [ ] Phase 3: richer React dashboard
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
- **Worker:** Node.js 20+ · TypeScript (tek process: poller + skorlayıcı + Telegram bot + iç API)
- **DB:** Lokalde SQLite (daemon yok), deploy'da Postgres'e hazır (Prisma)
- **Telegram:** grammy
- **API:** Express · **Dashboard:** React + Vite + Tailwind tarzı CSS
- **Veri kaynakları (hepsi ücretsiz, API key gerektirmez):** DexScreener, RugCheck.xyz

### Mimari
```
DexScreener (keşif) → RugCheck (güvenlik) → scorePool() → SQLite/Postgres
                                                 └→ eşiği geçti → Telegram
```

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

### Yol haritası
- [ ] Skor kalibrasyonu (sadece kilit % değil, mutlak likiditeyi de ağırlığa kat)
- [ ] Phase 2: Ethereum + BSC (GoPlus + Honeypot.is)
- [ ] Phase 3: zenginleştirilmiş React dashboard
- [ ] Railway deploy

### ⚠️ Sorumluluk reddi
Bu araç **yalnızca araştırma ve eğitim amaçlıdır**. **Yatırım tavsiyesi değildir.** Memecoin ticareti aşırı yüksek risklidir; her şeyini kaybedebilirsin. Yüksek skor güvenlik garantisi vermez. Her zaman kendi araştırmanı yap.

---

Built with [Claude Code](https://claude.com/claude-code) · MIT License

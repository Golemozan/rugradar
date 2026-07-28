import express from "express";
import { prisma } from "../db/client.js";
import { getBinanceListings } from "../worker/binanceScan.js";

// Dashboard bu API'yi tuketir (Phase 3). Simdilik JSON endpoint'ler.
export function createApi() {
  const app = express();

  // Dashboard ayri porttan (Vite :5173 / Railway ayri servis) cagirir -> CORS ac.
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET");
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // Son taranan pool'lar (skoruyla). ?minScore= ile filtre.
  app.get("/api/pools", async (req, res) => {
    const minScore = Number(req.query.minScore ?? 0);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);

    const pools = await prisma.pool.findMany({
      orderBy: { lastCheckedAt: "desc" },
      take: limit,
      include: {
        checks: {
          orderBy: { checkedAt: "desc" },
          take: 1,
          include: { score: true },
        },
      },
    });

    const rows = pools
      .map((p) => {
        const latest = p.checks[0];
        return {
          id: p.id,
          chain: p.chain,
          symbol: p.baseTokenSymbol,
          pairAddress: p.pairAddress,
          dex: p.dex,
          lastCheckedAt: p.lastCheckedAt,
          score: latest?.score?.score ?? null,
          breakdown: latest?.score?.breakdown ? JSON.parse(latest.score.breakdown) : null,
          // v2 sinyalleri — skorun NEDEN o skor oldugunu panelde gosterebilmek icin.
          confidence: latest?.confidence ?? null,
          hardFail: latest?.hardFail ?? null,
          reasons: safeParseArray(latest?.reasons),
          liquidityUsd: latest?.liquidityUsd ?? null,
          topHolderPct: latest?.topHolderPct ?? null,
          top10HolderPct: latest?.top10HolderPct ?? null,
          holderCount: latest?.holderCount ?? null,
          honeypotResult: latest?.honeypotResult ?? null,
          sellPriceImpact: latest?.sellPriceImpact ?? null,
          buys1h: latest?.buys1h ?? null,
          sells1h: latest?.sells1h ?? null,
          fdvUsd: latest?.fdvUsd ?? null,
          pairCreatedAt: latest?.pairCreatedAt ?? null,
        };
      })
      .filter((r) => (r.score ?? 0) >= minScore);

    res.json(rows);
  });

  // Son 6 ayda listelenmis Binance coinleri + fiyat performansi (bellek cache).
  app.get("/api/binance-listings", (_req, res) => {
    res.json(getBinanceListings());
  });

  // Gonderilen alert'ler.
  app.get("/api/alerts", async (_req, res) => {
    const alerts = await prisma.alert.findMany({
      orderBy: { sentAt: "desc" },
      take: 100,
      include: { pool: true, score: true },
    });
    res.json(alerts);
  });

  return app;
}

// reasons kolonu JSON string[] tutuyor; bozuk/eksik kayit panelin tamamini
// dusurmesin diye sessizce bos diziye dusuyoruz.
function safeParseArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

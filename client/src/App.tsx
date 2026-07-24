import { useEffect, useState, useCallback } from "react";
import type { PoolRow, AlertRow } from "./types.ts";
import { BinanceListings } from "./BinanceListings.tsx";

const THRESHOLD = 70;
const REFRESH_MS = 5000;

type Tab = "scanner" | "binance";

export function App() {
  const [tab, setTab] = useState<Tab>("scanner");
  return (
    <div className="wrap">
      <header className="top">
        <h1>RugRadar</h1>
        <nav className="tabs">
          <button className={tab === "scanner" ? "tab on" : "tab"} onClick={() => setTab("scanner")}>
            Solana Tarayıcı
          </button>
          <button className={tab === "binance" ? "tab on" : "tab"} onClick={() => setTab("binance")}>
            Binance Yeni Listeler
          </button>
        </nav>
      </header>
      {tab === "scanner" ? <ScannerView /> : <BinanceListings />}
    </div>
  );
}

function ScannerView() {
  const [pools, setPools] = useState<PoolRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [ok, setOk] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([
        fetch("/api/pools?limit=200").then((r) => r.json()),
        fetch("/api/alerts").then((r) => r.json()),
      ]);
      setPools(Array.isArray(p) ? p : []);
      setAlerts(Array.isArray(a) ? a : []);
      setOk(true);
      setUpdated(new Date());
    } catch {
      setOk(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const scored = pools.filter((p) => p.score != null);
  const avg = scored.length
    ? Math.round(scored.reduce((s, p) => s + (p.score ?? 0), 0) / scored.length)
    : 0;
  const max = scored.reduce((m, p) => Math.max(m, p.score ?? 0), 0);
  const passing = scored.filter((p) => (p.score ?? 0) >= THRESHOLD).length;

  const buckets = bucketize(scored);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.n));

  const sorted = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return (
    <>
      <div className="status" style={{ marginBottom: 16 }}>
        <span className={ok ? "dot-live" : "dot-live dot-off"} />
        {ok ? (
          <span>canlı · {updated ? updated.toLocaleTimeString("tr-TR") : "..."}</span>
        ) : (
          <span className="err">worker'a bağlanılamadı (:3000 açık mı?)</span>
        )}
      </div>

      <section className="tiles">
        <Tile label="Taranan pool" value={pools.length} sub="son 200 kayıt" />
        <Tile label={`Alert (≥${THRESHOLD})`} value={passing} sub={`${alerts.length} gönderildi`} />
        <Tile label="Ortalama skor" value={avg} sub="/ 100" />
        <Tile label="En yüksek skor" value={max} sub="/ 100" />
      </section>

      <div className="card">
        <h2>Skor dağılımı</h2>
        <div className="hist">
          {buckets.map((b) => (
            <div className="col" key={b.label}>
              <span className="n">{b.n}</span>
              <div className="bar" style={{ height: `${(b.n / maxBucket) * 100}%` }} />
              <span className="x">{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Skorlanan coinler</h2>
        {sorted.length === 0 ? (
          <div className="empty">Henüz veri yok — worker taradıkça buraya düşer.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Coin</th>
                <th>Chain</th>
                <th>DEX</th>
                <th>Skor</th>
                <th>Son tarama</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id}>
                  <td className="sym">{p.symbol}</td>
                  <td className="chain">{p.chain}</td>
                  <td className="chain">{p.dex}</td>
                  <td>
                    <ScoreBadge score={p.score ?? 0} />
                  </td>
                  <td className="chain">{timeAgo(p.lastCheckedAt)}</td>
                  <td>
                    <a
                      className="dex"
                      href={`https://dexscreener.com/${p.chain}/${p.pairAddress}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      aç ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

// Status renkleri ikon+etiketle gelir (renk tek basina anlam tasimaz).
function ScoreBadge({ score }: { score: number }) {
  const { color, tier } =
    score >= 80
      ? { color: "var(--good)", tier: "sağlam" }
      : score >= THRESHOLD
        ? { color: "var(--warning)", tier: "orta" }
        : { color: "var(--critical)", tier: "riskli" };
  return (
    <span className="badge">
      <span className="bdot" style={{ background: color }} />
      {Math.round(score)}
      <span className="tier">{tier}</span>
    </span>
  );
}

function bucketize(pools: PoolRow[]) {
  const edges = [0, 20, 40, 60, 80, 100];
  const labels = ["0–20", "20–40", "40–60", "60–80", "80–100"];
  const counts = new Array(5).fill(0);
  for (const p of pools) {
    const s = p.score ?? 0;
    for (let i = 0; i < 5; i++) {
      if (s >= edges[i] && (s < edges[i + 1] || (i === 4 && s <= 100))) {
        counts[i]++;
        break;
      }
    }
  }
  return labels.map((label, i) => ({ label, n: counts[i] }));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m}dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}s önce`;
  return `${Math.floor(h / 24)}g önce`;
}

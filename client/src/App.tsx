import { useEffect, useState, useCallback } from "react";
import type { PoolRow, AlertRow } from "./types.ts";
import { BinanceListings } from "./BinanceListings.tsx";
import {
  Tile,
  Card,
  EmptyState,
  ErrorNote,
  TableSkeleton,
  TableScroll,
  ScoreBadge,
  Confidence,
  PctCell,
  UsdCell,
  timeAgo,
} from "./ui.tsx";

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

// Elek gorunumu: hepsi / esigi gecen / elenen.
type Filter = "all" | "passing" | "gated";

function ScannerView() {
  const [pools, setPools] = useState<PoolRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [pRes, aRes] = await Promise.all([fetch("/api/pools?limit=200"), fetch("/api/alerts")]);
      if (!pRes.ok) throw new Error(`worker ${pRes.status} döndü`);
      const [p, a] = await Promise.all([pRes.json(), aRes.json()]);
      setPools(Array.isArray(p) ? p : []);
      setAlerts(Array.isArray(a) ? a : []);
      setError(null);
    } catch (e) {
      // Hata yutulmaz: sunucunun soyledigi kullaniciya ulasir.
      setError(e instanceof Error ? e.message : "bilinmeyen hata");
    } finally {
      setLoading(false);
      setUpdated(new Date());
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const scored = pools.filter((p) => p.score != null);
  const gated = scored.filter((p) => p.hardFail);
  const passing = scored.filter((p) => !p.hardFail && (p.score ?? 0) >= THRESHOLD);
  // Ortalama SADECE elenmeyenler uzerinden — elenenler 0 oldugu icin
  // ortalamayi asagi cekip anlamsizlastiriyordu.
  const survivors = scored.filter((p) => !p.hardFail);
  const avg = survivors.length
    ? Math.round(survivors.reduce((s, p) => s + (p.score ?? 0), 0) / survivors.length)
    : 0;

  const buckets = bucketize(survivors);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.n));

  const visible = (
    filter === "passing" ? passing : filter === "gated" ? gated : scored
  )
    .slice()
    .sort((a, b) => Number(a.hardFail) - Number(b.hardFail) || (b.score ?? 0) - (a.score ?? 0));

  return (
    <>
      <div className="status" style={{ marginBottom: 16 }}>
        <span className={error ? "dot-live dot-off" : "dot-live"} />
        <span>
          {error ? "bağlantı yok" : "canlı"} · {updated ? updated.toLocaleTimeString("tr-TR") : "…"}
        </span>
      </div>

      {error ? <ErrorNote message={`${error} — worker çalışıyor mu? (:3000)`} /> : null}

      <section className="tiles">
        <Tile label="Taranan pool" value={pools.length} sub="son 200 kayıt" />
        <Tile
          label={`Eşiği geçen (≥${THRESHOLD})`}
          value={passing.length}
          sub={`${alerts.length} alert gönderildi`}
        />
        <Tile
          label="Elendi"
          value={gated.length}
          sub={scored.length ? `${Math.round((gated.length / scored.length) * 100)}% eleme oranı` : "—"}
        />
        <Tile label="Ortalama skor" value={avg} sub="elenenler hariç" />
      </section>

      <Card title="Skor dağılımı · elenenler hariç">
        {survivors.length === 0 ? (
          <EmptyState
            title="Henüz skorlanan coin yok"
            hint="Worker taradıkça dağılım buraya çıkar."
          />
        ) : (
          <div className="hist">
            {buckets.map((b) => (
              <div className="col" key={b.label}>
                <span className="n">{b.n}</span>
                <div className="bar" style={{ height: `${(b.n / maxBucket) * 100}%` }} />
                <span className="x">{b.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="card">
        <div className="card-head">
          <h2>Skorlanan coinler</h2>
          <div className="seg" role="group" aria-label="Filtre">
            <SegBtn on={filter === "all"} onClick={() => setFilter("all")}>
              Hepsi {scored.length}
            </SegBtn>
            <SegBtn on={filter === "passing"} onClick={() => setFilter("passing")}>
              Geçen {passing.length}
            </SegBtn>
            <SegBtn on={filter === "gated"} onClick={() => setFilter("gated")}>
              Elenen {gated.length}
            </SegBtn>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={
              filter === "gated"
                ? "Hiç coin elenmedi"
                : filter === "passing"
                  ? "Eşiği geçen coin yok"
                  : "Henüz veri yok"
            }
            hint={
              filter === "all"
                ? "Worker taradıkça coinler buraya düşer. Çalışmıyorsa RugRadar.cmd'yi başlat."
                : "Filtreyi «Hepsi» yapıp taranan her şeyi görebilirsin."
            }
          />
        ) : (
          <TableScroll>
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Skor</th>
                  <th>Güven</th>
                  <th>Likidite</th>
                  <th>İlk 10</th>
                  <th>Satış</th>
                  <th>1sa al/sat</th>
                  <th>Tarama</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <PoolRowView
                    key={p.id}
                    p={p}
                    open={open === p.id}
                    onToggle={() => setOpen(open === p.id ? null : p.id)}
                  />
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>
    </>
  );
}

function PoolRowView({
  p,
  open,
  onToggle,
}: {
  p: PoolRow;
  open: boolean;
  onToggle: () => void;
}) {
  const hasReasons = p.reasons.length > 0;
  return (
    <>
      <tr className={p.hardFail ? "row-gated" : undefined}>
        <td className="sym">{p.symbol}</td>
        <td>
          <ScoreBadge score={p.score ?? 0} threshold={THRESHOLD} hardFail={p.hardFail} />
        </td>
        <td>
          <Confidence value={p.confidence} />
        </td>
        <td>
          <UsdCell value={p.liquidityUsd} />
        </td>
        <td>
          <PctCell value={p.top10HolderPct} warnAbove={0.6} />
        </td>
        <td>
          <SellCell result={p.honeypotResult} impact={p.sellPriceImpact} />
        </td>
        <td className="chain">
          {p.buys1h != null && p.sells1h != null ? `${p.buys1h}/${p.sells1h}` : "—"}
        </td>
        <td className="chain">{timeAgo(p.lastCheckedAt)}</td>
        <td className="row-actions">
          <button
            className="icon-btn"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? `${p.symbol} gerekçesini gizle` : `${p.symbol} gerekçesini göster`}
            disabled={!hasReasons}
            title={hasReasons ? "Gerekçe" : "Gerekçe kaydedilmemiş"}
          >
            {open ? "▾" : "▸"}
          </button>
          <a
            className="icon-btn link"
            href={`https://dexscreener.com/${p.chain}/${p.pairAddress}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`${p.symbol} DexScreener'da aç`}
          >
            ↗
          </a>
        </td>
      </tr>
      {open && hasReasons ? (
        <tr className="row-detail">
          <td colSpan={9}>
            <div className="reasons">
              <div className="reasons-head">
                {p.hardFail ? "Neden elendi" : "Skor gerekçesi"}
                {p.dex ? <span className="chain"> · {p.dex}</span> : null}
                {p.holderCount != null ? <span className="chain"> · {p.holderCount} holder</span> : null}
              </div>
              <ul>
                {p.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              {p.breakdown ? (
                <div className="bd">
                  {Object.entries(p.breakdown).map(([k, v]) => (
                    <span className="bd-item" key={k}>
                      {factorLabel(k)} <b>{v}</b>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

// Satis testi: sonuc + fiyat etkisi birlikte anlamli.
function SellCell({ result, impact }: { result: string | null; impact: number | null }) {
  if (result === "pass") {
    return (
      <span style={{ color: "var(--good)", fontWeight: 600 }}>
        ✓{impact != null ? ` %${(impact * 100).toFixed(1)}` : ""}
      </span>
    );
  }
  if (result === "fail") return <span style={{ color: "var(--critical)", fontWeight: 600 }}>✕ yok</span>;
  return <span className="chain" title="Jupiter bu token'ı indekslememiş">?</span>;
}

function SegBtn({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={on ? "seg-btn on" : "seg-btn"} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  );
}

function factorLabel(k: string): string {
  const map: Record<string, string> = {
    liquidity: "likidite",
    authority: "yetki",
    distribution: "dağılım",
    honeypot: "satış",
    organic: "organik",
    maturity: "olgunluk",
  };
  return map[k] ?? k;
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

import { useEffect, useState, useCallback } from "react";
import type { BinanceListingRow, BinanceListingsResponse } from "./types.ts";

const REFRESH_MS = 15000; // Binance verisi worker'da 10dk'da bir tazeleniyor; panel sik cekmesin

export function BinanceListings() {
  const [rows, setRows] = useState<BinanceListingRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ok, setOk] = useState(true);

  const load = useCallback(async () => {
    try {
      const r: BinanceListingsResponse = await fetch("/api/binance-listings").then((x) => x.json());
      setRows(Array.isArray(r.rows) ? r.rows : []);
      setUpdatedAt(r.updatedAt);
      setRefreshing(!!r.refreshing);
      setOk(true);
    } catch {
      setOk(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const down = rows.filter((r) => r.sinceListingPct < 0).length;

  return (
    <>
      <section className="tiles">
        <Tile label="Yeni coin (6 ay)" value={String(rows.length)} sub="Binance USDT" />
        <Tile label="Listemeden beri düşen" value={String(down)} sub={`${rows.length} coinden`} />
        <Tile
          label="En sert düşüş"
          value={rows.length ? `${Math.round(rows[0].sinceListingPct)}%` : "—"}
          sub="listelemeden beri"
        />
        <Tile
          label="Durum"
          value={refreshing ? "taranıyor" : "hazır"}
          sub={updatedAt ? new Date(updatedAt).toLocaleTimeString("tr-TR") : "—"}
        />
      </section>

      <div className="card">
        <h2>Son 6 ayda listelenen coinler · en çok düşen üstte</h2>
        {rows.length === 0 ? (
          <div className="empty">
            {refreshing
              ? "Binance taranıyor — ilk turda tüm semboller tarihleniyor, birkaç dakika sürebilir."
              : ok
                ? "Henüz veri yok — worker taradıkça buraya düşer."
                : "worker'a bağlanılamadı (:3000 açık mı?)"}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Coin</th>
                  <th>Listelendi</th>
                  <th>Fiyat</th>
                  <th>Beri %</th>
                  <th>30g</th>
                  <th>7g</th>
                  <th>24s</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol}>
                    <td className="sym">{r.base}</td>
                    <td className="chain">{listedLabel(r.listedAt)}</td>
                    <td className="chain">{fmtPrice(r.currentPrice)}</td>
                    <td><Perf v={r.sinceListingPct} /></td>
                    <td><Perf v={r.d30Pct} /></td>
                    <td><Perf v={r.d7Pct} /></td>
                    <td><Perf v={r.d24Pct} /></td>
                    <td>
                      <a
                        className="dex"
                        href={`https://www.binance.com/en/trade/${r.base}_USDT`}
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
          </div>
        )}
      </div>
    </>
  );
}

// Performans yuzdesi — renk + yon oku (renk tek basina anlam tasimasin diye ok da var).
function Perf({ v }: { v: number | null }) {
  if (v == null) return <span className="chain">—</span>;
  const color = v > 0 ? "var(--good)" : v < 0 ? "var(--critical)" : "var(--muted)";
  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "•";
  return (
    <span style={{ color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
      {arrow} {Math.abs(v).toFixed(1)}%
    </span>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

function listedLabel(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days < 1) return "bugün";
  if (days < 30) return `${days}g önce`;
  const months = Math.floor(days / 30);
  return `${months} ay önce`;
}

function fmtPrice(n: number): string {
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(2)}`;
}

import { useEffect, useState, useCallback } from "react";
import type { BinanceListingRow, BinanceListingsResponse } from "./types.ts";
import { apiGet, DEMO } from "./demo.ts";
import {
  Tile,
  EmptyState,
  ErrorNote,
  TableSkeleton,
  TableScroll,
  Perf,
} from "./ui.tsx";

const REFRESH_MS = 15000; // Binance verisi worker'da 10dk'da bir tazeleniyor; panel sik cekmesin

export function BinanceListings() {
  const [rows, setRows] = useState<BinanceListingRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await apiGet<BinanceListingsResponse>("/api/binance-listings");
      setRows(Array.isArray(r.rows) ? r.rows : []);
      setUpdatedAt(r.updatedAt);
      setRefreshing(!!r.refreshing);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "bilinmeyen hata");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Demo modda veri donuk — periyodik tazeleme bos is.
    if (DEMO) return;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const down = rows.filter((r) => r.sinceListingPct < 0).length;

  return (
    <>
      {error ? <ErrorNote message={`${error} — worker çalışıyor mu? (:3000)`} /> : null}

      <section className="tiles">
        <Tile label="Yeni coin (6 ay)" value={rows.length} sub="Binance USDT" />
        <Tile label="Listelemeden beri düşen" value={down} sub={`${rows.length} coinden`} />
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
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={refreshing ? "Binance taranıyor" : "Henüz veri yok"}
            hint={
              refreshing
                ? "İlk turda tüm semboller tarihleniyor — bir dakika kadar sürer, sonra cache'ten gelir."
                : "Worker taradıkça buraya düşer. Çalışmıyorsa RugRadar.cmd'yi başlat."
            }
          />
        ) : (
          <TableScroll>
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
                    <td className="row-actions">
                      <a
                        className="icon-btn link"
                        href={`https://www.binance.com/en/trade/${r.base}_USDT`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${r.base} Binance'te aç`}
                      >
                        ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </div>
    </>
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

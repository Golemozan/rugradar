// Paylasilan arayuz primitifleri.
// Tile iki ekranda birebir kopyalanmisti — ikinci kez yazilan her kart/rozet
// buraya cikar. Ekranlar burayi tuketir, kendi versiyonunu yazmaz.
import type { ReactNode } from "react";

export function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub: string;
}) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

// Bos durum kuru "veri yok" olmaz: ne oldugunu VE ne yapilmasi gerektigini soyler.
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {hint ? <div className="empty-hint">{hint}</div> : null}
    </div>
  );
}

// Yuklenirken bos durum GOSTERILMEZ — nihai duzenin iskeleti gosterilir.
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <div className="sk-row" key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <div className="sk-cell" key={c} style={{ width: `${cellWidth(c, cols)}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function cellWidth(i: number, cols: number): number {
  if (i === 0) return 18;
  const rest = 82 / (cols - 1);
  return Math.max(8, rest - 2);
}

// Sunucu hatasi yutulmaz — kullaniciya ulasir ve ne yapacagini soyler.
export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="err-note" role="alert">
      <strong>Bağlanılamadı.</strong> {message}
    </div>
  );
}

// Tablolar mobilde yatay tasmasin diye HER tablo bunun icine girer.
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="tscroll">{children}</div>;
}

// Renk tek basina anlam tasimaz: nokta + sayi + metin etiketi birlikte gelir.
export function ScoreBadge({
  score,
  threshold,
  hardFail,
}: {
  score: number;
  threshold: number;
  hardFail?: boolean | null;
}) {
  if (hardFail) {
    return (
      <span className="badge">
        <span className="bdot" style={{ background: "var(--critical)" }} />
        <span className="bscore">—</span>
        <span className="tier">elendi</span>
      </span>
    );
  }
  const { color, tier } =
    score >= 80
      ? { color: "var(--good)", tier: "sağlam" }
      : score >= threshold
        ? { color: "var(--warning)", tier: "orta" }
        : { color: "var(--critical)", tier: "riskli" };
  return (
    <span className="badge">
      <span className="bdot" style={{ background: color }} />
      <span className="bscore">{Math.round(score)}</span>
      <span className="tier">{tier}</span>
    </span>
  );
}

// Veri guveni: 0..1. Dolulugu cubukla, degeri yaziyla — ikisi birlikte.
export function Confidence({ value }: { value: number | null }) {
  if (value == null) return <span className="chain">—</span>;
  const pct = Math.round(value * 100);
  const low = value < 0.5;
  return (
    <span className="conf" title={low ? "Veri güveni düşük — skor tavanlandı" : undefined}>
      <span className="conf-track">
        <span
          className="conf-fill"
          style={{
            width: `${pct}%`,
            background: low ? "var(--warning)" : "var(--baseline)",
          }}
        />
      </span>
      <span className="conf-n">%{pct}</span>
    </span>
  );
}

// Yuzde degeri + esik asildiginda uyari tonu.
export function PctCell({ value, warnAbove }: { value: number | null; warnAbove?: number }) {
  if (value == null) return <span className="chain">—</span>;
  const warn = warnAbove != null && value > warnAbove;
  return (
    <span style={{ color: warn ? "var(--critical)" : undefined, fontWeight: warn ? 650 : undefined }}>
      %{Math.round(value * 100)}
    </span>
  );
}

export function UsdCell({ value }: { value: number | null }) {
  if (value == null) return <span className="chain" title="Bildirilmedi (pumpfun bonding curve)">yok</span>;
  return <span>${compact(value)}</span>;
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

// Performans yuzdesi — renk + yon oku (renk tek basina anlam tasimasin diye).
export function Perf({ v }: { v: number | null }) {
  if (v == null) return <span className="chain">—</span>;
  const color = v > 0 ? "var(--good)" : v < 0 ? "var(--critical)" : "var(--muted)";
  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "•";
  return (
    <span style={{ color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
      {arrow} {Math.abs(v).toFixed(1)}%
    </span>
  );
}

export function timeAgo(iso: string | number): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m}dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}s önce`;
  return `${Math.floor(h / 24)}g önce`;
}

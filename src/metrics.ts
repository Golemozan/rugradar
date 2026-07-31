/*
 * Sureç ici sayaclar.
 *
 * Prometheus kurmadan da "ne kadar hizli calisiyor" sorusunun cevabi olsun diye.
 * Tek process oldugu icin bellek yeterli; restart'ta sifirlanmasi kabul.
 *
 * p95 icin butun sureleri tutmuyoruz — son N olcum yeterli, sabit bellek.
 */

const WINDOW = 500;

let scannedTotal = 0;
let skippedTotal = 0; // pair bulunamadi
let alertsTotal = 0;
let errorsTotal = 0;
const durations: number[] = [];
const startedAt = Date.now();

export function recordScan(durationMs: number, scanned: boolean): void {
  if (scanned) scannedTotal++;
  else skippedTotal++;

  durations.push(durationMs);
  if (durations.length > WINDOW) durations.shift();
}

export function recordAlert(): void {
  alertsTotal++;
}

export function recordScanError(): void {
  errorsTotal++;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx]);
}

export function snapshot() {
  const sorted = [...durations].sort((a, b) => a - b);
  const total = durations.reduce((a, b) => a + b, 0);
  return {
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    scans: {
      scanned: scannedTotal,
      skipped: skippedTotal,
      errors: errorsTotal,
      alerts: alertsTotal,
    },
    durationMs: {
      samples: durations.length,
      avg: durations.length ? Math.round(total / durations.length) : 0,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted.length ? Math.round(sorted[sorted.length - 1]) : 0,
    },
  };
}

/** Test/bench icin. */
export function resetMetrics(): void {
  scannedTotal = 0;
  skippedTotal = 0;
  alertsTotal = 0;
  errorsTotal = 0;
  durations.length = 0;
}

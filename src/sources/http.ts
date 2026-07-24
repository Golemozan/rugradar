// Ortak fetch: timeout + retry + backoff. Tum dis API cagrilari bundan gecer.
export async function getJson<T>(
  url: string,
  opts: { timeoutMs?: number; retries?: number } = {}
): Promise<T | null> {
  const { timeoutMs = 8000, retries = 2 } = opts;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });
      clearTimeout(t);

      if (res.status === 429) {
        // rate limit -> backoff
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      clearTimeout(t);
      if (attempt === retries) return null;
      await sleep(300 * Math.pow(2, attempt));
    }
  }
  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

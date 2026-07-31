import Redis from "ioredis";

/*
 * Tekrar-tarama cache'i.
 *
 * Eskiden bu is scan.ts icinde bir `Map` ile yapiliyordu. Uc sorunu vardi:
 *   1. Process yeniden baslayinca butun gecmis ucuyordu -> ayni pool tekrar taraniyordu.
 *   2. Ikinci bir worker acilinca iki process birbirinin isaretini gormuyordu.
 *   3. "oku, sonra yaz" iki ayri adimdi; es zamanli iki is ayni adresi ayni anda
 *      gecirebiliyordu (TOCTOU). Seri dongude gorunmez, es zamanli calisinca gorunur.
 *
 * Redis tarafinda `SET key NX PX ttl` ucunu de cozer: tek komut, atomik, paylasimli.
 * REDIS_URL yoksa bellek modu devrede kalir — repoyu klonlayan Redis kurmak zorunda degil.
 */

export type CacheMode = "redis" | "memory";

let redis: Redis | null = null;
let mode: CacheMode = "memory";

/** TTL'i saklayan bellek yedegi. Redis yoksa tek process icin yeterli. */
const memory = new Map<string, number>();

const url = process.env.REDIS_URL?.trim();
if (url) {
  redis = new Redis(url, {
    maxRetriesPerRequest: null, // BullMQ ayni baglanti ayarini bekliyor
    lazyConnect: false,
  });
  redis.on("error", (e) => console.error("[cache] redis hatasi:", e.message));
  mode = "redis";
}

export function cacheMode(): CacheMode {
  return mode;
}

/**
 * Anahtari "gorulmus" diye isaretler.
 * @returns ilk kez isaretlendiyse true; TTL suresi icinde zaten varsa false.
 */
export async function markSeen(key: string, ttlMs: number): Promise<boolean> {
  if (redis) {
    try {
      // NX: sadece yoksa yaz. PX: milisaniye cinsinden TTL. Donen "OK" ise ilk defadir.
      const res = await redis.set(key, "1", "PX", ttlMs, "NX");
      return res === "OK";
    } catch (e) {
      // Redis dustuyse tarama durmasin — bellek moduna dus.
      console.error("[cache] redis erisilemedi, bellek moduna dusuldu:", (e as Error).message);
      return markSeenInMemory(key, ttlMs);
    }
  }
  return markSeenInMemory(key, ttlMs);
}

function markSeenInMemory(key: string, ttlMs: number): boolean {
  const now = Date.now();
  const expiresAt = memory.get(key);
  if (expiresAt != null && expiresAt > now) return false;
  memory.set(key, now + ttlMs);
  pruneMemory(now);
  return true;
}

/** Suresi dolmus anahtarlari at — Map sinirsiz buyumesin. */
function pruneMemory(now: number): void {
  if (memory.size < 5000) return; // her cagride gezmenin anlami yok
  for (const [k, exp] of memory) {
    if (exp <= now) memory.delete(k);
  }
}

/** Test ve kapanis icin. */
export function resetCache(): void {
  memory.clear();
}

export async function closeCache(): Promise<void> {
  memory.clear();
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

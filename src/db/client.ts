import { PrismaClient } from "@prisma/client";

/*
 * Tek Prisma instance (hot-reload'da coklu baglanti olmasin).
 *
 * Es zamanlilik notu: kuyruk modunda birden fazla is ayni anda DB'ye yaziyor.
 * SQLite tek yazara izin verir; birden fazla baglanti ayni anda yazmaya
 * kalkarsa SQLITE_BUSY firlar. Cozum havuzu 1'e sabitlemek: AG isi es zamanli
 * kalir (asil darbogaz zaten orasi), DB yazimlari Prisma havuzunda siraya girer.
 *
 * Postgres'e gecilirse bu sinir uygulanmaz — orada es zamanli yazim sorun degil.
 */
function resolveUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  if (!url.startsWith("file:")) return url; // postgres vb. -> dokunma
  if (url.includes("connection_limit=")) return url; // kullanici acikca ayarlamis
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=1`;
}

const url = resolveUrl();

export const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

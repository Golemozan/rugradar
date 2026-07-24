import { PrismaClient } from "@prisma/client";

// Tek Prisma instance (hot-reload'da coklu baglanti olmasin).
export const prisma = new PrismaClient();

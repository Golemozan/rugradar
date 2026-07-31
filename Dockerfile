# --- build asamasi ---------------------------------------------------------
# devDependencies sadece burada duruyor; calisma imajina tasinmiyor.
FROM node:24-slim AS build

WORKDIR /app

# Prisma engine'leri OpenSSL istiyor (slim imajda yok).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Once manifest, sonra kaynak: kaynak degistiginde npm ci katmani cache'ten gelir.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

# --- calisma asamasi -------------------------------------------------------
FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Uretilmis Prisma client (build asamasinda olusturuldu) + derlenmis JS
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

# root olarak kosma
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Migration'lar acilista uygulanir — bos volume ile ilk kalkis calissin.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/worker/index.js"]

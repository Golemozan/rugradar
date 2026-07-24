-- CreateTable
CREATE TABLE "Pool" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chain" TEXT NOT NULL,
    "pairAddress" TEXT NOT NULL,
    "baseTokenAddress" TEXT NOT NULL,
    "baseTokenSymbol" TEXT NOT NULL,
    "quoteTokenSymbol" TEXT NOT NULL,
    "dex" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Check" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "poolId" INTEGER NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liquidityLocked" BOOLEAN,
    "liquidityLockPct" REAL,
    "ownershipRenounced" BOOLEAN,
    "topHolderPct" REAL,
    "honeypotResult" TEXT,
    "volumeLiquidityRatio" REAL,
    "rawResponse" TEXT,
    CONSTRAINT "Check_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Score" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "checkId" INTEGER NOT NULL,
    "score" REAL NOT NULL,
    "breakdown" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Score_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "poolId" INTEGER NOT NULL,
    "scoreId" INTEGER NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "telegramMessageId" TEXT,
    "channel" TEXT NOT NULL,
    CONSTRAINT "Alert_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Alert_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "Score" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RobinhoodWatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "RobinhoodPrice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Pool_pairAddress_key" ON "Pool"("pairAddress");

-- CreateIndex
CREATE INDEX "Pool_chain_idx" ON "Pool"("chain");

-- CreateIndex
CREATE INDEX "Pool_lastCheckedAt_idx" ON "Pool"("lastCheckedAt");

-- CreateIndex
CREATE INDEX "Check_poolId_idx" ON "Check"("poolId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_checkId_key" ON "Score"("checkId");

-- CreateIndex
CREATE INDEX "Alert_poolId_idx" ON "Alert"("poolId");

-- CreateIndex
CREATE INDEX "Alert_sentAt_idx" ON "Alert"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "RobinhoodWatch_symbol_key" ON "RobinhoodWatch"("symbol");

-- CreateIndex
CREATE INDEX "RobinhoodPrice_symbol_idx" ON "RobinhoodPrice"("symbol");

import { Bot } from "grammy";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { ScoreResult } from "../scoring/types.js";
import type { DexPair } from "../sources/dexscreener.js";
import { analyzeUrl } from "../lookup/analyze.js";

// Token yoksa bot baslamaz -> alert loglanir, gonderilmez.
const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const CHATID_FILE = ".chatid";

let chatId = process.env.TELEGRAM_CHAT_ID?.trim() || loadChatId();

const bot = token ? new Bot(token) : null;

export function telegramConfigured(): boolean {
  return !!bot;
}
export function currentChatId(): string | null {
  return chatId;
}

// Botu dinlemeye basla: gelen mesajdan chat id yakala + DexScreener linki gelirse analiz et.
// bot.start() long-polling yapar; bu yuzden getUpdates'i AYRICA cagirmayiz.
export function startBot(): void {
  if (!bot) return;

  bot.command("start", (ctx) => {
    captureChat(ctx.chat.id);
    return ctx.reply(
      "👋 RugRadar bagli.\n\n" +
        "Bir coini incelemek icin DexScreener linkini yapistir yeter.\n" +
        "Ornek: https://dexscreener.com/solana/<pair>\n\n" +
        "Esigi gecen coinler otomatik buraya duser."
    );
  });

  bot.on("message:text", async (ctx) => {
    captureChat(ctx.chat.id);
    const text = ctx.message.text.trim();
    if (/dexscreener\.com\//.test(text) || /^[A-Za-z0-9]{25,}$/.test(text)) {
      await ctx.replyWithChatAction("typing").catch(() => {});
      const report = await analyzeUrl(text);
      await ctx.reply(report, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    }
  });

  bot.catch((err) => console.error("[telegram] bot hatasi:", err.message));
  bot.start({ onStart: (i) => console.log(`[telegram] @${i.username} dinliyor`) }).catch((e) =>
    console.error("[telegram] start hatasi:", e)
  );
}

// Alert mesajini gonder. Basarili olursa message_id doner.
export async function sendAlert(pair: DexPair, result: ScoreResult): Promise<string | null> {
  const text = formatAlert(pair, result);
  if (!bot) {
    console.log("[telegram] token yok — alert loglandi:\n" + text);
    return null;
  }
  if (!chatId) {
    console.log("[telegram] chat id yok (bota mesaj at) — alert loglandi:\n" + text);
    return null;
  }
  try {
    const msg = await bot.api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    return String(msg.message_id);
  } catch (e) {
    console.error("[telegram] gonderim hatasi:", e);
    return null;
  }
}

// --- chat id kalicilastirma (restart'ta kaybolmasin) ---
function captureChat(id: number): void {
  const s = String(id);
  if (chatId === s) return;
  chatId = s;
  try {
    writeFileSync(CHATID_FILE, s, "utf8");
    console.log(`[telegram] chat id yakalandi: ${s}`);
  } catch {
    /* yazamazsa bellekte tutariz */
  }
}
function loadChatId(): string | null {
  try {
    if (existsSync(CHATID_FILE)) return readFileSync(CHATID_FILE, "utf8").trim() || null;
  } catch {
    /* yok say */
  }
  return null;
}

function formatAlert(pair: DexPair, r: ScoreResult): string {
  const sym = pair.baseToken.symbol;
  const liq = pair.liquidity?.usd ? `$${Math.round(pair.liquidity.usd).toLocaleString()}` : "?";
  const url = `https://dexscreener.com/${pair.chainId}/${pair.pairAddress}`;
  const reasons = r.reasons.map((x) => `• ${escapeHtml(x)}`).join("\n");
  return (
    `🟢 <b>${escapeHtml(sym)}</b> — skor <b>${r.score}</b>/100\n` +
    `chain: ${pair.chainId} | dex: ${pair.dexId} | likidite: ${liq}\n\n` +
    `${reasons}\n\n` +
    `<a href="${url}">DexScreener'da ac</a>`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const TelegramBot = require('node-telegram-bot-api');
const cron        = require('node-cron');
const axios       = require('axios');
require('dotenv').config();

const { initializeDB, readDB, withDB } = require('./db');
const { withRetry }                    = require('./retry');

const bot          = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const SUPPORT_TEXT = `\n\n_For any issues, contact support: @${process.env.TELEGRAM_SUPPORT_USERNAME}_`;

// Ensure the database file exists before the bot starts handling messages
initializeDB();

// ==========================================
// HELPER: Check if user is admin (chat ID match only — no session check)
// ==========================================
function isAdmin(chatId) {
    return chatId.toString() === (process.env.TELEGRAM_CHAT_ID || '').trim();
}

// ==========================================
// SESSION GATE: Admin authentication store
// ==========================================
// All three sets are keyed by chatId.toString().
// They reset on every bot process restart (in-memory only, by design).
const verifiedSessions = new Set(); // chat IDs that passed the gate this session
const blockedUsers     = new Set(); // chat IDs that sent a wrong chat ID
const challengedUsers  = new Set(); // chat IDs that received the challenge prompt

/** Returns true only if chatId has been verified this session. */
function isVerified(chatId) {
    return verifiedSessions.has(chatId.toString());
}

/**
 * Used by all admin command handlers.
 * Requires BOTH the correct chat ID AND an active session verification.
 * Returns silently on failure — the gate handler manages all user-facing messages.
 */
function isAuthorized(chatId) {
    return isAdmin(chatId) && isVerified(chatId);
}

// ==========================================
// HELPER: Safe sendMessage (logs but never throws)
// ==========================================
async function safeSend(chatId, text, options = {}) {
    try {
        await withRetry(
            () => bot.sendMessage(chatId, text, options),
            { label: `telegram:sendMessage:${chatId}`, maxRetries: 3, baseDelayMs: 1000 }
        );
    } catch (err) {
        console.error(`❌ [safeSend] Failed to send message to ${chatId} after retries:`, err.message);
    }
}

// ==========================================
// HELPER: Generate a new Chargily renewal link
// ==========================================
async function createRenewalLink(student) {
    const payload = {
        amount:      2000,
        currency:    'dzd',
        description: `Renouvellement: ${student.firstName} ${student.lastName}`,
        client_name: `${student.firstName} ${student.lastName}`,
        client_email:'student@example.com',
        back_url:    `${process.env.FRONTEND_URL}/payment.html`,
        webhook_url: `${process.env.BACKEND_URL}/api/webhook/chargily`
    };

    const res = await withRetry(
        () => axios.post('https://pay.chargily.net/api/v2/checkouts', payload, {
            headers: {
                'Authorization': `Bearer ${process.env.CHARGILY_SECRET_KEY_2}`,
                'Content-Type': 'application/json'
            }
        }),
        { label: 'chargily:renewal-link' }
    );

    // withDB acquires the cross-process lock before updating the student record
    await withDB(db => {
        const idx = db.findIndex(s => s.chatId && s.chatId.toString() === student.chatId.toString());
        if (idx !== -1) {
            db[idx].invoiceId         = res.data.id;
            db[idx].status            = 'pending';
            db[idx].linkSentTimestamp = new Date().toISOString();
        }
    });

    return res.data.checkout_url;
}

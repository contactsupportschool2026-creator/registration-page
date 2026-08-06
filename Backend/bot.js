const TelegramBot = require('node-telegram-bot-api');
const cron        = require('node-cron');
const axios       = require('axios');
require('dotenv').config();

const { initializeDB, readDB, withDB } = require('./db');
const { withRetry }                    = require('./retry');

const bot          = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const SUPPORT_TEXT = `\n\n_For any issues, contact support: @${process.env.TELEGRAM_SUPPORT_USERNAME}_`;

// Ensure the database file exists before the bot starts handling messages
// Ensure the database file exists before the bot starts handling messages
try {
    initializeDB();
} catch (err) {
    console.error('❌ FATAL: Failed to initialize database:', err.message);
    process.exit(1);
}

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
        description: `Renouvellement: ${student.fullName}`,
        client_name: student.fullName,
        client_email: student.email || 'student@example.com',
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
            db[idx].renewalInvoiceId   = res.data.id;
            db[idx].status            = 'pending';
            db[idx].linkSentTimestamp = new Date().toISOString();
        }
    });

    return res.data.checkout_url;
}

// ==========================================
// FEATURE 1: STUDENT REGISTERS THEIR TELEGRAM ID
// ==========================================
// ==========================================
// GLOBAL MESSAGE GATE
// Intercepts every incoming message before command handlers run.
// Exempt: /start <token>  — used by students for account linking, no auth needed.
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text   = (msg.text || '').trim();

    // ── Exempt: student onboarding link (/start <invoiceId>) ────────────────
    if (/^\/start\s+\S+/.test(text)) return;

    // ── If user has an active score prompt ──
    if (pendingScoreQueries.has(chatId)) {
        return handleScoreQuery(chatId, text);
    }

    // ── If user has an active extend prompt ──
    if (pendingExtendQueries.has(chatId)) {
        return handleExtendQuery(chatId, text);
    }

    // ── If user has an active delete prompt ──
    if (pendingDeleteQueries.has(chatId)) {
        pendingDeleteQueries.delete(chatId);
        return handleDeleteQuery(chatId, text);
    }

    // ── If user has an active status-change prompt, treat this message as their student query ──
    if (pendingStatusQueries.has(chatId)) {
        pendingStatusQueries.delete(chatId);
        return handleStatusQuery(chatId, text);
    }

    // ── If user has an active search prompt, treat this message as their search query ──
    if (pendingSearches.has(chatId)) {
        pendingSearches.delete(chatId);
        return handleSearchQuery(chatId, text);
    }
        // ── If user has an active export prompt ──
    if (pendingExportQueries.has(chatId)) {
        pendingExportQueries.delete(chatId);
        return handleExportQuery(chatId, text);
    }

    // ── Already verified this session → let command handlers run ────────────
    if (isVerified(chatId)) return;

    // ── Permanently blocked this session → silently ignore ──────────────────
    if (blockedUsers.has(chatId)) return;

    const adminId = (process.env.TELEGRAM_CHAT_ID || '').trim();

    // ── User was challenged; this message is their chat ID response ──────────
    if (challengedUsers.has(chatId)) {
        challengedUsers.delete(chatId);
        if (text === adminId) {
            verifiedSessions.add(chatId);
            await safeSend(chatId, '✅ *Access granted.* Welcome, Admin!', { parse_mode: 'Markdown' });
        } else {
            blockedUsers.add(chatId);
            await safeSend(chatId, '⛔ Access denied. This bot is restricted to the admin only.');
        }
        return;
    }

    // ── First contact (or first message after restart) → send challenge ──────
    challengedUsers.add(chatId);
    await safeSend(
        chatId,
        '🔐 *Admin access required.*\n\nPlease send your Chat ID to continue.',
        { parse_mode: 'Markdown' }
    );
});

// ==========================================
// FEATURE: AUTO-LINK STUDENT ON GROUP JOIN
// ==========================================
// Silentely watches for new members joining the Telegram group.
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id.toString();
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;

    // Only proceed if this is the designated group
    if (chatId !== groupChatId) return;

    for (const newMember of msg.new_chat_members) {
        // Ignore bots joining
        if (newMember.is_bot) continue;

        const username = newMember.username ? `@${newMember.username}` : null;
        if (!username) continue; // Can't match without a public username

        try {
            let studentName = null;
            let alreadyLinked = false;

            await withDB(db => {
                // Find student by the username they typed in the form
                const student = db.find(s => s.username && s.username.toLowerCase() === username.toLowerCase());
                if (student) {
                    // If chatId is already saved, we don't need to do anything
                    if (!student.chatId) {
                        student.chatId = newMember.id.toString();
                    }
                    studentName = student.fullName;
                }
            });

            if (studentName) {
                console.log(`✅ Auto-linked ${username} (${studentName}) to the database via group join.`);
            } else {
                console.log(`⚠️ User ${username} joined the group but is not in the database.`);
                // Optional: Notify admin that an unknown user joined
                // await safeSend(process.env.TELEGRAM_CHAT_ID, `⚠️ Unknown user ${username} joined the group.`);
            }
        } catch (err) {
            console.error('❌ [new_chat_members] Error:', err.message);
        }
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// STUDENT COMMAND: /start <invoiceId>  (exempt from the gate above)
// ─────────────────────────────────────────────────────────────────────────────
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId    = msg.chat.id;
    const invoiceId = match[1];

    try {
        let studentName = null;

    await withDB(db => {
        const student = db.find(s => s.invoiceId === invoiceId);
        if (student) {
            student.chatId = chatId.toString(); // always store as string
            studentName    = student.fullName; // Updated to fullName
        }
    });

        if (studentName) {
            await safeSend(chatId, `✅ Welcome ${studentName}! Your Telegram account is now linked to our system.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        } else {
            await safeSend(chatId, `❌ Invoice ID not recognized. Make sure you clicked the correct link after payment.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('❌ [/start] Error:', error.message);
        await safeSend(chatId, `⚠️ A system error occurred while linking your account. Please try again or contact support.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// PENDING SEARCH STORE: users who typed /search and are awaiting their query
// ==========================================
const pendingSearches = new Set(); // chat IDs awaiting a search query

// ==========================================
// ADMIN COMMAND: /search - Find Students by name, invoice ID, or any field
// ==========================================
// Usage: Just type /search (no arguments).
// The bot will ask for a name, invoice ID, or keyword, then search across all student fields.
bot.onText(/^\/search$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    pendingSearches.add(chatId.toString());
    await safeSend(
        chatId,
        '🔍 *Search Students*\n\nType a name, invoice ID, or any keyword related to the student (wilaya, specialty, school name, etc.).\n\nI\'ll find all matching students.',
        { parse_mode: 'Markdown' }
    );
});

// ── Handle the search query (captured via the message gate below) ──
async function handleSearchQuery(chatId, query) {
    try {
        let db;
        try {
            db = await readDB();
        } catch (readErr) {
            console.error('❌ [/search] Failed to read DB:', readErr.message);
            return safeSend(chatId, '⚠️ *Database read failed.* Please try again.', { parse_mode: 'Markdown' });
        }

        if (!Array.isArray(db) || db.length === 0) {
            return safeSend(chatId, '📭 *No students in the database.*', { parse_mode: 'Markdown' });
        }

        const q = query.toLowerCase();
        const results = db.filter(s => {
            return (
                (s.fullName && s.fullName.toLowerCase().includes(q)) ||
                (s.username && s.username.toLowerCase().includes(q)) ||
                (s.invoiceId && s.invoiceId.toLowerCase().includes(q)) ||
                (s.wilaya && s.wilaya.toLowerCase().includes(q)) ||
                (s.shaba && s.shaba.toLowerCase().includes(q)) ||
                (s.schoolName && s.schoolName.toLowerCase().includes(q)) ||
                (s.dob && s.dob.includes(q)) ||
                (s.status && s.status.toLowerCase().includes(q)) ||
                (s.chatId && s.chatId.toString().includes(q))
            );
        });

        if (results.length === 0) {
            return safeSend(chatId, `🔍 No students found matching "*${query}*"`, { parse_mode: 'Markdown' });
        }

        if (results.length === 1) {
            // Single match — show full card immediately
            return safeSend(chatId, formatStudentCard(results[0]), { parse_mode: 'Markdown' });
        }

        // Multiple matches — show compact list, each with invoice ID for further lookup
        let lines = [];
        lines.push(`🔍 *${results.length} students found for "${query}":*
`);
        results.forEach((s, i) => {
            lines.push(`*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\` — ${s.status}`);
        });
        lines.push('');

        // Build safely by lines
        let chunk = '';
        for (const line of lines) {
            const maybe = chunk + line + '\n';
            if (maybe.length > 4000) {
                await safeSend(chatId, chunk, { parse_mode: 'Markdown' });
                chunk = line + '\n';
            } else {
                chunk = maybe;
            }
        }
        if (chunk.trim()) {
            await safeSend(chatId, chunk, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('❌ [/search] Error:', error.message);
        await safeSend(chatId, `⚠️ Failed to search students: ${error.message}`, { parse_mode: 'Markdown' });
    }
}

// ==========================================
// ==========================================
// PENDING STATUS QUERY STORE: users who typed /updatestatus and need to pick a student
// ==========================================
const pendingStatusQueries     = new Set(); // chat IDs awaiting a student name for status change


// ADMIN COMMAND: /updatestatus - Change Student Status
// ==========================================
// Just type /updatestatus (no arguments). Bot asks for a name/ID, then shows status buttons.
bot.onText(/^\/updatestatus$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    pendingStatusQueries.add(chatId.toString());
    await safeSend(
        chatId,
        '🔧 *Update Status*\n\nType the student\'s name or invoice ID to find them.',
        { parse_mode: 'Markdown' }
    );
});

// ── Handle the status query (intercepted by message gate) ──
async function handleStatusQuery(chatId, query) {
    try {
        let db;
        try {
            db = await readDB();
        } catch (readErr) {
            console.error('❌ [/updatestatus] DB read failed:', readErr.message);
            return safeSend(chatId, '⚠️ *Database read failed.* Please try again.', { parse_mode: 'Markdown' });
        }

        if (!Array.isArray(db) || db.length === 0) {
            return safeSend(chatId, '📭 *No students in the database.*', { parse_mode: 'Markdown' });
        }

        const q = text.toLowerCase();
        const results = db.filter(s => {
            const fullName = (s.fullName || '').toLowerCase();
            return fullName.includes(q) ||
                   (s.fullName && s.fullName.toLowerCase().includes(q)) ||
                   (s.invoiceId && s.invoiceId.toLowerCase().includes(q));
        });

        if (results.length === 0) {
            return safeSend(chatId, `🔍 No students found matching "*${query}*"`, { parse_mode: 'Markdown' });
        }

        if (results.length === 1) {
            // One match — show status buttons immediately
            return showStatusButtons(chatId, results[0]);
        }

        // Multiple matches — show compact list, let them re-type a more specific query
        let msg = `🔍 *${results.length} students found for "${query}":*\n\n`;
        results.forEach((s, i) => {
            msg += `*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\` — ${s.status}\n`;
        });
        msg += `\nType a more specific name or invoice ID to narrow it down.`;

        pendingStatusQueries.add(chatId.toString()); // keep them in query mode
        await safeSend(chatId, msg, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('❌ [/updatestatus] Error:', error.message);
        await safeSend(chatId, `⚠️ Failed: ${error.message}`, { parse_mode: 'Markdown' });
    }
}

// ── Show the status buttons for a given student ──
async function showStatusButtons(chatId, student) {
    const buttons = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🟢 Paid',      callback_data: `setstatus|${student.invoiceId}|paid` },
                    { text: '🟡 Pending',   callback_data: `setstatus|${student.invoiceId}|pending` },
                ],
                [
                    { text: '🟠 Warned',    callback_data: `setstatus|${student.invoiceId}|warned` },
                    { text: '🔴 Kicked',    callback_data: `setstatus|${student.invoiceId}|kicked` },
                ],
            ]
        }
    };

    await safeSend(
        chatId,
        `🔧 *Update Status*\n\n*Student:* ${student.firstName} ${student.lastName}\n*Invoice:* \`${student.invoiceId}\`\n*Current Status:* ${student.status}\n\nSelect the new status:`,
        { parse_mode: 'Markdown', ...buttons }
    );
}



// ==========================================
// PENDING DELETE STORE: users who typed /delete and need to pick a student
// ==========================================
const pendingDeleteQueries = new Set(); // chat IDs awaiting a student name for deletion

// ==========================================
// ADMIN COMMAND: /delete - Remove Student Record
// ==========================================
// Step 1: /delete → bot asks for name
// Step 2: Type name → bot finds student
// Step 3: Bot shows confirmation buttons [Delete] [Cancel]
bot.onText(/^\/delete$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    pendingDeleteQueries.add(chatId.toString());
    await safeSend(
        chatId,
        '🗑 *Delete Student*\n\nType the student\'s name or invoice ID to find them.',
        { parse_mode: 'Markdown' }
    );
});

// ── Handle /delete query (intercepted by message gate) ──
async function handleDeleteQuery(chatId, text) {
    try {
        const db = await readDB();
        const q = text.toLowerCase();
        const results = db.filter(s => {
            const fullName = (s.fullName || '').toLowerCase();
            return fullName.includes(q) ||
                   (s.fullName && s.fullName.toLowerCase().includes(q)) ||
                   (s.invoiceId && s.invoiceId.toLowerCase().includes(q));
        });

        if (results.length === 0) {
            pendingDeleteQueries.add(chatId.toString());
            return safeSend(chatId, `🔍 No students found matching "*${text}*". Try again.`, { parse_mode: 'Markdown' });
        }

        if (results.length > 1) {
            let msg = `🔍 *${results.length} students found for "${text}":*\n\n`;
            results.forEach((s, i) => {
                msg += `*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\` — ${s.status}\n`;
            });
            msg += `\nType a more specific name.`;
            pendingDeleteQueries.add(chatId.toString());
            return safeSend(chatId, msg, { parse_mode: 'Markdown' });
        }

        // One match — show confirmation buttons
        const student = results[0];
        const buttons = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '🗑 Yes, Delete', callback_data: `deleteconfirm|${student.invoiceId}` },
                        { text: '❌ Cancel',     callback_data: 'deletecancel' },
                    ],
                ]
            }
        };

        await safeSend(
            chatId,
            `⚠️ *Confirm Delete*\n\n*Student:* ${student.firstName} ${student.lastName}\n*Invoice:* \`${student.invoiceId}\`\n*Status:* ${student.status}\n\nThis cannot be undone. Are you sure?`,
            { parse_mode: 'Markdown', ...buttons }
        );
    } catch (err) {
        console.error('❌ [/delete] Error:', err.message);
        await safeSend(chatId, '⚠️ Failed: ' + err.message, { parse_mode: 'Markdown' });
    }
}

// ── Handle callback queries (delete, export, status) ──
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data   = query.data;

    if (!data) return;

    // ── Handle export buttons ──
    if (data === 'exportall') {
        try {
            await bot.answerCallbackQuery(query.id);
            const db = await readDB();
            if (db.length === 0) {
                await bot.editMessageText('📭 *No students in database.*', { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
                return;
            }
            await bot.editMessageText(`⏳ Generating PDF for *${db.length}* student(s)…`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });

            const rawDb = await readDB(); // proper DB read through lock
            const { generateStudentsPDF } = require('./pdf');
            const pdfBuffer = await generateStudentsPDF(rawDb);
            const datePart = new Date().toISOString().split('T')[0];

            await bot.sendDocument(chatId, pdfBuffer, { caption: `📄 All students — ${rawDb.length} student(s) — ${datePart}` }, { filename: `students-${datePart}.pdf`, contentType: 'application/pdf' });
        } catch (err) {
            console.error('❌ [/exportpdf all] Error:', err.message);
            try { await safeSend(chatId, `⚠️ Failed: ${err.message}`); } catch (_) {}
        }
        return;
    }

    // Handle delete confirm
    if (data.startsWith('deleteconfirm|')) {
        const invoiceId = data.split('|')[1];

        try {
            let deleted = null;
            await withDB(db => {
                const idx = db.findIndex(s => s.invoiceId === invoiceId);
                if (idx !== -1) {
                    deleted = db.splice(idx, 1)[0];
                }
            });

            if (!deleted) {
                await bot.answerCallbackQuery(query.id, { text: '❌ Student not found.' });
                await bot.editMessageText(
                    `⚠️ *Delete Failed*\n\nStudent with invoice \`${invoiceId}\` was not found. They may have already been deleted.`,
                    { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
                );
                return;
            }

            const name = `${deleted.firstName} ${deleted.lastName}`;
            await bot.answerCallbackQuery(query.id, { text: '✅ Student deleted.' });
            await bot.editMessageText(
                `✅ *Student Deleted*\n\n*Name:* ${name}\n*Invoice:* \`${invoiceId}\`\n*Status was:* ${deleted.status}`,
                { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('❌ [/delete confirm] Error:', err.message);
            try { await bot.answerCallbackQuery(query.id, { text: '⚠️ Failed.' }); } catch (_) {}
        }
        return;
    }

    // Handle delete cancel
    if (data === 'deletecancel') {
        await bot.answerCallbackQuery(query.id, { text: '❌ Deletion cancelled.' });
        await bot.editMessageText(
            `❌ *Deletion Cancelled*\n\nNo changes were made.`,
            { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
        );
        return;
    }

    // ── Handle status button clicks ──
    if (data.startsWith('setstatus|')) {
        const parts = data.split('|');
        if (parts.length === 3) {
            const [, invoiceId, newStatus] = parts;
            try {
                let updated = null;
                await withDB(db => {
                    const student = db.find(s => s.invoiceId === invoiceId);
                    if (student) {
                        updated = { name: `${student.firstName} ${student.lastName}`, old: student.status };
                        student.status = newStatus;

                        // If setting to paid, set/refresh the 30-day subscription period
                        if (newStatus === 'paid') {
                            const now = new Date();
                            // Always reset start date to now when manually setting to paid
                            student.subscriptionStartDate = now.toISOString();
                            const exp = new Date(now);
                            exp.setDate(exp.getDate() + 30);
                            student.subscriptionEndDate = exp.toISOString();
                            // Clear warning/kick flags
                            student.warnedTimestamp = null;
                            student.linkSentTimestamp = null;
                        }
                    }
                });

                if (!updated) {
                    await bot.answerCallbackQuery(query.id, { text: '❌ Student not found.' });
                    return;
                }
                let extra = '';
                if (newStatus === 'paid') {
                    const db2 = await readDB();
                    const s = db2.find(x => x.invoiceId === invoiceId);
                    if (s && s.subscriptionEndDate) {
                        extra = `\n*Expires:* ${s.subscriptionEndDate.split('T')[0]} (+30 days)`;
                    }
                }
                await bot.editMessageText(
                    `✅ *Status Updated*\n\n*Student:* ${updated.name}\n*Invoice:* \`${invoiceId}\`\n*From:* ${updated.old}\n*To:* ${newStatus}${extra}`,
                { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' }
                );
            } catch (err) {
                console.error('❌ [/updatestatus callback] Error:', err.message);
                try { await bot.answerCallbackQuery(query.id, { text: '⚠️ Failed.' }); } catch (_) {}
            }
        }
        return;
    }
});

// ── Handle export-one search (intercepted by message gate) ──
async function handleExportQuery(chatId, text) {
    try {
        const db = await readDB();
        const q = text.toLowerCase();
        const results = db.filter(s => {
            const fullName = (s.fullName || '').toLowerCase();
            return fullName.includes(q) ||
                   (s.fullName && s.fullName.toLowerCase().includes(q)) ||
                   (s.invoiceId && s.invoiceId.toLowerCase().includes(q));
        });

        if (results.length === 0) {
            return safeSend(chatId, `🔍 No students found matching "*${text}*". Try again.`, { parse_mode: 'Markdown' });
        }

        if (results.length > 1) {
            let msg = `🔍 *${results.length} students found for "${text}":*\n\n`;
            results.forEach((s, i) => {
                msg += `*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\`\n`;
            });
            msg += `\nType a more specific name.`;
            return safeSend(chatId, msg, { parse_mode: 'Markdown' });
        }

        const student = results[0];
        await safeSend(chatId, `⏳ Generating PDF for *${student.firstName} ${student.lastName}*…`, { parse_mode: 'Markdown' });

        const { generateStudentPDF } = require('./pdf');
        const pdfBuffer = await generateStudentPDF(student);
        const filename = `${student.firstName || 'student'}-${student.lastName || 'export'}-${student.invoiceId}.pdf`.replace(/\s+/g, '_');

        await bot.sendDocument(chatId, pdfBuffer, { caption: `📄 ${student.firstName} ${student.lastName} — ${student.invoiceId}` }, { filename, contentType: 'application/pdf' });
    } catch (err) {
        console.error('❌ [/exportpdf one] Error:', err.message);
        await safeSend(chatId, '⚠️ Failed: ' + err.message, { parse_mode: 'Markdown' });
    }
    }
// ==========================================
// PENDING EXPORT STORE
// ==========================================
// ==========================================
// PENDING EXPORT STORE
// ==========================================
const pendingExportQueries = new Set(); // chat IDs awaiting a student name for export

// ==========================================
// PENDING SCORE STORE: /setscore flow
// ==========================================
const pendingScoreQueries = new Map(); // chatId -> { step: 'find'|'score', student }

const pendingExtendQueries = new Map(); // chatId -> { step: 'find'|'days', student }
// chat IDs awaiting a student name for export

// ==========================================
// ADMIN COMMAND: /exportpdf — Export student(s) to PDF
// ==========================================
// /exportpdf → shows inline buttons: [Export All] 
bot.onText(/^\/exportpdf$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    const db = await readDB();
    const count = db.length;

    const buttons = {
        reply_markup: {
            inline_keyboard: [
                [ { text: `📦 Export ALL (${count} students)`, callback_data: 'exportall' } ],
            ]
        }
    };

    await safeSend(
        chatId,
        `📄 *Export PDF*

Click below to export the full database as a table.

Database has *${count}* student(s).`,
        { parse_mode: 'Markdown', ...buttons }
    );
});


// ==========================================
// ADMIN COMMAND: /setscore - Set a student's score out of 100
// ==========================================
// /setscore → type the name → type the score
bot.onText(/^\/setscore$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    pendingScoreQueries.set(chatId.toString(), { step: 'find', student: null });
    await safeSend(
        chatId,
        '📊 *Set Score*\n\nType the student\'s name or invoice ID.',
        { parse_mode: 'Markdown' }
    );
});

// ── Handle /setscore query flow ──
async function handleScoreQuery(chatId, text) {
    const session = pendingScoreQueries.get(chatId.toString());
    if (!session) return;

    if (session.step === 'find') {
        try {
            const db = await readDB();
            const q = text.toLowerCase();
            const results = db.filter(s => {
            const fullName = (s.fullName || '').toLowerCase();
            return fullName.includes(q) ||
                   (s.fullName && s.fullName.toLowerCase().includes(q)) ||
                   (s.invoiceId && s.invoiceId.toLowerCase().includes(q));
        });

            if (results.length === 0) {
                pendingScoreQueries.set(chatId.toString(), { step: 'find', student: null });
                return safeSend(chatId, `🔍 No students found matching "*${text}*". Try again.`, { parse_mode: 'Markdown' });
            }

            if (results.length > 1) {
                let msg = `🔍 *${results.length} students found for "${text}":*\n\n`;
                results.forEach((s, i) => {
                    const sc = s.score != null ? `${s.score}/100` : 'N/A';
                    msg += `*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\` — Score: ${sc}\n`;
                });
                msg += `\nType a more specific name.`;
                pendingScoreQueries.set(chatId.toString(), { step: 'find', student: null });
                return safeSend(chatId, msg, { parse_mode: 'Markdown' });
            }

            const student = results[0];
            const currentScore = student.score != null ? `${student.score}/100` : 'N/A';
            pendingScoreQueries.set(chatId.toString(), { step: 'score', student });

            await safeSend(
                chatId,
                `📊 *Set Score*\n\n*Student:* ${student.firstName} ${student.lastName}\n*Invoice:* \`${student.invoiceId}\`\n*Current Score:* ${currentScore}\n\nType the new score (0-100):`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('❌ [/setscore] Error:', err.message);
            await safeSend(chatId, '⚠️ Failed: ' + err.message, { parse_mode: 'Markdown' });
            pendingScoreQueries.delete(chatId.toString());
        }
    } else if (session.step === 'score') {
        const score = parseInt(text.trim());
        if (isNaN(score) || score < 0 || score > 100) {
            await safeSend(chatId, '❌ Invalid score. Type a number between 0 and 100.', { parse_mode: 'Markdown' });
            return;
        }

        const student = session.student;
        try {
            let result = null;
            await withDB(db => {
                const s = db.find(x => x.invoiceId === student.invoiceId);
                if (s) {
                    s.score = score;
                    result = {
                        name: `${s.fullName}`,
                        invoiceId: s.invoiceId,
                        score: score,
                    };
                }
            });

            pendingScoreQueries.delete(chatId.toString());

            if (!result) {
                return safeSend(chatId, '❌ *Student not found* — may have been deleted.', { parse_mode: 'Markdown' });
            }

            await safeSend(
                chatId,
                `✅ *Score Updated*\n\n*Student:* ${result.name}\n*Invoice:* \`${result.invoiceId}\`\n*New Score:* ${result.score}/100`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('❌ [/setscore] Error:', err.message);
            await safeSend(chatId, '⚠️ Failed: ' + err.message, { parse_mode: 'Markdown' });
            pendingScoreQueries.delete(chatId.toString());
        }
    }
}

// ==========================================
// ADMIN COMMAND: /addquiz - Record a quiz score from a replied message
// ==========================================
// Usage: Reply directly to the forwarded quiz message with /addquiz
bot.onText(/^\/addquiz$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    if (!msg.reply_to_message) {
        return safeSend(chatId, '❌ *Usage:* Reply to the quiz result message and type `/addquiz`.', { parse_mode: 'Markdown' });
    }

    const originalText = msg.reply_to_message.text || '';
    
    // We expect the message format to be: Quiz: <Name> | Username: <@username> | Score: <Number>
    const match = originalText.match(/Quiz:\s*(.+?)\s*\|\s*Username:\s*(@?\w+)\s*\|\s*Score:\s*([\d.]+)/i);
    
    if (!match) {
        return safeSend(chatId, '❌ Could not parse the message. Ensure the format is:\n`Quiz: <Name> | Username: <@username> | Score: <Score>`', { parse_mode: 'Markdown' });
    }

    const quizName = match[1].trim();
    const rawUsername = match[2].trim();
    const usernameToFind = rawUsername.replace('@', '').toLowerCase(); // remove @ for matching
    const quizScore = parseFloat(match[3]);

    try {
        const db = await readDB();
        const student = db.find(s => s.username && s.username.replace('@', '').toLowerCase() === usernameToFind);

        if (!student) {
            return safeSend(chatId, `❌ No student found with username *${rawUsername}*. Make sure they used /start to link their account.`, { parse_mode: 'Markdown' });
        }

        await withDB(db2 => {
            const s = db2.find(x => x.invoiceId === student.invoiceId);
            if (s) {
                // Initialize quizScores object if it doesn't exist
                if (!s.quizScores) s.quizScores = {}; 
                
                // Save the score for this specific quiz
                s.quizScores[quizName] = quizScore;   
                
                // Calculate cumulative score out of 100 (using average of all quizzes taken)
                const scores = Object.values(s.quizScores);
                const sum = scores.reduce((acc, curr) => acc + curr, 0);
                s.score = parseFloat((sum / scores.length).toFixed(2)); // Average score out of 100
            }
        });

        await safeSend(
            chatId,
            `✅ *Quiz Score Recorded*\n\n*Student:* ${student.firstName} ${student.lastName}\n*Quiz:* ${quizName}\n*Score:* ${quizScore}\n\n📊 *Updated Total Score:* ${student.score}/100`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error('❌ [/addquiz] Error:', err.message);
        await safeSend(chatId, '⚠️ Failed to record quiz score: ' + err.message, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND 6: /help - Show Available Commands
// ==========================================
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    const helpMessage = `
🤖 *Admin Commands*

*📋 View & Export*
\`/getall\` — List all students with status
\`/search\` — Search by name, invoice ID, wilaya, specialty, school, or status
\`\`/exportpdf\` — Export all students to PDF (table format)

*✏️ Manage Students*
\`/updatestatus\` — Change a student's status (paid/pending/warned/kicked)
\`/delete\` — Delete a student (with confirmation)
\`/addquiz\` — Record a quiz score (reply to the bot's forwarded message)
\`/setscore\` — Set a student's score (0-100)
\`/sendlink <invoiceId>\` — Send a payment renewal link to a student
\`/extend\` — Add days to a student's subscription

📌 *How to use the new prompt-based commands:*
\`/search\` → type the student's name or invoice ID
\`/updatestatus\` → type the name → click the new status button
\`/delete\` → type the name → click *Delete* or *Cancel*
\`\`/exportpdf\` → click *Export ALL* to download the table

📌 *Classic commands:*
\`/sendlink inv_12345\`
\`/extend\` → type the name → type number of days
\`/setscore\` → type the name → type score (0-100)
`;

    await safeSend(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// ==========================================
// ADMIN COMMAND: /sendlink - Manually send a payment link to a student
// ==========================================
bot.onText(/\/sendlink (.+)/, async (msg, match) => {
    const adminChatId = msg.chat.id;
    if (!isAuthorized(adminChatId)) return;

    try {
        const invoiceId = match[1].trim();
        const db        = await readDB();
        const student   = db.find(s => s.invoiceId === invoiceId);

        if (!student) {
            return safeSend(adminChatId, `❌ *Student not found* with invoice ID: \`${invoiceId}\``, { parse_mode: 'Markdown' });
        }

        if (!student.chatId) {
            return safeSend(adminChatId, `⚠️ *${student.firstName} ${student.lastName}* has not linked their Telegram account yet — cannot send the link.`, { parse_mode: 'Markdown' });
        }

        await safeSend(adminChatId, `⏳ Generating payment link for *${student.firstName} ${student.lastName}*…`, { parse_mode: 'Markdown' });

        const checkoutUrl = await createRenewalLink(student);
        await safeSend(student.chatId, `💰 *Payment Link*\n\nHere is your payment link to renew your subscription:\n\n${checkoutUrl}${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        await safeSend(adminChatId, `✅ Payment link sent to *${student.firstName} ${student.lastName}*.`, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('❌ [/sendlink] Error:', error.message);
        await safeSend(adminChatId, `⚠️ Failed to send payment link: ${error.message}`);
    }
});

// ==========================================
// ADMIN COMMAND: /extend - Add days to a student's subscription
// ==========================================
// Step 1: /extend → bot asks for name
// Step 2: Type name → bot finds student → shows current info
// Step 3: Bot asks "How many days?" → you type the number
// Step 4: Bot updates DB → sends YOU the notification text to forward
bot.onText(/^\/extend$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    pendingExtendQueries.set(chatId.toString(), { step: 'find', student: null });
    await safeSend(
        chatId,
        '📅 *Extend Subscription*\n\nType the student\'s name or invoice ID.',
        { parse_mode: 'Markdown' }
    );
});

// ── Handle /extend query flow (intercepted by message gate) ──
async function handleExtendQuery(chatId, text) {
    const session = pendingExtendQueries.get(chatId.toString());
    if (!session) return;

    if (session.step === 'find') {
        // Searching for the student
        try {
            const db = await readDB();
            const q = text.toLowerCase();
            const results = db.filter(s => {
            const fullName = (s.fullName || '').toLowerCase();
            return fullName.includes(q) ||
                   (s.fullName && s.fullName.toLowerCase().includes(q)) ||
                   (s.invoiceId && s.invoiceId.toLowerCase().includes(q));
            });
            
            if (results.length === 0) {
                pendingExtendQueries.set(chatId.toString(), { step: 'find', student: null });
                return safeSend(chatId, `🔍 No students found matching "*${text}*". Try again.`, { parse_mode: 'Markdown' });
            }

            if (results.length > 1) {
                let msg = `🔍 *${results.length} students found for "${text}":*\n\n`;
                results.forEach((s, i) => {
                    const endDate = s.subscriptionEndDate ? s.subscriptionEndDate.split('T')[0] : 'N/A';
                    msg += `*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\` — ${s.status} — Ends: ${endDate}\n`;
                });
                msg += `\nType a more specific name.`;
                pendingExtendQueries.set(chatId.toString(), { step: 'find', student: null });
                return safeSend(chatId, msg, { parse_mode: 'Markdown' });
            }

            // One match — show current info and ask for days
            const student = results[0];
            const endDate = student.subscriptionEndDate ? student.subscriptionEndDate.split('T')[0] : 'N/A';
            pendingExtendQueries.set(chatId.toString(), { step: 'days', student });

            await safeSend(
                chatId,
                `📅 *Extend Subscription*\n\n*Student:* ${student.firstName} ${student.lastName}\n*Invoice:* \`${student.invoiceId}\`\n*Status:* ${student.status}\n*Current End Date:* ${endDate}\n\nHow many days to add? (e.g. 7)`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('❌ [/extend] Error:', err.message);
            await safeSend(chatId, '⚠️ Failed: ' + err.message, { parse_mode: 'Markdown' });
            pendingExtendQueries.delete(chatId.toString());
        }
    } else if (session.step === 'days') {
        // Received the number of days
        const days = parseInt(text.trim());
        if (isNaN(days) || days <= 0) {
            await safeSend(chatId, `❌ Invalid number. Type a positive number (e.g. 7)`, { parse_mode: 'Markdown' });
            return;
        }

        const student = session.student;
        try {
            let result = null;
            await withDB(db => {
                const s = db.find(x => x.invoiceId === student.invoiceId);
                if (s) {
                    const currentEnd = s.subscriptionEndDate ? new Date(s.subscriptionEndDate) : new Date();
                    const newEnd = new Date(currentEnd);
                    newEnd.setDate(newEnd.getDate() + days);
                    s.subscriptionEndDate = newEnd.toISOString();
                    s.status = 'paid';
                    s.warnedTimestamp = null;
                    s.linkSentTimestamp = null;
                    result = {
                        name: `${s.fullName}`,
                        invoiceId: s.invoiceId,
                        oldEnd: currentEnd.toISOString().split('T')[0],
                        newEnd: newEnd.toISOString().split('T')[0],
                        days: days,
                    };
                }
            });

            pendingExtendQueries.delete(chatId.toString());

            if (!result) {
                return safeSend(chatId, `❌ *Student not found* — may have been deleted.`, { parse_mode: 'Markdown' });
            }

            // Send the notification to YOU (admin) to forward
            await safeSend(
                chatId,
                `✅ *Subscription Extended*\n\n*Student:* ${result.name}\n*Invoice:* \`${result.invoiceId}\`\n*Added:* ${result.days} day(s)\n*Old End Date:* ${result.oldEnd}\n*New End Date:* ${result.newEnd}\n\n📋 *Copy this to forward to the student:*\n\n📅 *Subscription Updated!*\n\nYour renewal date has been adjusted by the admin. Your new due date is: *${result.newEnd}*.\n\nIf you have any questions, contact the admin.`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('❌ [/extend] Error:', err.message);
            await safeSend(chatId, '⚠️ Failed: ' + err.message, { parse_mode: 'Markdown' });
            pendingExtendQueries.delete(chatId.toString());
        }
    }
}

// ==========================================
// HELPER: Format a student record as a Telegram card
// ==========================================
function formatStudentCard(student) {
    const nizamiText = student.isNizami ? 'نظامي' : 'حر';
    const scoreText = student.score != null ? `${student.score}/100` : 'N/A';
    return `
👤 *Student Details*

*Name:* ${student.fullName}
*Telegram:* ${student.username || 'N/A'}
*Invoice:* \`${student.invoiceId}\`
*Date of Birth:* ${student.dob}
*Wilaya:* ${student.wilaya}
*Specialty:* ${student.shaba}
*School Type:* ${nizamiText}
*School Name:* ${student.schoolName}

📊 *Score:* ${scoreText}

💳 *Payment Info*
*Status:* ${student.status}
*Renewals:* ${student.renewalCount || 0} month(s) paid
*Start Date:* ${student.subscriptionStartDate ? student.subscriptionStartDate.split('T')[0] : 'N/A'}
*Expires:* ${student.subscriptionEndDate ? student.subscriptionEndDate.split('T')[0] : 'N/A'}

📱 *Telegram*
*Chat ID:* ${student.chatId || 'Not linked'}
`;
}

// ==========================================
// FEATURE 3: DAILY 8:00 AM CRON JOB (Reminders & Due Links)
// ==========================================
cron.schedule('0 8 * * *', async () => {
    console.log('Running 8:00 AM subscription check...');

    let db;
    try {
        db = await readDB();
    } catch (error) {
        console.error('❌ [cron:daily] Cannot read database, skipping run:', error.message);
        return;
    }

    const now = new Date();

    // Collect expiring students to send the admin a single summary
    const expiringSoon = []; // paid students expiring in 1–6 days

    for (const student of db) {
        if (!student.subscriptionEndDate || !student.chatId) continue;
        if (student.status === 'kicked') continue;

        try {
            const endDate  = new Date(student.subscriptionEndDate);
            const diffTime = endDate - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 6 && diffDays >= 1 && student.status === 'paid') {
                // Remind the student
                await safeSend(student.chatId, `⏳ *Reminder!*\n\nYour subscription expires in ${diffDays} day(s). Please prepare for the next payment.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                // Collect for admin summary
                expiringSoon.push({ student, diffDays });
            }

            if (diffDays <= 0 && student.status === 'paid') {
                try {
                    const checkoutUrl = await createRenewalLink(student);
                    await safeSend(student.chatId, `💰 *Payment Due Today!*\n\nYour monthly subscription has ended. Please renew your access:\n\n${checkoutUrl}${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                } catch (err) {
                    console.error(`❌ [cron:daily] Failed to create renewal link for ${student.firstName}:`, err.message);
                }
            }
        } catch (error) {
            console.error(`❌ [cron:daily] Error processing ${student.firstName} ${student.lastName}:`, error.message);
        }
    }

    // Send admin a daily summary of expiring subscriptions
    if (expiringSoon.length > 0) {
        let adminMsg = `📅 *Daily Expiry Alert — ${expiringSoon.length} student(s) expiring soon:*\n\n`;
        expiringSoon.forEach(({ student: s, diffDays }) => {
            adminMsg += `• *${s.fullName}* — ${diffDays} day(s) left\n`;
            adminMsg += `  Invoice: \`${s.invoiceId}\`\n`;
            adminMsg += `  ➡️ Use /sendlink ${s.invoiceId} to send them a payment link\n\n`;
        });
        await safeSend(process.env.TELEGRAM_CHAT_ID, adminMsg, { parse_mode: 'Markdown' });
    }
}, { timezone: 'Africa/Algiers' });

// ==========================================
// FEATURE 4: NON-PAYMENT ENFORCEMENT (Runs every hour)
// ==========================================
cron.schedule('0 * * * *', async () => {
    console.log('Running hourly check for warnings and kicks...');

    let db;
    try {
        db = await readDB();
    } catch (error) {
        console.error('❌ [cron:hourly] Cannot read database, skipping run:', error.message);
        return;
    }

    const now = new Date();

    for (const student of db) {
        if (!student.chatId) continue;

        try {
            if (student.status === 'pending' && student.linkSentTimestamp) {
                const hoursPassedLink = (now - new Date(student.linkSentTimestamp)) / (1000 * 60 * 60);

                if (hoursPassedLink >= 20 && !student.warnedTimestamp) {
                    await withDB(db2 => {
                        const s = db2.find(x => x.invoiceId === student.invoiceId);
                        if (s && s.status === 'pending' && !s.warnedTimestamp) {
                            s.status          = 'warned';
                            s.warnedTimestamp = now.toISOString();
                        }
                    });
                    await safeSend(student.chatId, `🚨 *FINAL WARNING!*\n\nYour payment is severely overdue. You have exactly 4 hours to complete your payment before you are automatically removed from the group.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                }
            }

            if (student.status === 'warned' && student.warnedTimestamp) {
                const hoursPassedWarning = (now - new Date(student.warnedTimestamp)) / (1000 * 60 * 60);

                if (hoursPassedWarning >= 4) {
                    try {
                        await bot.banChatMember(process.env.TELEGRAM_GROUP_CHAT_ID, student.chatId);
                        await safeSend(student.chatId, `❌ *Access Removed*\n\nYou did not complete the payment within the allotted time. You have been removed from the group. Contact support if this is a mistake.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                        await withDB(db2 => {
                            const s = db2.find(x => x.invoiceId === student.invoiceId);
                            if (s) s.status = 'kicked';
                        });
                    } catch (err) {
                        console.error(`❌ [cron:hourly] Failed to kick ${student.chatId}. Is the bot an admin? Error:`, err.message);
                    }
                }
            }
        } catch (error) {
            console.error(`❌ [cron:hourly] Error processing ${student.firstName} ${student.lastName}:`, error.message);
        }
    }
}, { timezone: 'Africa/Algiers' });

console.log('🤖 Telegram Bot is running...');

// Notify admin that the bot process has (re)started.
// The admin will need to re-verify their session since sessions are in-memory.
(async () => {
    try {
        const adminId = (process.env.TELEGRAM_CHAT_ID || '').trim();
        if (adminId) {
            await safeSend(adminId, '🤖 *Bot is online and ready.*\n\nSend your Chat ID to begin your session.', { parse_mode: 'Markdown' });
        }
    } catch (e) {
        console.error('⚠️ Could not send startup notification:', e.message);
    }
})();
